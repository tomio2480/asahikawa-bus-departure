import { useCallback, useMemo, useState } from "react";
import {
	MapContainer,
	Marker,
	Polyline,
	Popup,
	TileLayer,
} from "react-leaflet";
import type { Database } from "sql.js";
import { getShapePoints, getStopsForTrip } from "../lib/shape-query";
import "leaflet/dist/leaflet.css";

const ASAHIKAWA_CENTER: [number, number] = [43.7706, 142.3649];
const DEFAULT_ZOOM = 13;
const ROUTE_COLOR_DEFAULT = "#CCCCCC";
const ROUTE_COLOR_HIGHLIGHT = "#3B82F6";

type MapRoute = {
	tripId: string;
	shapeId?: string;
	fromStopId: string;
	toStopId: string;
};

type MapViewProps = {
	db: Database;
	routes: MapRoute[];
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

function MapView({ db, routes }: MapViewProps) {
	const { markers, polylines } = useMemo(() => {
		const markersMap = new Map<
			string,
			{ name: string; lat: number; lon: number }
		>();
		const polylinesArr: {
			key: string;
			positions: [number, number][];
			color: string;
		}[] = [];
		const seenPolylineKeys = new Set<string>();

		for (const route of routes) {
			if (!markersMap.has(route.fromStopId)) {
				const fromStop = getStopInfo(db, route.fromStopId);
				if (fromStop) {
					markersMap.set(route.fromStopId, fromStop);
				}
			}
			if (!markersMap.has(route.toStopId)) {
				const toStop = getStopInfo(db, route.toStopId);
				if (toStop) {
					markersMap.set(route.toStopId, toStop);
				}
			}

			let positions: [number, number][];

			if (route.shapeId) {
				const shapePoints = getShapePoints(db, route.shapeId);
				positions = shapePoints.map((p) => [p.lat, p.lon] as [number, number]);
			} else {
				const stopPoints = getStopsForTrip(db, route.tripId);
				positions = stopPoints.map((p) => [p.lat, p.lon] as [number, number]);
			}

			const polylineKey = route.shapeId
				? `shape:${route.shapeId}`
				: `trip:${route.tripId}`;

			if (positions.length > 0 && !seenPolylineKeys.has(polylineKey)) {
				seenPolylineKeys.add(polylineKey);
				polylinesArr.push({
					key: polylineKey,
					positions,
					color: ROUTE_COLOR_DEFAULT,
				});
			}
		}

		return { markers: markersMap, polylines: polylinesArr };
	}, [db, routes]);

	const [hoveredKey, setHoveredKey] = useState<string | null>(null);

	const handleMouseOver = useCallback((key: string) => {
		setHoveredKey(key);
	}, []);

	const handleMouseOut = useCallback(() => {
		setHoveredKey(null);
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
			{polylines.map((pl) => (
				<Polyline
					key={pl.key}
					positions={pl.positions}
					pathOptions={{
						color:
							hoveredKey === pl.key
								? ROUTE_COLOR_HIGHLIGHT
								: ROUTE_COLOR_DEFAULT,
					}}
					eventHandlers={{
						mouseover: () => handleMouseOver(pl.key),
						mouseout: handleMouseOut,
					}}
				/>
			))}
		</MapContainer>
	);
}

export { MapView };
export type { MapRoute };
