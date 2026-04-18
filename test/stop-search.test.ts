import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSchema, loadGtfsData } from "../src/lib/gtfs-loader";
import {
	getSiblingStopIds,
	getStopName,
	searchStops,
} from "../src/lib/stop-search";
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

describe("searchStops（同名バス停の重複排除）", () => {
	let db: ReturnType<typeof createTestDb>;

	afterEach(() => {
		db.close();
	});

	it("近距離の同名バス停はひとつに統合される", () => {
		// 同じ「旭川駅前」が上り・下りで 2 つ存在（約 50m 離れ）
		db = createTestDb([
			{
				stop_id: "S001",
				stop_name: "旭川駅前",
				stop_lat: 43.7631,
				stop_lon: 142.3582,
			},
			{
				stop_id: "S002",
				stop_name: "旭川駅前",
				stop_lat: 43.7635,
				stop_lon: 142.3582,
			},
		]);
		const results = searchStops(db, "旭川駅前");
		expect(results).toHaveLength(1);
		expect(results[0].stop_name).toBe("旭川駅前");
	});

	it("遠距離の同名バス停は別エントリとして返される", () => {
		// 同じ「東橋」が旭川と富良野に存在（約 70km 離れ）
		db = createTestDb([
			{
				stop_id: "S001",
				stop_name: "東橋",
				stop_lat: 43.77,
				stop_lon: 142.37,
			},
			{
				stop_id: "S002",
				stop_name: "東橋",
				stop_lat: 43.34,
				stop_lon: 142.38,
			},
		]);
		const results = searchStops(db, "東橋");
		expect(results).toHaveLength(2);
	});

	it("遠距離の同名バス停には区別ラベルが付与される", () => {
		db = createTestDb([]);
		// 異なる事業者でロード
		loadGtfsData(
			db,
			{
				...emptyGtfsBase,
				agency: [{ agency_id: "A001", agency_name: "道北バス" }],
				stops: [
					{
						stop_id: "S001",
						stop_name: "東橋",
						stop_lat: 43.77,
						stop_lon: 142.37,
					},
				],
			},
			"dohoku",
		);
		loadGtfsData(
			db,
			{
				...emptyGtfsBase,
				agency: [{ agency_id: "A001", agency_name: "ふらのバス" }],
				stops: [
					{
						stop_id: "S001",
						stop_name: "東橋",
						stop_lat: 43.34,
						stop_lon: 142.38,
					},
				],
			},
			"furano",
		);
		const results = searchStops(db, "東橋");
		expect(results).toHaveLength(2);
		// 各エントリに区別ラベルが存在する
		for (const r of results) {
			expect(r.disambiguationLabel).toBeDefined();
			expect(r.disambiguationLabel).not.toBe("");
		}
		// ラベルが異なる
		expect(results[0].disambiguationLabel).not.toBe(
			results[1].disambiguationLabel,
		);
	});

	it("同名バス停がすべて近距離なら区別ラベルは付かない", () => {
		db = createTestDb([
			{
				stop_id: "S001",
				stop_name: "旭川駅前",
				stop_lat: 43.7631,
				stop_lon: 142.3582,
			},
			{
				stop_id: "S002",
				stop_name: "旭川駅前",
				stop_lat: 43.7635,
				stop_lon: 142.3582,
			},
		]);
		const results = searchStops(db, "旭川駅前");
		expect(results).toHaveLength(1);
		expect(results[0].disambiguationLabel).toBeUndefined();
	});

	it("3 つの近距離同名バス停がひとつに統合される", () => {
		db = createTestDb([
			{
				stop_id: "S001",
				stop_name: "市役所前",
				stop_lat: 43.7701,
				stop_lon: 142.3651,
			},
			{
				stop_id: "S002",
				stop_name: "市役所前",
				stop_lat: 43.7703,
				stop_lon: 142.3651,
			},
			{
				stop_id: "S003",
				stop_name: "市役所前",
				stop_lat: 43.7705,
				stop_lon: 142.3651,
			},
		]);
		const results = searchStops(db, "市役所前");
		expect(results).toHaveLength(1);
	});
});

