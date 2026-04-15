import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	MapContainer,
	Marker,
	Pane,
	Polyline,
	Popup,
	TileLayer,
	Tooltip,
	useMap,
} from "react-leaflet";
import type { Database } from "sql.js";
import { findClosestPointIndex } from "../lib/geo-utils";
import { getShapePoints, getStopsForTrip } from "../lib/shape-query";
import "leaflet/dist/leaflet.css";

// Vite 環境では Leaflet デフォルトアイコンのパス解決が壊れるため、
// カスタムアイコンインスタンスを作成して Marker に明示的に渡す
const defaultIcon = new L.Icon({
	iconUrl: markerIcon,
	iconRetinaUrl: markerIcon2x,
	shadowUrl: markerShadow,
	iconSize: [25, 41],
	iconAnchor: [12, 41],
	popupAnchor: [1, -34],
	shadowSize: [41, 41],
});

const ASAHIKAWA_CENTER: [number, number] = [43.7706, 142.3649];
const DEFAULT_ZOOM = 13;

/** 全経路の色 */
const ROUTE_COLOR_BASE = "#b0c4de";
/** ハイライト区間の色 */
const ROUTE_COLOR_SECTION = "#B0C1E2";
/** ハイライト区間の固定色 */
const ROUTE_COLOR_SECTION_PINNED = "#6D8CC6";
/** ハイライト区間のホバー色 */
const ROUTE_COLOR_SECTION_HOVER = "#375FA9";

/** 全経路の線幅 */
const BASE_WEIGHT = 6;
/** ハイライト区間の線幅 */
const SECTION_WEIGHT = 10;

type MapRoute = {
	tripId: string;
	routeId: string;
	shapeId?: string;
	fromStopId: string;
	toStopId: string;
};

type MapViewProps = {
	db: Database;
	routes: MapRoute[];
	/** 経路ホバー時に呼ばれるコールバック（null でホバー解除） */
	onRouteHover?: (key: string | null) => void;
	/** ホバーまたは固定中の経路キー */
	hoveredRouteKey?: string | null;
	/** 固定中の経路キー */
	pinnedRouteKey?: string | null;
	/** 経路クリック時のトグルコールバック */
	onRoutePinToggle?: (key: string) => void;
};

type PolylineData = {
	key: string;
	positions: [number, number][];
};

type HighlightPolylineData = PolylineData & {
	/** 経路単位のキー（fromStopId-toStopId） */
	routeKey: string;
	fromStopName: string;
	toStopName: string;
};

function getStopInfo(
	db: Database,
	stopId: string,
): { name: string; lat: number; lon: number } | null {
	const stmt = db.prepare(
		"SELECT stop_name, stop_lat, stop_lon FROM stops WHERE stop_id = ?",
	);
	try {
		stmt.bind([stopId]);
		if (stmt.step()) {
			const row = stmt.getAsObject();
			return {
				name: row.stop_name as string,
				lat: row.stop_lat as number,
				lon: row.stop_lon as number,
			};
		}
		return null;
	} finally {
		stmt.free();
	}
}

/** タイルペインにセピアフィルタを適用するための CSS フィルタ */
const TILE_FILTER_LIGHT = "sepia(0.3) brightness(1.05) saturate(0.8)";
const TILE_FILTER_DARK =
	"sepia(0.3) brightness(0.6) saturate(0.8) invert(1) hue-rotate(180deg)";

/**
 * 全マーカー・ポリラインの座標から地図の表示範囲を自動調整する。
 * ルートやマーカーが存在しない場合はデフォルトの中心・ズームを維持する。
 */
function FitBounds({
	positions,
}: { positions: [number, number][] }) {
	const map = useMap();

	useEffect(() => {
		if (positions.length === 0) return;

		const bounds = L.latLngBounds(positions);
		if (bounds.isValid()) {
			map.fitBounds(bounds, { padding: [30, 30] });
		}
	}, [map, positions]);

	return null;
}

/**
 * テーマに応じたセピアフィルタを .leaflet-tile-pane に適用する。
 * data-theme 属性を MutationObserver で監視し、テーマ変更に追従する。
 */
function TileFilter() {
	const [theme, setTheme] = useState<string>(
		() =>
			document.documentElement.getAttribute("data-theme") ?? "light",
	);

	useEffect(() => {
		const observer = new MutationObserver(() => {
			const next =
				document.documentElement.getAttribute("data-theme") ?? "light";
			setTheme(next);
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});
		return () => observer.disconnect();
	}, []);

	const filter = theme === "dark" ? TILE_FILTER_DARK : TILE_FILTER_LIGHT;

	return (
		<style data-testid="map-tile-filter">{`.leaflet-tile-pane { filter: ${filter}; }`}</style>
	);
}

