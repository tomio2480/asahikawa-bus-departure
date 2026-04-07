import initSqlJs from "sql.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getFare } from "../src/lib/fare-query";
import { createSchema, loadGtfsData } from "../src/lib/gtfs-loader";
import type { GtfsData } from "../src/types/gtfs";

/**
 * テストデータ構成:
 *
 * バス停:
 *   S001 (旭川駅前, zone_id: Z001)
 *   S002 (市役所前, zone_id: Z002)
 *   S003 (旭川四条駅, zone_id: Z003)
 *   S004 (末広, zone_id: Z001) ← S001 と同じゾーン
 *   S005 (春光, zone_id なし)
 *
 * 路線:
 *   R001 (1番線)
 *   R002 (2番線)
 *
 * 運賃:
 *   F001: 200円 (R001, Z001→Z002) route + zone 完全一致
 *   F002: 250円 (Z001→Z003)       zone のみ一致
 *   F003: 150円 (R002)             route のみ一致
 *   F004: 300円 (R001, Z001→Z003) route + zone 完全一致
 *   F005: 180円 (R002)             route のみ一致（F003 と同一 priority）
 */
const baseGtfs: GtfsData = {
	agency: [{ agency_id: "A001", agency_name: "テストバス" }],
	stops: [
		{
			stop_id: "S001",
			stop_name: "旭川駅前",
			stop_lat: 43.7631,
			stop_lon: 142.3582,
			zone_id: "Z001",
		},
		{
			stop_id: "S002",
			stop_name: "市役所前",
			stop_lat: 43.7701,
			stop_lon: 142.3651,
			zone_id: "Z002",
		},
		{
			stop_id: "S003",
			stop_name: "旭川四条駅",
			stop_lat: 43.7551,
			stop_lon: 142.3612,
			zone_id: "Z003",
		},
		{
			stop_id: "S004",
			stop_name: "末広",
			stop_lat: 43.78,
			stop_lon: 142.37,
			zone_id: "Z001",
		},
		{
			stop_id: "S005",
			stop_name: "春光",
			stop_lat: 43.79,
			stop_lon: 142.38,
		},
	],
	routes: [
		{
			route_id: "R001",
			agency_id: "A001",
			route_short_name: "1番",
			route_long_name: "駅前線",
		},
		{
			route_id: "R002",
			agency_id: "A001",
			route_short_name: "2番",
			route_long_name: "四条線",
		},
	],
	trips: [],
	stop_times: [],
	calendar: [],
	calendar_dates: [],
	shapes: [],
	fare_attributes: [
		{
			fare_id: "F001",
			price: 200,
			currency_type: "JPY",
			payment_method: 0,
			transfers: 0,
		},
		{
			fare_id: "F002",
			price: 250,
			currency_type: "JPY",
			payment_method: 0,
			transfers: 0,
		},
		{
			fare_id: "F003",
			price: 150,
			currency_type: "JPY",
			payment_method: 0,
			transfers: 0,
		},
		{
			fare_id: "F004",
			price: 300,
			currency_type: "JPY",
			payment_method: 0,
			transfers: 0,
		},
		{
			fare_id: "F005",
			price: 180,
			currency_type: "JPY",
			payment_method: 0,
			transfers: 0,
		},
	],
	fare_rules: [
		{
			fare_id: "F001",
			route_id: "R001",
			origin_id: "Z001",
			destination_id: "Z002",
		},
		{
			fare_id: "F002",
			origin_id: "Z001",
			destination_id: "Z003",
		},
		{
			fare_id: "F003",
			route_id: "R002",
		},
		{
			fare_id: "F005",
			route_id: "R002",
		},
		{
			fare_id: "F004",
			route_id: "R001",
			origin_id: "Z001",
			destination_id: "Z003",
		},
	],
};

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: InstanceType<(typeof SQL)["Database"]>;

beforeAll(async () => {
	SQL = await initSqlJs();
});

beforeEach(() => {
	db = new SQL.Database();
	createSchema(db);
	loadGtfsData(db, baseGtfs, "test");
});

afterEach(() => {
	db.close();
});

describe("getFare", () => {
	it("route_id + zone が完全一致する運賃を返す", () => {
		const fare = getFare(db, "test:S001", "test:S002", "test:R001");
		expect(fare).not.toBeNull();
		expect(fare?.price).toBe(200);
		expect(fare?.currencyType).toBe("JPY");
	});

	it("zone のみ一致する運賃を返す（route_id が NULL のルール）", () => {
		// R002 で Z001→Z003 の運賃を検索
		// F004 は R001 + Z001→Z003 なので不一致
		// F002 は route_id NULL + Z001→Z003 なので zone 一致
		// F003 は R002 のみなので route のみ一致
		// F002 (priority 2) > F003 (priority 1) なので F002 が返る
		const fare = getFare(db, "test:S001", "test:S003", "test:R002");
		expect(fare).not.toBeNull();
		expect(fare?.price).toBe(250);
	});

	it("route_id のみ一致する運賃を返す（zone が NULL のルール）", () => {
		// R002 で Z002→Z001 の運賃を検索
		// zone 一致ルールなし → F003 (route_id = R002, zone NULL) にフォールバック
		const fare = getFare(db, "test:S002", "test:S001", "test:R002");
		expect(fare).not.toBeNull();
		expect(fare?.price).toBe(150);
	});

	it("完全一致が zone のみ一致より優先される", () => {
		// R001 で Z001→Z003 の運賃を検索
		// F004: R001 + Z001→Z003 (priority 3)
		// F002: Z001→Z003 (priority 2)
		// F004 が優先される
		const fare = getFare(db, "test:S001", "test:S003", "test:R001");
		expect(fare).not.toBeNull();
		expect(fare?.price).toBe(300);
	});

	it("同じゾーンの別バス停でも運賃を取得できる", () => {
		// S004 は Z001 なので S001 と同じゾーン
		const fare = getFare(db, "test:S004", "test:S002", "test:R001");
		expect(fare).not.toBeNull();
		expect(fare?.price).toBe(200);
	});

	it("該当する運賃がない場合は null を返す", () => {
		const fare = getFare(db, "test:S002", "test:S003", "test:R001");
		// R001 + Z002→Z003 に一致するルールなし
		// zone のみ一致もなし
		// R001 のみ一致もなし（F003 は R002）
		expect(fare).toBeNull();
	});

	it("zone_id が未設定のバス停では zone 一致ルールに該当しない", () => {
		// S005 は zone_id なし
		const fare = getFare(db, "test:S005", "test:S002", "test:R002");
		// zone 一致なし → F003 (R002, zone NULL) にフォールバック
		expect(fare).not.toBeNull();
		expect(fare?.price).toBe(150);
	});

	it("存在しないバス停 ID の場合は null を返す", () => {
		const fare = getFare(db, "test:NONEXISTENT", "test:S002", "test:R001");
		expect(fare).toBeNull();
	});

	it("同一 priority の場合は最安値を返す", () => {
		// R002 の route-only が F003(150) と F005(180) で競合
		const fare = getFare(db, "test:S002", "test:S001", "test:R002");
		expect(fare).not.toBeNull();
		expect(fare?.price).toBe(150);
	});

	it("存在しない路線 ID の場合は zone のみ一致にフォールバックする", () => {
		// 存在しない路線で Z001→Z003 を検索
		// F002 (zone のみ一致) が返る
		const fare = getFare(db, "test:S001", "test:S003", "test:NONEXISTENT");
		expect(fare).not.toBeNull();
		expect(fare?.price).toBe(250);
	});
});
