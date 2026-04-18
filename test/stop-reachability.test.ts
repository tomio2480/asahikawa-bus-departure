import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createSchema, loadGtfsData } from "../src/lib/gtfs-loader";
import { isReachable } from "../src/lib/stop-reachability";
import type { GtfsData } from "../src/types/gtfs";

/**
 * 到達可能性判定のテスト。
 *
 * Issue #90: 乗り換えを前提としないため、直通便が 1 本以上ある場合のみ
 * 到達可能とみなす。from から to への順序（stop_sequence）を満たす
 * 単一 trip が存在すれば true、それ以外は false。
 */

const emptyGtfsBase: GtfsData = {
	agency: [{ agency_id: "A001", agency_name: "テストバス" }],
	stops: [],
	routes: [],
	trips: [],
	stop_times: [],
	calendar: [],
	calendar_dates: [],
	shapes: [],
	fare_attributes: [],
	fare_rules: [],
};

const baseStops: GtfsData["stops"] = [
	{ stop_id: "S001", stop_name: "A", stop_lat: 43.76, stop_lon: 142.35 },
	{ stop_id: "S002", stop_name: "B", stop_lat: 43.77, stop_lon: 142.36 },
	{ stop_id: "S003", stop_name: "C", stop_lat: 43.78, stop_lon: 142.37 },
	{ stop_id: "S004", stop_name: "D", stop_lat: 43.79, stop_lon: 142.38 },
];

const baseRoutes: GtfsData["routes"] = [
	{ route_id: "R001", agency_id: "A001", route_short_name: "1" },
];

const baseCalendar: GtfsData["calendar"] = [
	{
		service_id: "weekday",
		monday: 1,
		tuesday: 1,
		wednesday: 1,
		thursday: 1,
		friday: 1,
		saturday: 0,
		sunday: 0,
		start_date: "20260401",
		end_date: "20280407",
	},
];

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: Database;

beforeAll(async () => {
	SQL = await initSqlJs();
});

afterEach(() => {
	db.close();
});

function createDb(overrides: Partial<GtfsData>) {
	db = new SQL.Database();
	createSchema(db);
	loadGtfsData(
		db,
		{
			...emptyGtfsBase,
			stops: baseStops,
			routes: baseRoutes,
			calendar: baseCalendar,
			...overrides,
		},
		"test",
	);
}

