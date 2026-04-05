import type { Database } from "sql.js";
import type { GtfsData } from "../types/gtfs";

export function createSchema(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS agency (
			agency_id TEXT PRIMARY KEY,
			agency_name TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS stops (
			stop_id TEXT PRIMARY KEY,
			stop_name TEXT NOT NULL,
			stop_lat REAL NOT NULL,
			stop_lon REAL NOT NULL,
			zone_id TEXT
		);
		CREATE TABLE IF NOT EXISTS routes (
			route_id TEXT PRIMARY KEY,
			agency_id TEXT NOT NULL,
			route_short_name TEXT,
			route_long_name TEXT
		);
		CREATE TABLE IF NOT EXISTS trips (
			trip_id TEXT PRIMARY KEY,
			route_id TEXT NOT NULL,
			service_id TEXT NOT NULL,
			trip_headsign TEXT,
			shape_id TEXT
		);
		CREATE TABLE IF NOT EXISTS stop_times (
			trip_id TEXT NOT NULL,
			arrival_time TEXT NOT NULL,
			departure_time TEXT NOT NULL,
			stop_id TEXT NOT NULL,
			stop_sequence INTEGER NOT NULL,
			PRIMARY KEY (trip_id, stop_sequence)
		);
		CREATE TABLE IF NOT EXISTS calendar (
			service_id TEXT PRIMARY KEY,
			monday INTEGER,
			tuesday INTEGER,
			wednesday INTEGER,
			thursday INTEGER,
			friday INTEGER,
			saturday INTEGER,
			sunday INTEGER,
			start_date TEXT,
			end_date TEXT
		);
		CREATE TABLE IF NOT EXISTS calendar_dates (
			service_id TEXT NOT NULL,
			date TEXT NOT NULL,
			exception_type INTEGER NOT NULL,
			PRIMARY KEY (service_id, date)
		);
		CREATE TABLE IF NOT EXISTS shapes (
			shape_id TEXT NOT NULL,
			shape_pt_lat REAL NOT NULL,
			shape_pt_lon REAL NOT NULL,
			shape_pt_sequence INTEGER NOT NULL,
			PRIMARY KEY (shape_id, shape_pt_sequence)
		);
		CREATE TABLE IF NOT EXISTS fare_attributes (
			fare_id TEXT PRIMARY KEY,
			price REAL NOT NULL,
			currency_type TEXT NOT NULL,
			payment_method INTEGER NOT NULL,
			transfers TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS fare_rules (
			fare_id TEXT NOT NULL,
			route_id TEXT,
			origin_id TEXT,
			destination_id TEXT
		);

		CREATE INDEX IF NOT EXISTS idx_stop_times_trip_id ON stop_times (trip_id);
		CREATE INDEX IF NOT EXISTS idx_stop_times_stop_id ON stop_times (stop_id);
		CREATE INDEX IF NOT EXISTS idx_stop_times_departure ON stop_times (departure_time);
		CREATE INDEX IF NOT EXISTS idx_trips_route_id ON trips (route_id);
		CREATE INDEX IF NOT EXISTS idx_trips_service_id ON trips (service_id);
		CREATE INDEX IF NOT EXISTS idx_stops_stop_name ON stops (stop_name);
		CREATE INDEX IF NOT EXISTS idx_fare_rules_route_id ON fare_rules (route_id);
		CREATE INDEX IF NOT EXISTS idx_fare_rules_origin_dest ON fare_rules (origin_id, destination_id);
	`);
}

function runWithStmt(db: Database, sql: string, rows: unknown[][]): void {
	const stmt = db.prepare(sql);
	try {
		for (const row of rows) {
			stmt.run(row);
		}
	} finally {
		stmt.free();
	}
}

export function loadGtfsData(
	db: Database,
	data: GtfsData,
	operatorId: string,
): void {
	const ns = (id: string) => `${operatorId}:${id}`;

	db.run("BEGIN TRANSACTION");
	try {
		if (data.agency.length) {
			runWithStmt(
				db,
				"INSERT INTO agency (agency_id, agency_name) VALUES (?, ?)",
				data.agency.map((a) => [ns(a.agency_id), a.agency_name]),
			);
		}

		if (data.stops.length) {
			runWithStmt(
				db,
				"INSERT INTO stops (stop_id, stop_name, stop_lat, stop_lon, zone_id) VALUES (?, ?, ?, ?, ?)",
				data.stops.map((s) => [
					ns(s.stop_id),
					s.stop_name,
					s.stop_lat,
					s.stop_lon,
					s.zone_id ? ns(s.zone_id) : null,
				]),
			);
		}

		if (data.routes.length) {
			runWithStmt(
				db,
				"INSERT INTO routes (route_id, agency_id, route_short_name, route_long_name) VALUES (?, ?, ?, ?)",
				data.routes.map((r) => [
					ns(r.route_id),
					ns(r.agency_id),
					r.route_short_name ?? null,
					r.route_long_name ?? null,
				]),
			);
		}

		if (data.trips.length) {
			runWithStmt(
				db,
				"INSERT INTO trips (trip_id, route_id, service_id, trip_headsign, shape_id) VALUES (?, ?, ?, ?, ?)",
				data.trips.map((t) => [
					ns(t.trip_id),
					ns(t.route_id),
					ns(t.service_id),
					t.trip_headsign ?? null,
					t.shape_id ? ns(t.shape_id) : null,
				]),
			);
		}

		if (data.stop_times.length) {
			runWithStmt(
				db,
				"INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence) VALUES (?, ?, ?, ?, ?)",
				data.stop_times.map((st) => [
					ns(st.trip_id),
					st.arrival_time,
					st.departure_time,
					ns(st.stop_id),
					st.stop_sequence,
				]),
			);
		}

		if (data.calendar.length) {
			runWithStmt(
				db,
				"INSERT INTO calendar (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
				data.calendar.map((c) => [
					ns(c.service_id),
					c.monday,
					c.tuesday,
					c.wednesday,
					c.thursday,
					c.friday,
					c.saturday,
					c.sunday,
					c.start_date,
					c.end_date,
				]),
			);
		}

		if (data.calendar_dates.length) {
			runWithStmt(
				db,
				"INSERT INTO calendar_dates (service_id, date, exception_type) VALUES (?, ?, ?)",
				data.calendar_dates.map((cd) => [
					ns(cd.service_id),
					cd.date,
					cd.exception_type,
				]),
			);
		}

		if (data.shapes.length) {
			runWithStmt(
				db,
				"INSERT INTO shapes (shape_id, shape_pt_lat, shape_pt_lon, shape_pt_sequence) VALUES (?, ?, ?, ?)",
				data.shapes.map((s) => [
					ns(s.shape_id),
					s.shape_pt_lat,
					s.shape_pt_lon,
					s.shape_pt_sequence,
				]),
			);
		}

		if (data.fare_attributes.length) {
			runWithStmt(
				db,
				"INSERT INTO fare_attributes (fare_id, price, currency_type, payment_method, transfers) VALUES (?, ?, ?, ?, ?)",
				data.fare_attributes.map((fa) => [
					ns(fa.fare_id),
					fa.price,
					fa.currency_type,
					fa.payment_method,
					fa.transfers,
				]),
			);
		}

		if (data.fare_rules.length) {
			runWithStmt(
				db,
				"INSERT INTO fare_rules (fare_id, route_id, origin_id, destination_id) VALUES (?, ?, ?, ?)",
				data.fare_rules.map((fr) => [
					ns(fr.fare_id),
					fr.route_id ? ns(fr.route_id) : null,
					fr.origin_id ? ns(fr.origin_id) : null,
					fr.destination_id ? ns(fr.destination_id) : null,
				]),
			);
		}

		db.run("COMMIT");
	} catch (e) {
		db.run("ROLLBACK");
		throw e;
	}
}
