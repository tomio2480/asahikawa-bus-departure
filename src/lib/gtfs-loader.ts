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
	`);
}

export function loadGtfsData(db: Database, data: GtfsData): void {
	db.run("BEGIN TRANSACTION");
	try {
		if (data.agency.length) {
			const stmt = db.prepare(
				"INSERT INTO agency (agency_id, agency_name) VALUES (?, ?)",
			);
			for (const a of data.agency) {
				stmt.run([a.agency_id, a.agency_name]);
			}
			stmt.free();
		}

		if (data.stops.length) {
			const stmt = db.prepare(
				"INSERT INTO stops (stop_id, stop_name, stop_lat, stop_lon, zone_id) VALUES (?, ?, ?, ?, ?)",
			);
			for (const s of data.stops) {
				stmt.run([
					s.stop_id,
					s.stop_name,
					s.stop_lat,
					s.stop_lon,
					s.zone_id ?? null,
				]);
			}
			stmt.free();
		}

		if (data.routes.length) {
			const stmt = db.prepare(
				"INSERT INTO routes (route_id, agency_id, route_short_name, route_long_name) VALUES (?, ?, ?, ?)",
			);
			for (const r of data.routes) {
				stmt.run([
					r.route_id,
					r.agency_id,
					r.route_short_name ?? null,
					r.route_long_name ?? null,
				]);
			}
			stmt.free();
		}

		if (data.trips.length) {
			const stmt = db.prepare(
				"INSERT INTO trips (trip_id, route_id, service_id, trip_headsign, shape_id) VALUES (?, ?, ?, ?, ?)",
			);
			for (const t of data.trips) {
				stmt.run([
					t.trip_id,
					t.route_id,
					t.service_id,
					t.trip_headsign ?? null,
					t.shape_id ?? null,
				]);
			}
			stmt.free();
		}

		if (data.stop_times.length) {
			const stmt = db.prepare(
				"INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence) VALUES (?, ?, ?, ?, ?)",
			);
			for (const st of data.stop_times) {
				stmt.run([
					st.trip_id,
					st.arrival_time,
					st.departure_time,
					st.stop_id,
					st.stop_sequence,
				]);
			}
			stmt.free();
		}

		if (data.calendar.length) {
			const stmt = db.prepare(
				"INSERT INTO calendar (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			);
			for (const c of data.calendar) {
				stmt.run([
					c.service_id,
					c.monday,
					c.tuesday,
					c.wednesday,
					c.thursday,
					c.friday,
					c.saturday,
					c.sunday,
					c.start_date,
					c.end_date,
				]);
			}
			stmt.free();
		}

		if (data.calendar_dates.length) {
			const stmt = db.prepare(
				"INSERT INTO calendar_dates (service_id, date, exception_type) VALUES (?, ?, ?)",
			);
			for (const cd of data.calendar_dates) {
				stmt.run([cd.service_id, cd.date, cd.exception_type]);
			}
			stmt.free();
		}

		db.run("COMMIT");
	} catch (e) {
		db.run("ROLLBACK");
		throw e;
	}
}