describe("isReachable", () => {
	it("A → B の直通便が存在するとき true", () => {
		createDb({
			trips: [{ trip_id: "T001", route_id: "R001", service_id: "weekday" }],
			stop_times: [
				{
					trip_id: "T001",
					arrival_time: "08:00:00",
					departure_time: "08:00:00",
					stop_id: "S001",
					stop_sequence: 1,
				},
				{
					trip_id: "T001",
					arrival_time: "08:15:00",
					departure_time: "08:15:00",
					stop_id: "S002",
					stop_sequence: 2,
				},
			],
		});
		expect(isReachable(db, ["test:S001"], ["test:S002"])).toBe(true);
	});

	it("逆方向（B → A のみの便）では from=A, to=B で false", () => {
		// T001 は S002 → S001 の片方向のみ。A → B の直通便は存在しない。
		createDb({
			trips: [{ trip_id: "T001", route_id: "R001", service_id: "weekday" }],
			stop_times: [
				{
					trip_id: "T001",
					arrival_time: "08:00:00",
					departure_time: "08:00:00",
					stop_id: "S002",
					stop_sequence: 1,
				},
				{
					trip_id: "T001",
					arrival_time: "08:15:00",
					departure_time: "08:15:00",
					stop_id: "S001",
					stop_sequence: 2,
				},
			],
		});
		expect(isReachable(db, ["test:S001"], ["test:S002"])).toBe(false);
	});

	it("同一便に from と to を含み順序が正しければ true（中間停留所あり）", () => {
		createDb({
			trips: [{ trip_id: "T001", route_id: "R001", service_id: "weekday" }],
			stop_times: [
				{
					trip_id: "T001",
					arrival_time: "08:00:00",
					departure_time: "08:00:00",
					stop_id: "S001",
					stop_sequence: 1,
				},
				{
					trip_id: "T001",
					arrival_time: "08:05:00",
					departure_time: "08:05:00",
					stop_id: "S002",
					stop_sequence: 2,
				},
				{
					trip_id: "T001",
					arrival_time: "08:10:00",
					departure_time: "08:10:00",
					stop_id: "S003",
					stop_sequence: 3,
				},
			],
		});
		expect(isReachable(db, ["test:S001"], ["test:S003"])).toBe(true);
	});

	it("from と to が別々の便にしか存在しない場合は false（乗り換えは対象外）", () => {
		// T001 は A→B、T002 は C→D。A→D の直通便は存在しない。
		createDb({
			trips: [
				{ trip_id: "T001", route_id: "R001", service_id: "weekday" },
				{ trip_id: "T002", route_id: "R001", service_id: "weekday" },
			],
			stop_times: [
				{
					trip_id: "T001",
					arrival_time: "08:00:00",
					departure_time: "08:00:00",
					stop_id: "S001",
					stop_sequence: 1,
				},
				{
					trip_id: "T001",
					arrival_time: "08:15:00",
					departure_time: "08:15:00",
					stop_id: "S002",
					stop_sequence: 2,
				},
				{
					trip_id: "T002",
					arrival_time: "09:00:00",
					departure_time: "09:00:00",
					stop_id: "S003",
					stop_sequence: 1,
				},
				{
					trip_id: "T002",
					arrival_time: "09:15:00",
					departure_time: "09:15:00",
					stop_id: "S004",
					stop_sequence: 2,
				},
			],
		});
		expect(isReachable(db, ["test:S001"], ["test:S004"])).toBe(false);
	});

	it("fromStopIds が空配列なら false", () => {
		createDb({
			trips: [{ trip_id: "T001", route_id: "R001", service_id: "weekday" }],
			stop_times: [
				{
					trip_id: "T001",
					arrival_time: "08:00:00",
					departure_time: "08:00:00",
					stop_id: "S001",
					stop_sequence: 1,
				},
				{
					trip_id: "T001",
					arrival_time: "08:15:00",
					departure_time: "08:15:00",
					stop_id: "S002",
					stop_sequence: 2,
				},
			],
		});
		expect(isReachable(db, [], ["test:S002"])).toBe(false);
	});

	it("toStopIds が空配列なら false", () => {
		createDb({
			trips: [{ trip_id: "T001", route_id: "R001", service_id: "weekday" }],
			stop_times: [
				{
					trip_id: "T001",
					arrival_time: "08:00:00",
					departure_time: "08:00:00",
					stop_id: "S001",
					stop_sequence: 1,
				},
				{
					trip_id: "T001",
					arrival_time: "08:15:00",
					departure_time: "08:15:00",
					stop_id: "S002",
					stop_sequence: 2,
				},
			],
		});
		expect(isReachable(db, ["test:S001"], [])).toBe(false);
	});

	it("存在しない stop_id に対しては false", () => {
		createDb({
			trips: [{ trip_id: "T001", route_id: "R001", service_id: "weekday" }],
			stop_times: [
				{
					trip_id: "T001",
					arrival_time: "08:00:00",
					departure_time: "08:00:00",
					stop_id: "S001",
					stop_sequence: 1,
				},
				{
					trip_id: "T001",
					arrival_time: "08:15:00",
					departure_time: "08:15:00",
					stop_id: "S002",
					stop_sequence: 2,
				},
			],
		});
		expect(isReachable(db, ["test:S999"], ["test:S998"])).toBe(false);
	});

	it("複数候補のうち 1 組でも直通便があれば true（クラスタ展開ケース）", () => {
		// T001: S001 → S003 のみ。fromIds に S001 と S002 を並べ、
		// S001 側で直通便にヒットすることを期待する。
		createDb({
			trips: [{ trip_id: "T001", route_id: "R001", service_id: "weekday" }],
			stop_times: [
				{
					trip_id: "T001",
					arrival_time: "08:00:00",
					departure_time: "08:00:00",
					stop_id: "S001",
					stop_sequence: 1,
				},
				{
					trip_id: "T001",
					arrival_time: "08:15:00",
					departure_time: "08:15:00",
					stop_id: "S003",
					stop_sequence: 2,
				},
			],
		});
		expect(
			isReachable(db, ["test:S002", "test:S001"], ["test:S003", "test:S004"]),
		).toBe(true);
	});

	it("同一便で from と to が同じ stop_sequence（自己参照）では false", () => {
		// 理論上は PRIMARY KEY 違反だが、防御的に片方向のみ検出する SQL の
		// 挙動を検証する。stop_sequence が同じなら from < to にならない。
		createDb({
			trips: [{ trip_id: "T001", route_id: "R001", service_id: "weekday" }],
			stop_times: [
				{
					trip_id: "T001",
					arrival_time: "08:00:00",
					departure_time: "08:00:00",
					stop_id: "S001",
					stop_sequence: 1,
				},
			],
		});
		// from と to に同じバス停を指定 → 同じ行同士では from_seq < to_seq を満たさない
		expect(isReachable(db, ["test:S001"], ["test:S001"])).toBe(false);
	});
});
