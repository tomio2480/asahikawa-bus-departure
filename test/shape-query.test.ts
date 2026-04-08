import initSqlJs, { type Database } from "sql.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSchema, loadGtfsData } from "../src/lib/gtfs-loader";
import { getShapePoints, getStopsForTrip } from "../src/lib/shape-query";
import type { GtfsData } from "../src/types/gtfs";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: Database;

const baseGtfs: GtfsData = {
	agency: [{ agency_id: "A1", agency_name: "Test Agency" }],
	stops: [
		{ stop_id: "S1", stop_name: "Stop A", stop_lat: 43.77, stop_lon: 142.36 },
		{ stop_id: "S2", stop_name: "Stop B", stop_lat: 43.78, stop_lon: 142.37 },
		{ stop_id: "S3", stop_name: "Stop C", stop_lat: 43.79, stop_lon: 142.38 },
	],
	routes: [{ route_id: "R1", agency_id: "A1" }],
	trips: [
		{ trip_id: "T1", route_id: "R1", service_id: "SV1", shape_id: "SH1" },
		{ trip_id: "T2", route_id: "R1", service_id: "SV1" },
	],
	stop_times: [
		{
			trip_id: "T1",
			arrival_time: "08:00:00",
			departure_time: "08:00:00",
			stop_id: "S1",
			stop_sequence: 1,
		},
		{
			trip_id: "T1",
			arrival_time: "08:10:00",
			departure_time: "08:10:00",
			stop_id: "S2",
			stop_sequence: 2,
		},
		{
			trip_id: "T1",
			arrival_time: "08:20:00",
			departure_time: "08:20:00",
			stop_id: "S3",
			stop_sequence: 3,
		},
		{
			trip_id: "T2",
			arrival_time: "09:00:00",
			departure_time: "09:00:00",
			stop_id: "S1",
			stop_sequence: 1,
		},
		{
			trip_id: "T2",
			arrival_time: "09:10:00",
			departure_time: "09:10:00",
			stop_id: "S3",
			stop_sequence: 2,
		},
	],
	calendar: [
		{
			service_id: "SV1",
			monday: 1,
			tuesday: 1,
			wednesday: 1,
			thursday: 1,
			friday: 1,
			saturday: 0,
			sunday: 0,
			start_date: "20260101",
			end_date: "20261231",
		},
	],
	calendar_dates: [],
	shapes: [
		{
			shape_id: "SH1",
			shape_pt_lat: 43.77,
			shape_pt_lon: 142.36,
			shape_pt_sequence: 1,
		},
		{
			shape_id: "SH1",
			shape_pt_lat: 43.775,
			shape_pt_lon: 142.365,
			shape_pt_sequence: 2,
		},
		{
			shape_id: "SH1",
			shape_pt_lat: 43.78,
			shape_pt_lon: 142.37,
			shape_pt_sequence: 3,
		},
		{
			shape_id: "SH1",
			shape_pt_lat: 43.785,
			shape_pt_lon: 142.375,
			shape_pt_sequence: 4,
		},
		{
			shape_id: "SH1",
			shape_pt_lat: 43.79,
			shape_pt_lon: 142.38,
			shape_pt_sequence: 5,
		},
	],
	fare_attributes: [],
	fare_rules: [],
};

beforeAll(async () => {
	SQL = await initSqlJs();
});

beforeEach(() => {
	db = new SQL.Database();
	createSchema(db);
	loadGtfsData(db, baseGtfs, "TEST");
});

afterEach(() => {
	db.close();
});

describe("getShapePoints", () => {
	it("shape_id に対応する座標をシーケンス順で返す", () => {
		const points = getShapePoints(db, "TEST:SH1");
		expect(points).toHaveLength(5);
		expect(points[0]).toEqual({ lat: 43.77, lon: 142.36 });
		expect(points[4]).toEqual({ lat: 43.79, lon: 142.38 });
	});

	it("存在しない shape_id の場合は空配列を返す", () => {
		const points = getShapePoints(db, "TEST:NONEXISTENT");
		expect(points).toEqual([]);
	});
});

describe("getStopsForTrip", () => {
	it("trip_id に対応する停留所座標をシーケンス順で返す", () => {
		const stops = getStopsForTrip(db, "TEST:T1");
		expect(stops).toHaveLength(3);
		expect(stops[0]).toEqual({ lat: 43.77, lon: 142.36 });
		expect(stops[2]).toEqual({ lat: 43.79, lon: 142.38 });
	});

	it("存在しない trip_id の場合は空配列を返す", () => {
		const stops = getStopsForTrip(db, "TEST:NONEXISTENT");
		expect(stops).toEqual([]);
	});
});
