import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	MapContainer,
	Marker,
	Polyline,
	Popup,
	TileLayer,
	Tooltip,
} from "react-leaflet";
import type { Database } from "sql.js";
import { findClosestPointIndex } from "../lib/geo-utils";
import { getShapePoints, getStopsForTrip } from "../lib/shape-query";
import "leaflet/dist/leaflet.css";

// Vite 環境では Leaflet の _getIconUrl が CSS からベースパスを自動検出し、
// バンドラーが解決した URL と二重パスになるため削除して明示的に設定する
// biome-ignore lint/performance/noDelete: Leaflet 内部メソッドの除去が必要
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)
	._getIconUrl;
L.Icon.Default.mergeOptions({
	iconUrl: markerIcon,
	iconRetinaUrl: markerIcon2x,
	shadowUrl: markerShadow,
});

const ASAHIKAWA_CENTER: [number, number] = [43.7706, 142.3649];
const DEFAULT_ZOOM = 13;

/** 全経路の色 */
const ROUTE_COLOR_BASE = "#E8E8E8";
/** ハイライト区間の色 */
const ROUTE_COLOR_SECTION = "#3B82F6";
/** ハイライト区間のホバー色 */
const ROUTE_COLOR_SECTION_HOVER = "#1D4ED8";

/** 全経路の線幅 */
const BASE_WEIGHT = 6;
/** ハイライト区間の線幅 */
const SECTION_WEIGHT = 10;

type MapRoute = {
	tripId: string;
	shapeId?: string;
	fromStopId: string;
	toStopId: string;
};

type MapViewProps = {
	db: Database;
	routes: MapRoute[];
	/** 経路ホバー時に呼ばれるコールバック（null でホバー解除） */
	onRouteHover?: (key: string | null) => void;
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

function MapView({ db, routes, onRouteHover }: MapViewProps) {
	const { markers, basePolylines, highlightPolylines } = useMemo(() => {
		const markersMap = new Map<
			string,
			{ name: string; lat: number; lon: number }
		>();
		const baseArr: PolylineData[] = [];
		const highlightArr: HighlightPolylineData[] = [];
		const seenBaseKeys = new Set<string>();
		const seenHighlightKeys = new Set<string>();

		for (const route of routes) {
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

			// 全経路の座標を取得
			let fullPoints: { lat: number; lon: number }[];
			if (route.shapeId) {
				fullPoints = getShapePoints(db, route.shapeId);
			} else {
				fullPoints = getStopsForTrip(db, route.tripId);
			}

			const positions = fullPoints.map(
				(p) => [p.lat, p.lon] as [number, number],
			);

			if (positions.length === 0) continue;

			// 全経路ポリライン（shape/trip 単位で重複排除）
			const baseKey = route.shapeId
				? `shape:${route.shapeId}`
				: `trip:${route.tripId}`;

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
						routeKey: `${route.fromStopId}-${route.toStopId}`,
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

	return (
		<MapContainer
			center={ASAHIKAWA_CENTER}
			zoom={DEFAULT_ZOOM}
			style={{ height: "400px", width: "100%" }}
		>
			<TileLayer
				url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
			/>
			{[...markers.entries()].map(([stopId, stop]) => (
				<Marker key={stopId} position={[stop.lat, stop.lon]}>
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
			{highlightPolylines.map((pl) => (
				<Polyline
					key={`hl-${pl.key}`}
					positions={pl.positions}
					pathOptions={{
						color:
							hoveredKey === pl.key
								? ROUTE_COLOR_SECTION_HOVER
								: ROUTE_COLOR_SECTION,
						weight: SECTION_WEIGHT,
						opacity: 0.9,
					}}
					eventHandlers={{
						mouseover: () => handleMouseOver(pl.key),
						mouseout: handleMouseOut,
					}}
				>
					<Tooltip sticky>
						{pl.fromStopName} → {pl.toStopName}
					</Tooltip>
				</Polyline>
			))}
		</MapContainer>
	);
}

export { MapView };
export type { MapRoute };
