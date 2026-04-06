import initSqlJs from "sql.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSchema, loadGtfsData } from "../src/lib/gtfs-loader";
import { searchStops } from "../src/lib/stop-search";
import type { GtfsData } from "../src/types/gtfs";

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

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
	SQL = await initSqlJs();
});

function createTestDb(stops: GtfsData["stops"]) {
	const db = new SQL.Database();
	createSchema(db);
	loadGtfsData(db, { ...emptyGtfsBase, stops }, "test");
	return db;
}

describe("searchStops", () => {
	const stops: GtfsData["stops"] = [
		{
			stop_id: "S001",
			stop_name: "旭川駅前",
			stop_lat: 43.7631,
			stop_lon: 142.3582,
		},
		{
			stop_id: "S002",
			stop_name: "市役所前",
			stop_lat: 43.7701,
			stop_lon: 142.3651,
		},
		{
			stop_id: "S003",
			stop_name: "旭川四条駅",
			stop_lat: 43.7551,
			stop_lon: 142.3612,
		},
		{
			stop_id: "S004",
			stop_name: "末広1条3丁目",
			stop_lat: 43.7801,
			stop_lon: 142.3701,
		},
		{
			stop_id: "S005",
			stop_name: "東旭川駅前",
			stop_lat: 43.7901,
			stop_lon: 142.4001,
		},
		{
			stop_id: "S006",
			stop_name: "100丁目",
			stop_lat: 43.7951,
			stop_lon: 142.4101,
		},
	];

	let db: ReturnType<typeof createTestDb>;

	beforeEach(() => {
		db = createTestDb(stops);
	});

	afterEach(() => {
		db.close();
	});

	it("部分一致で検索できる", () => {
		const results = searchStops(db, "旭川");
		expect(results).toHaveLength(3);
		expect(results.map((r) => r.stop_name)).toEqual(
			expect.arrayContaining(["旭川駅前", "旭川四条駅", "東旭川駅前"]),
		);
	});

	it("完全一致でも検索できる", () => {
		const results = searchStops(db, "市役所前");
		expect(results).toHaveLength(1);
		expect(results[0].stop_name).toBe("市役所前");
	});

	it("stop_id にはオペレータ ID のプレフィックスが付く", () => {
		const results = searchStops(db, "市役所前");
		expect(results[0].stop_id).toBe("test:S002");
	});

	it("空文字の検索は空配列を返す", () => {
		const results = searchStops(db, "");
		expect(results).toHaveLength(0);
	});

	it("空白のみの検索は空配列を返す", () => {
		const results = searchStops(db, "   ");
		expect(results).toHaveLength(0);
	});

	it("該当なしの場合は空配列を返す", () => {
		const results = searchStops(db, "札幌");
		expect(results).toHaveLength(0);
	});

	it("limit で結果数を制限できる", () => {
		const results = searchStops(db, "旭川", 2);
		expect(results).toHaveLength(2);
	});

	it("limit が 0 以下の場合は 1 件に正規化される", () => {
		const results = searchStops(db, "旭川", 0);
		expect(results).toHaveLength(1);
	});

	it("limit が 100 を超える場合は 100 に正規化される", () => {
		const manyStops: GtfsData["stops"] = Array.from(
			{ length: 101 },
			(_, i) => ({
				stop_id: `M${String(i).padStart(4, "0")}`,
				stop_name: `テスト停留所${i}`,
				stop_lat: 43.76 + i * 0.001,
				stop_lon: 142.36 + i * 0.001,
			}),
		);
		const manyDb = createTestDb(manyStops);
		try {
			const results = searchStops(manyDb, "テスト停留所", 200);
			expect(results).toHaveLength(100);
		} finally {
			manyDb.close();
		}
	});

	it("結果は stop_name 順にソートされる", () => {
		const results = searchStops(db, "旭川");
		const names = results.map((r) => r.stop_name);
		const sorted = [...names].sort();
		expect(names).toEqual(sorted);
	});

	it("LIKE ワイルドカード文字 % がエスケープされる", () => {
		// テストデータに "100丁目" が存在する
		// % がエスケープされない場合 "100%" は "%100%%" となり "100丁目" にヒットする
		// エスケープが正しければ "100%" という文字列そのものを検索するため 0 件になる
		const results = searchStops(db, "100%");
		expect(results).toHaveLength(0);
	});

	it("LIKE ワイルドカード文字 _ がエスケープされる", () => {
		// _ は任意の1文字に一致するが、エスケープにより文字通りの _ として検索される
		const results = searchStops(db, "末広_条");
		expect(results).toHaveLength(0);
	});

	it("データが空の場合は空配列を返す", () => {
		const emptyDb = createTestDb([]);
		try {
			const results = searchStops(emptyDb, "旭川");
			expect(results).toHaveLength(0);
		} finally {
			emptyDb.close();
		}
	});
});
