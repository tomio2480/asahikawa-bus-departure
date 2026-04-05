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

		it("agency データが operatorId 付きで投入される", () => {
			loadGtfsData(db, sampleGtfsData, "test");

			const result = db.exec("SELECT agency_id, agency_name FROM agency");
			expect(result[0].values).toEqual([["test:A001", "テストバス"]]);
		});

		it("stops データが operatorId 付きで投入される", () => {
			loadGtfsData(db, sampleGtfsData, "test");

			const result = db.exec("SELECT stop_id, stop_name FROM stops");
			expect(result[0].values).toHaveLength(2);
			expect(result[0].values[0]).toEqual(["test:S001", "旭川駅前"]);
		});

		it("routes データが operatorId 付きで投入される", () => {
			loadGtfsData(db, sampleGtfsData, "test");

			const result = db.exec(
				"SELECT route_id, agency_id, route_long_name FROM routes",
			);
			expect(result[0].values[0]).toEqual([
				"test:R001",
				"test:A001",
				"旭川駅前〜市役所前",
			]);
		});

		it("trips データが operatorId 付きで投入される", () => {
			loadGtfsData(db, sampleGtfsData, "test");

			const result = db.exec(
				"SELECT trip_id, route_id, service_id, trip_headsign FROM trips",
			);
			expect(result[0].values[0]).toEqual([
				"test:T001",
				"test:R001",
				"test:weekday",
				"市役所前",
			]);
		});

		it("stop_times データが operatorId 付きで投入される", () => {
			loadGtfsData(db, sampleGtfsData, "test");

			const result = db.exec(
				"SELECT trip_id, departure_time, stop_id, stop_sequence FROM stop_times ORDER BY stop_sequence",
			);
			expect(result[0].values).toHaveLength(2);
			expect(result[0].values[0]).toEqual([
				"test:T001",
				"08:00:00",
				"test:S001",
				1,
			]);
			expect(result[0].values[1]).toEqual([
				"test:T001",
				"08:15:00",
				"test:S002",
				2,
			]);
		});

		it("calendar データが operatorId 付きで投入される", () => {
			loadGtfsData(db, sampleGtfsData, "test");

			const result = db.exec(
				"SELECT service_id, monday, saturday FROM calendar",
			);
			expect(result[0].values[0]).toEqual(["test:weekday", 1, 0]);
		});

		it("calendar_dates データが operatorId 付きで投入される", () => {
			loadGtfsData(db, sampleGtfsData, "test");

			const result = db.exec(
				"SELECT service_id, date, exception_type FROM calendar_dates",
			);
			expect(result[0].values[0]).toEqual(["test:weekday", "20260505", 2]);
		});

		it("複数事業者のデータを統合できる（ID 衝突なし）", () => {
			loadGtfsData(db, sampleGtfsData, "opA");

			const secondOperator = {
				...sampleGtfsData,
				agency: [{ agency_id: "A001", agency_name: "第二バス" }],
				stops: [
					{
						stop_id: "S001",
						stop_name: "別の駅前",
						stop_lat: 43.77,
						stop_lon: 142.36,
						zone_id: "Z001" as const,
					},
				],
				routes: [
					{
						route_id: "R001",
						agency_id: "A001",
						route_short_name: "1",
						route_long_name: "別路線",
					},
				],
				trips: [
					{
						trip_id: "T001",
						route_id: "R001",
						service_id: "weekday",
						trip_headsign: "別方面",
					},
				],
				stop_times: [
					{
						trip_id: "T001",
						arrival_time: "09:00:00",
						departure_time: "09:00:00",
						stop_id: "S001",
						stop_sequence: 1,
					},
				],
				calendar: [],
				calendar_dates: [],
			};
			loadGtfsData(db, secondOperator, "opB");

			const agencies = db.exec("SELECT COUNT(*) FROM agency");
			expect(agencies[0].values[0][0]).toBe(2);

			const stops = db.exec("SELECT COUNT(*) FROM stops");
			expect(stops[0].values[0][0]).toBe(3);

			const aNames = db.exec(
				"SELECT agency_id, agency_name FROM agency ORDER BY agency_id",
			);
			expect(aNames[0].values).toEqual([
				["opA:A001", "テストバス"],
				["opB:A001", "第二バス"],
			]);
		});

		it("途中エラー時はロールバックされ部分投入されない", () => {
			loadGtfsData(db, sampleGtfsData, "test");

			const duplicated = {
				...sampleGtfsData,
				agency: [{ agency_id: "A001", agency_name: "重複" }],
			};

			expect(() => loadGtfsData(db, duplicated, "test")).toThrow();

			const agencies = db.exec("SELECT COUNT(*) FROM agency");
			expect(agencies[0].values[0][0]).toBe(1);
		});
	});
});
