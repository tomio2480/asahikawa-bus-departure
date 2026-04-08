import type { Database } from "sql.js";

export type LatLon = {
	lat: number;
	lon: number;
};

export function getShapePoints(db: Database, shapeId: string): LatLon[] {
	const stmt = db.prepare(
		"SELECT shape_pt_lat, shape_pt_lon FROM shapes WHERE shape_id = ? ORDER BY shape_pt_sequence",
	);
	try {
		stmt.bind([shapeId]);
		const points: LatLon[] = [];
		while (stmt.step()) {
			const row = stmt.getAsObject();
			points.push({
				lat: row.shape_pt_lat as number,
				lon: row.shape_pt_lon as number,
			});
		}
		return points;
	} finally {
		stmt.free();
	}
}

export function getStopsForTrip(db: Database, tripId: string): LatLon[] {
	const stmt = db.prepare(
		`SELECT s.stop_lat, s.stop_lon
		 FROM stop_times st
		 JOIN stops s ON s.stop_id = st.stop_id
		 WHERE st.trip_id = ?
		 ORDER BY st.stop_sequence`,
	);
	try {
		stmt.bind([tripId]);
		const stops: LatLon[] = [];
		while (stmt.step()) {
			const row = stmt.getAsObject();
			stops.push({
				lat: row.stop_lat as number,
				lon: row.stop_lon as number,
			});
		}
		return stops;
	} finally {
		stmt.free();
	}
}
