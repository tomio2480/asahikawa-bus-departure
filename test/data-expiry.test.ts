import initSqlJs from "sql.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDataExpiry } from "../src/lib/data-expiry";
import { createSchema, loadGtfsData } from "../src/lib/gtfs-loader";
import type { GtfsData } from "../src/types/gtfs";

const baseGtfs: GtfsData = {
	agency: [{ agency_id: "A001", agency_name: "テストバス" }],
	stops: [],
	routes: [],
	trips: [],
	stop_times: [],
	calendar: [
		{
			service_id: "WD",
			monday: 1,
			tuesday: 1,
			wednesday: 1,
			thursday: 1,
			friday: 1,
			saturday: 0,
			sunday: 0,
			start_date: "20260401",
			end_date: "20261130",
		},
		{
			service_id: "HD",
			monday: 0,
			tuesday: 0,
			wednesday: 0,
			thursday: 0,
			friday: 0,
			saturday: 1,
			sunday: 1,
			start_date: "20260401",
			end_date: "20280407",
		},
	],
	calendar_dates: [],
	shapes: [],
	fare_attributes: [],
	fare_rules: [],
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

describe("getDataExpiry", () => {
	it("全 calendar の最も遅い end_date を返す", () => {
		const expiry = getDataExpiry(db);
		expect(expiry).not.toBeNull();
		expect(expiry?.latestEndDate).toBe("20280407");
	});

	it("全 calendar の最も早い end_date を返す", () => {
		const expiry = getDataExpiry(db);
		expect(expiry?.earliestEndDate).toBe("20261130");
	});

	it("指定日が全データの有効期限内であれば expired は false", () => {
		const expiry = getDataExpiry(db);
		// 2026-06-01 は WD(20261130) も HD(20280407) も有効期限内
		expect(expiry?.isExpired("20260601")).toBe(false);
	});

	it("一部データが期限切れの場合は partiallyExpired が true", () => {
		const expiry = getDataExpiry(db);
		// 2026-12-01 は WD(20261130) は期限切れだが HD(20280407) は有効
		expect(expiry?.isPartiallyExpired("20261201")).toBe(true);
	});

	it("全データが期限切れの場合は expired が true", () => {
		const expiry = getDataExpiry(db);
		// 2028-05-01 は全て期限切れ
		expect(expiry?.isExpired("20280501")).toBe(true);
	});

	it("全データが有効な場合は partiallyExpired が false", () => {
		const expiry = getDataExpiry(db);
		expect(expiry?.isPartiallyExpired("20260601")).toBe(false);
	});

	it("earliestEndDate 当日は全データ有効と判定する", () => {
		const expiry = getDataExpiry(db);
		// 20261130 は WD の最終有効日 → まだ全データ有効
		expect(expiry?.isExpired("20261130")).toBe(false);
		expect(expiry?.isPartiallyExpired("20261130")).toBe(false);
	});

	it("latestEndDate 当日は一部期限切れと判定する", () => {
		const expiry = getDataExpiry(db);
		// 20280407 は HD の最終有効日 → WD は既に期限切れ
		expect(expiry?.isExpired("20280407")).toBe(false);
		expect(expiry?.isPartiallyExpired("20280407")).toBe(true);
	});

	it("calendar が空の場合は null を返す", () => {
		const emptyGtfs: GtfsData = {
			...baseGtfs,
			calendar: [],
		};
		const emptyDb = new SQL.Database();
		try {
			createSchema(emptyDb);
			loadGtfsData(emptyDb, emptyGtfs, "empty");
			const expiry = getDataExpiry(emptyDb);
			expect(expiry).toBeNull();
		} finally {
			emptyDb.close();
		}
	});
});