describe("getSiblingStopIds", () => {
	let db: ReturnType<typeof createTestDb>;

	afterEach(() => {
		db.close();
	});

	it("同名の近距離バス停の stop_id をすべて返す", () => {
		db = createTestDb([
			{
				stop_id: "S001",
				stop_name: "旭川駅前",
				stop_lat: 43.7631,
				stop_lon: 142.3582,
			},
			{
				stop_id: "S002",
				stop_name: "旭川駅前",
				stop_lat: 43.7635,
				stop_lon: 142.3582,
			},
		]);
		const ids = getSiblingStopIds(db, "test:S001");
		expect(ids).toContain("test:S001");
		expect(ids).toContain("test:S002");
		expect(ids).toHaveLength(2);
	});

	it("同名でも遠距離のバス停は含めない", () => {
		db = createTestDb([
			{
				stop_id: "S001",
				stop_name: "東橋",
				stop_lat: 43.77,
				stop_lon: 142.37,
			},
			{
				stop_id: "S002",
				stop_name: "東橋",
				stop_lat: 43.34,
				stop_lon: 142.38,
			},
		]);
		const ids = getSiblingStopIds(db, "test:S001");
		expect(ids).toContain("test:S001");
		expect(ids).not.toContain("test:S002");
		expect(ids).toHaveLength(1);
	});

	it("同名バス停が存在しない場合は自身のみ返す", () => {
		db = createTestDb([
			{
				stop_id: "S001",
				stop_name: "旭川駅前",
				stop_lat: 43.7631,
				stop_lon: 142.3582,
			},
		]);
		const ids = getSiblingStopIds(db, "test:S001");
		expect(ids).toEqual(["test:S001"]);
	});

	it("存在しない stop_id を指定した場合はその ID のみ返す", () => {
		db = createTestDb([]);
		const ids = getSiblingStopIds(db, "test:S999");
		expect(ids).toEqual(["test:S999"]);
	});
});

describe("getStopName", () => {
	const stops: GtfsData["stops"] = [
		{
			stop_id: "S001",
			stop_name: "旭川駅前",
			stop_lat: 43.7631,
			stop_lon: 142.3582,
		},
	];

	let db: ReturnType<typeof createTestDb>;

	beforeEach(() => {
		db = createTestDb(stops);
	});

	afterEach(() => {
		db.close();
	});

	it("stop_id からバス停名を取得できる", () => {
		const name = getStopName(db, "test:S001");
		expect(name).toBe("旭川駅前");
	});

	it("存在しない stop_id の場合は stop_id をそのまま返す", () => {
		const name = getStopName(db, "test:S999");
		expect(name).toBe("test:S999");
	});
});

