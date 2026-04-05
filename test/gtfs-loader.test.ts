import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSchema, loadGtfsData } from "../src/lib/gtfs-loader";
import { sampleGtfsData } from "./fixtures/gtfs-sample";

describe("gtfs-loader", () => {
	let db: Database;

	beforeEach(async () => {
		const SQL = await initSqlJs();
		db = new SQL.Database();
	});

	afterEach(() => {
		db.close();
	});

	describe("createSchema", () => {
		it("全テーブルが作成される", () => {
			createSchema(db);

			const tables = db
				.exec(
					"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
				)[0]
				.values.map((row) => row[0]);

			expect(tables).toContain("agency");
			expect(tables).toContain("stops");
			expect(tables).toContain("routes");
			expect(tables).toContain("trips");
			expect(tables).toContain("stop_times");
			expect(tables).toContain("calendar");
			expect(tables).toContain("calendar_dates");
		});
	});

	describe("loadGtfsData", () => {
		beforeEach(() => {
			createSchema(db);
		});

		it("agency データが投入される", () => {
			loadGtfsData(db, sampleGtfsData);

			const result = db.exec("SELECT agency_id, agency_name FROM agency");
			expect(result[0].values).toEqual([["A001", "テストバス"]]);
		});

		it("stops データが投入される", () => {
			loadGtfsData(db, sampleGtfsData);

			const result = db.exec("SELECT stop_id, stop_name FROM stops");
			expect(result[0].values).toHaveLength(2);
			expect(result[0].values[0]).toEqual(["S001", "旭川駅前"]);
		});

		it("routes データが投入される", () => {
			loadGtfsData(db, sampleGtfsData);

			const result = db.exec("SELECT route_id, route_long_name FROM routes");
			expect(result[0].values[0]).toEqual(["R001", "旭川駅前〜市役所前"]);
		});

		it("trips データが投入される", () => {
			loadGtfsData(db, sampleGtfsData);

			const result = db.exec(
				"SELECT trip_id, service_id, trip_headsign FROM trips",
			);
			expect(result[0].values[0]).toEqual(["T001", "weekday", "市役所前"]);
		});

		it("stop_times データが投入される", () => {
			loadGtfsData(db, sampleGtfsData);

			const result = db.exec(
				"SELECT trip_id, departure_time, stop_id, stop_sequence FROM stop_times ORDER BY stop_sequence",
			);
			expect(result[0].values).toHaveLength(2);
			expect(result[0].values[0]).toEqual(["T001", "08:00:00", "S001", 1]);
			expect(result[0].values[1]).toEqual(["T001", "08:15:00", "S002", 2]);
		});

		it("calendar データが投入される", () => {
			loadGtfsData(db, sampleGtfsData);

			const result = db.exec(
				"SELECT service_id, monday, saturday FROM calendar",
			);
			expect(result[0].values[0]).toEqual(["weekday", 1, 0]);
		});

		it("calendar_dates データが投入される", () => {
			loadGtfsData(db, sampleGtfsData);

			const result = db.exec(
				"SELECT service_id, date, exception_type FROM calendar_dates",
			);
			expect(result[0].values[0]).toEqual(["weekday", "20260505", 2]);
		});

		it("複数事業者のデータを統合できる", () => {
			loadGtfsData(db, sampleGtfsData);

			const secondOperator = {
				...sampleGtfsData,
				agency: [{ agency_id: "A002", agency_name: "第二バス" }],
				stops: [
					{
						stop_id: "S003",
						stop_name: "北口",
						stop_lat: 43.77,
						stop_lon: 142.36,
					},
				],
				routes: [
					{
						route_id: "R002",
						agency_id: "A002",
						route_short_name: "2",
						route_long_name: "北口線",
					},
				],
				trips: [
					{
						trip_id: "T002",
						route_id: "R002",
						service_id: "weekday",
						trip_headsign: "北口",
					},
				],
				stop_times: [
					{
						trip_id: "T002",
						arrival_time: "09:00:00",
						departure_time: "09:00:00",
						stop_id: "S003",
						stop_sequence: 1,
					},
				],
				calendar: [],
				calendar_dates: [],
			};
			loadGtfsData(db, secondOperator);

			const agencies = db.exec("SELECT COUNT(*) FROM agency");
			expect(agencies[0].values[0][0]).toBe(2);

			const stops = db.exec("SELECT COUNT(*) FROM stops");
			expect(stops[0].values[0][0]).toBe(3);
		});
	});
});