/**
 * 通常スクロールでは地図をズームせず、Ctrl/Cmd+スクロール時のみズームする。
 * モバイルでは二本指操作でのみズームを許可する。
 */
function ScrollZoomHandler() {
	const map = useMap();

	useEffect(() => {
		const container = map.getContainer();

		const handleWheel = (e: WheelEvent) => {
			if (e.ctrlKey || e.metaKey) {
				e.preventDefault();
				if (e.deltaY < 0) {
					map.zoomIn();
				} else {
					map.zoomOut();
				}
			}
		};

		container.addEventListener("wheel", handleWheel, { passive: false });
		return () => {
			container.removeEventListener("wheel", handleWheel);
		};
	}, [map]);

	return null;
}

function MapView({
	db,
	routes,
	onRouteHover,
	hoveredRouteKey,
	pinnedRouteKey,
	onRoutePinToggle,
}: MapViewProps) {
	const { markers, basePolylines, highlightPolylines } = useMemo(() => {
		const markersMap = new Map<
			string,
			{ name: string; lat: number; lon: number }
		>();
		const baseArr: PolylineData[] = [];
		const highlightArr: HighlightPolylineData[] = [];
		const seenBaseKeys = new Set<string>();
		const seenHighlightKeys = new Set<string>();
		const geometryCache = new Map<
			string,
			{
				fullPoints: { lat: number; lon: number }[];
				positions: [number, number][];
			}
		>();

		for (const route of routes) {
			const baseKey = route.shapeId
				? `shape:${route.shapeId}`
				: `trip:${route.tripId}`;

			// マーカー情報の収集
			let fromStop = markersMap.get(route.fromStopId);
			if (!fromStop) {
				const info = getStopInfo(db, route.fromStopId);
				if (info) {
					fromStop = info;
					markersMap.set(route.fromStopId, info);
				}
			}
			let toStop = markersMap.get(route.toStopId);
			if (!toStop) {
				const info = getStopInfo(db, route.toStopId);
				if (info) {
					toStop = info;
					markersMap.set(route.toStopId, info);
				}
			}

			// 全経路の座標を取得（baseKey 単位でキャッシュ）
			let geometry = geometryCache.get(baseKey);
			if (!geometry) {
				const fullPoints = route.shapeId
					? getShapePoints(db, route.shapeId)
					: getStopsForTrip(db, route.tripId);
				const positions = fullPoints.map(
					(p) => [p.lat, p.lon] as [number, number],
				);
				if (positions.length === 0) continue;
				geometry = { fullPoints, positions };
				geometryCache.set(baseKey, geometry);
			}
			const { fullPoints, positions } = geometry;

			// 全経路ポリライン（shape/trip 単位で重複排除）
			if (!seenBaseKeys.has(baseKey)) {
				seenBaseKeys.add(baseKey);
				baseArr.push({ key: baseKey, positions });
			}

			// ハイライト区間（trip+from+to 単位で重複排除）
			const highlightKey = `${route.tripId}-${route.fromStopId}-${route.toStopId}`;
			if (!seenHighlightKeys.has(highlightKey) && fromStop && toStop) {
				seenHighlightKeys.add(highlightKey);

				const fromIdx = findClosestPointIndex(
					fullPoints,
					fromStop.lat,
					fromStop.lon,
				);
				const toIdx = findClosestPointIndex(fullPoints, toStop.lat, toStop.lon);
				const startIdx = Math.min(fromIdx, toIdx);
				const endIdx = Math.max(fromIdx, toIdx);
				const segment = positions.slice(startIdx, endIdx + 1);

				if (segment.length > 0) {
					highlightArr.push({
						key: highlightKey,
						routeKey: `${route.routeId}-${route.fromStopId}-${route.toStopId}`,
						positions: segment,
						fromStopName: fromStop.name,
						toStopName: toStop.name,
					});
				}
			}
		}

		return {
			markers: markersMap,
			basePolylines: baseArr,
			highlightPolylines: highlightArr,
		};
	}, [db, routes]);

	const [hoveredKey, setHoveredKey] = useState<string | null>(null);

	const routeKeyMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const pl of highlightPolylines) {
			map.set(pl.key, pl.routeKey);
		}
		return map;
	}, [highlightPolylines]);

	const onRouteHoverRef = useRef(onRouteHover);
	onRouteHoverRef.current = onRouteHover;

	const onRoutePinToggleRef = useRef(onRoutePinToggle);
	onRoutePinToggleRef.current = onRoutePinToggle;

	const handleClick = useCallback(
		(key: string) => {
			const routeKey = routeKeyMap.get(key);
			if (routeKey) {
				onRoutePinToggleRef.current?.(routeKey);
			}
		},
		[routeKeyMap],
	);

	const handleMouseOver = useCallback(
		(key: string) => {
			setHoveredKey(key);
			onRouteHoverRef.current?.(routeKeyMap.get(key) ?? null);
		},
		[routeKeyMap],
	);

	const handleMouseOut = useCallback(() => {
		setHoveredKey(null);
		onRouteHoverRef.current?.(null);
	}, []);

	// データ更新でホバー中のポリラインが消えた場合に hover 状態を自動解除する
	useEffect(() => {
		if (hoveredKey && !routeKeyMap.has(hoveredKey)) {
			setHoveredKey(null);
			onRouteHoverRef.current?.(null);
		}
	}, [hoveredKey, routeKeyMap]);

	// FitBounds 用: 全マーカー座標とポリライン座標を結合する
	const allPositions = useMemo(() => {
		const positions: [number, number][] = [];
		for (const [, stop] of markers) {
			positions.push([stop.lat, stop.lon]);
		}
		for (const pl of basePolylines) {
			for (const pos of pl.positions) {
				positions.push(pos);
			}
		}
		return positions;
	}, [markers, basePolylines]);

	return (
		<MapContainer
			center={ASAHIKAWA_CENTER}
			zoom={DEFAULT_ZOOM}
			scrollWheelZoom={false}
			style={{ height: "400px", width: "100%" }}
		>
			<FitBounds positions={allPositions} />
			<TileFilter />
			<ScrollZoomHandler />
			<TileLayer
				url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
			/>
			{[...markers.entries()].map(([stopId, stop]) => (
				<Marker key={stopId} position={[stop.lat, stop.lon]} icon={defaultIcon}>
					<Popup>{stop.name}</Popup>
				</Marker>
			))}
			{basePolylines.map((pl) => (
				<Polyline
					key={`base-${pl.key}`}
					positions={pl.positions}
					pathOptions={{
						color: ROUTE_COLOR_BASE,
						weight: BASE_WEIGHT,
						opacity: 0.4,
					}}
				/>
			))}
			{/* 非アクティブなハイライト区間 */}
			<Pane name="highlight-inactive" style={{ zIndex: 450 }}>
				{highlightPolylines
					.filter(
						(pl) =>
							hoveredKey !== pl.key &&
							hoveredRouteKey !== pl.routeKey &&
							pinnedRouteKey !== pl.routeKey,
					)
					.map((pl) => (
						<Polyline
							key={`hl-${pl.key}`}
							positions={pl.positions}
							pathOptions={{
								color: ROUTE_COLOR_SECTION,
								weight: SECTION_WEIGHT,
								opacity: 0.9,
							}}
							eventHandlers={{
								mouseover: () => handleMouseOver(pl.key),
								mouseout: handleMouseOut,
								click: () => handleClick(pl.key),
							}}
						>
							<Tooltip sticky>
								{pl.fromStopName} → {pl.toStopName}
							</Tooltip>
						</Polyline>
					))}
			</Pane>
			{/* 固定中のハイライト区間 */}
			<Pane name="highlight-pinned" style={{ zIndex: 460 }}>
				{highlightPolylines
					.filter(
						(pl) =>
							pinnedRouteKey === pl.routeKey &&
							hoveredKey !== pl.key &&
							hoveredRouteKey !== pl.routeKey,
					)
					.map((pl) => (
						<Polyline
							key={`hl-${pl.key}`}
							positions={pl.positions}
							pathOptions={{
								color: ROUTE_COLOR_SECTION_PINNED,
								weight: SECTION_WEIGHT,
								opacity: 0.9,
							}}
							eventHandlers={{
								mouseover: () => handleMouseOver(pl.key),
								mouseout: handleMouseOut,
								click: () => handleClick(pl.key),
							}}
						>
							<Tooltip sticky>
								{pl.fromStopName} → {pl.toStopName}
							</Tooltip>
						</Polyline>
					))}
			</Pane>
			{/* ホバー中のハイライト区間（最前面） */}
			<Pane name="highlight-hovered" style={{ zIndex: 470 }}>
				{highlightPolylines
					.filter(
						(pl) =>
							hoveredKey === pl.key || hoveredRouteKey === pl.routeKey,
					)
					.map((pl) => (
						<Polyline
							key={`hl-${pl.key}`}
							positions={pl.positions}
							pathOptions={{
								color: ROUTE_COLOR_SECTION_HOVER,
								weight: SECTION_WEIGHT,
								opacity: 0.9,
							}}
							eventHandlers={{
								mouseover: () => handleMouseOver(pl.key),
								mouseout: handleMouseOut,
								click: () => handleClick(pl.key),
							}}
						>
							<Tooltip sticky>
								{pl.fromStopName} → {pl.toStopName}
							</Tooltip>
						</Polyline>
					))}
			</Pane>
		</MapContainer>
	);
}

export { MapView };
export type { MapRoute };