describe("searchStops（到達可能性フィルタ）", () => {
	// Issue #90: 乗降車バス停の候補を直通便で到達可能なものに絞り込む。
	// テスト用に A→B→C と D→E の 2 系統を用意し、クラスタ展開込みで
	// EXISTS サブクエリの挙動を検証する。
	const stops: GtfsData["stops"] = [
		{ stop_id: "S001", stop_name: "A停", stop_lat: 43.76, stop_lon: 142.35 },
		{ stop_id: "S002", stop_name: "B停", stop_lat: 43.77, stop_lon: 142.36 },
		{ stop_id: "S003", stop_name: "C停", stop_lat: 43.78, stop_lon: 142.37 },
		{ stop_id: "S004", stop_name: "D停", stop_lat: 43.79, stop_lon: 142.38 },
		{ stop_id: "S005", stop_name: "E停", stop_lat: 43.8, stop_lon: 142.39 },
	];

	const routes: GtfsData["routes"] = [
		{ route_id: "R001", agency_id: "A001", route_short_name: "1" },
	];

	const calendar: GtfsData["calendar"] = [
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

	const trips: GtfsData["trips"] = [
		{ trip_id: "T001", route_id: "R001", service_id: "weekday" },
		{ trip_id: "T002", route_id: "R001", service_id: "weekday" },
	];

	const stopTimes: GtfsData["stop_times"] = [
		// T001: A → B → C の直通便
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
		// T002: D → E の別系統
		{
			trip_id: "T002",
			arrival_time: "09:00:00",
			departure_time: "09:00:00",
			stop_id: "S004",
			stop_sequence: 1,
		},
		{
			trip_id: "T002",
			arrival_time: "09:10:00",
			departure_time: "09:10:00",
			stop_id: "S005",
			stop_sequence: 2,
		},
	];

	let db: Database;

	beforeEach(() => {
		db = new SQL.Database();
		createSchema(db);
		loadGtfsData(
			db,
			{
				...emptyGtfsBase,
				stops,
				routes,
				calendar,
				trips,
				stop_times: stopTimes,
			},
			"test",
		);
	});

	afterEach(() => {
		db.close();
	});

	it("フィルタ未指定時は従来どおり全件返す", () => {
		const results = searchStops(db, "停");
		expect(results.map((r) => r.stop_name).sort()).toEqual([
			"A停",
			"B停",
			"C停",
			"D停",
			"E停",
		]);
	});

	it("reachableFromOrigin 指定時は origin から直通で到達可能な候補のみ返す", () => {
		// A を origin に指定すると、A 発の直通便で行ける B と C のみが候補になる。
		// D と E は別系統のため除外される。
		const results = searchStops(db, "停", undefined, {
			reachableFromOrigin: ["test:S001"],
		});
		expect(results.map((r) => r.stop_name).sort()).toEqual(["B停", "C停"]);
	});

	it("reachableToDestination 指定時は destination に直通で到達できる候補のみ返す", () => {
		// C を destination に指定すると、C に直通で到達できる A と B のみが候補になる。
		const results = searchStops(db, "停", undefined, {
			reachableToDestination: ["test:S003"],
		});
		expect(results.map((r) => r.stop_name).sort()).toEqual(["A停", "B停"]);
	});

	it("reachableFromOrigin に対し origin 自身は除外される（自己ループ判定）", () => {
		// A を origin に指定したとき、A 自身は到達先になり得ない。
		const results = searchStops(db, "停", undefined, {
			reachableFromOrigin: ["test:S001"],
		});
		expect(results.map((r) => r.stop_name)).not.toContain("A停");
	});

	it("reachableToDestination に対し destination 自身は除外される", () => {
		const results = searchStops(db, "停", undefined, {
			reachableToDestination: ["test:S003"],
		});
		expect(results.map((r) => r.stop_name)).not.toContain("C停");
	});

	it("reachableFromOrigin が空配列のときはフィルタ無指定と同じ挙動になる", () => {
		// 空配列を「フィルタ条件なし」と解釈する。呼び出し側で clusterStopIds が
		// 空になるケース（バス停未選択 / クラスタ展開結果が空）を防御的に扱う。
		const results = searchStops(db, "停", undefined, {
			reachableFromOrigin: [],
		});
		expect(results.map((r) => r.stop_name).sort()).toEqual([
			"A停",
			"B停",
			"C停",
			"D停",
			"E停",
		]);
	});

	it("reachableToDestination が空配列のときはフィルタ無指定と同じ挙動になる", () => {
		const results = searchStops(db, "停", undefined, {
			reachableToDestination: [],
		});
		expect(results.map((r) => r.stop_name).sort()).toEqual([
			"A停",
			"B停",
			"C停",
			"D停",
			"E停",
		]);
	});

	it("両方のフィルタを同時指定すると AND で絞り込まれる", () => {
		// origin=A AND destination=C を満たすのは B のみ
		// （A→B→C の中間点として両条件を満たす）
		const results = searchStops(db, "停", undefined, {
			reachableFromOrigin: ["test:S001"],
			reachableToDestination: ["test:S003"],
		});
		expect(results.map((r) => r.stop_name)).toEqual(["B停"]);
	});

	it("limit はフィルタ後の件数に対して適用される", () => {
		const results = searchStops(db, "停", 1, {
			reachableFromOrigin: ["test:S001"],
		});
		expect(results).toHaveLength(1);
	});
});
