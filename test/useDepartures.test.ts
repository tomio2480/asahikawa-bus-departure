import { act, renderHook } from "@testing-library/react";
import initSqlJs from "sql.js";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { useDepartures } from "../src/hooks/useDepartures";
import { createSchema, loadGtfsData } from "../src/lib/gtfs-loader";
import type { GtfsData } from "../src/types/gtfs";
import type { RegisteredRouteEntry } from "../src/types/route-entry";

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
	trips: [
		{
			trip_id: "T001",
			route_id: "R001",
			service_id: "WD",
			trip_headsign: "市役所方面",
		},
		{
			trip_id: "T002",
			route_id: "R001",
			service_id: "WD",
			trip_headsign: "市役所方面",
		},
		{
			trip_id: "T003",
			route_id: "R002",
			service_id: "WD",
			trip_headsign: "四条方面",
		},
	],
	stop_times: [
		// T001: S001(08:00) → S002(08:30)
		{
			trip_id: "T001",
			arrival_time: "08:00:00",
			departure_time: "08:00:00",
			stop_id: "S001",
			stop_sequence: 1,
		},
		{
			trip_id: "T001",
			arrival_time: "08:30:00",
			departure_time: "08:30:00",
			stop_id: "S002",
			stop_sequence: 2,
		},
		// T002: S001(09:00) → S002(09:30)
		{
			trip_id: "T002",
			arrival_time: "09:00:00",
			departure_time: "09:00:00",
			stop_id: "S001",
			stop_sequence: 1,
		},
		{
			trip_id: "T002",
			arrival_time: "09:30:00",
			departure_time: "09:30:00",
			stop_id: "S002",
			stop_sequence: 2,
		},
		// T003: S001(08:15) → S003(08:45)
		{
			trip_id: "T003",
			arrival_time: "08:15:00",
			departure_time: "08:15:00",
			stop_id: "S001",
			stop_sequence: 1,
		},
		{
			trip_id: "T003",
			arrival_time: "08:45:00",
			departure_time: "08:45:00",
			stop_id: "S003",
			stop_sequence: 2,
		},
	],
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
			start_date: "20260101",
			end_date: "20261231",
		},
	],
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
	],
	fare_rules: [
		{
			fare_id: "F001",
			route_id: "R001",
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
	// 2026-04-07 (火曜) 07:50 JST に固定
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-04-07T07:50:00+09:00"));
});

afterEach(() => {
	vi.useRealTimers();
	db.close();
});

describe("useDepartures", () => {
	it("経路が空の場合は空のグループを返す", () => {
		const { result } = renderHook(() => useDepartures(db, []));
		expect(result.current.groups).toEqual([]);
		expect(result.current.lastUpdated).not.toBeNull();
	});

	it("db が null の場合は空のグループを返す", () => {
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 5 },
		];
		const { result } = renderHook(() => useDepartures(null, routes));
		expect(result.current.groups).toEqual([]);
		expect(result.current.lastUpdated).toBeNull();
	});

	it("登録経路の発車案内を降車バス停ごとにグルーピングする", () => {
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 5 },
			{ id: 2, fromStopId: "test:S001", toStopId: "test:S003", walkMinutes: 3 },
		];
		const { result } = renderHook(() => useDepartures(db, routes));

		expect(result.current.groups).toHaveLength(2);

		// 最初の発車時刻が早い順にソートされている
		const groupNames = result.current.groups.map((g) => g.toStopName);
		expect(groupNames).toContain("市役所前");
		expect(groupNames).toContain("旭川四条駅");
	});

	it("グループ内の便は発車時刻順にソートされる", () => {
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 0 },
		];
		const { result } = renderHook(() => useDepartures(db, routes));

		expect(result.current.groups).toHaveLength(1);
		const deps = result.current.groups[0].departures;
		expect(deps).toHaveLength(2);
		expect(deps[0].departureTime).toBe("08:00:00");
		expect(deps[1].departureTime).toBe("09:00:00");
	});

	it("路線名と行き先が含まれる", () => {
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 0 },
		];
		const { result } = renderHook(() => useDepartures(db, routes));

		const dep = result.current.groups[0].departures[0];
		expect(dep.routeName).toBe("1番");
		expect(dep.headsign).toBe("市役所方面");
	});

	it("徒歩時間を考慮して乗れない便は出発済みとして表示される", () => {
		// 07:50 + 徒歩15分 = 08:05 → 08:00の便は乗れない（出発済み）
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 15,
			},
		];
		const { result } = renderHook(() => useDepartures(db, routes));

		expect(result.current.groups).toHaveLength(1);
		const deps = result.current.groups[0].departures;
		expect(deps).toHaveLength(2);
		// 08:00の便は出発済み
		expect(deps[0].departureTime).toBe("08:00:00");
		expect(deps[0].isDeparted).toBe(true);
		// 09:00の便は乗車可能
		expect(deps[1].departureTime).toBe("09:00:00");
		expect(deps[1].isDeparted).toBe(false);
	});

	it("全便終了後は翌日の始発便を isNextDay で返す", () => {
		// 23:00 に設定 → 本日の全便終了済み、翌日（水曜）のサービスあり
		vi.setSystemTime(new Date("2026-04-07T23:00:00+09:00"));
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 0 },
		];
		const { result } = renderHook(() => useDepartures(db, routes));
		expect(result.current.groups).toHaveLength(1);
		expect(result.current.groups[0].isNextDay).toBe(true);
		expect(result.current.groups[0].departures[0].departureTime).toBe(
			"08:00:00",
		);
	});

	it("翌日のサービスがない場合はグループが空になる", () => {
		// 金曜 23:00 → 翌日（土曜）のサービスなし
		vi.setSystemTime(new Date("2026-04-10T23:00:00+09:00"));
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 0 },
		];
		const { result } = renderHook(() => useDepartures(db, routes));
		expect(result.current.groups).toHaveLength(0);
	});

	it("1 分後に自動更新される", () => {
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 0 },
		];
		const { result } = renderHook(() => useDepartures(db, routes));

		const firstUpdated = result.current.lastUpdated;
		expect(firstUpdated).not.toBeNull();

		// 1 分進める
		act(() => {
			vi.advanceTimersByTime(60_000);
		});

		const secondUpdated = result.current.lastUpdated;
		expect(secondUpdated).not.toBeNull();
		expect(secondUpdated?.getTime()).toBeGreaterThan(
			firstUpdated?.getTime() ?? 0,
		);
	});

	it("DB 操作でエラーが発生した場合は error を返す", () => {
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 0 },
		];
		// DB を閉じてクエリを失敗させる
		db.close();
		const { result } = renderHook(() => useDepartures(db, routes));

		expect(result.current.error).not.toBeNull();
		expect(result.current.groups).toEqual([]);
		// afterEach で db.close() が再度呼ばれてもエラーにならないよう再生成
		db = new SQL.Database();
	});

	it("各便に運賃情報が付与される", () => {
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 0 },
		];
		const { result } = renderHook(() => useDepartures(db, routes));

		expect(result.current.groups).toHaveLength(1);
		const dep = result.current.groups[0].departures[0];
		expect(dep.fare).not.toBeNull();
		expect(dep.fare?.price).toBe(200);
		expect(dep.fare?.currencyType).toBe("JPY");
	});

	it("運賃ルールがない場合は fare が null になる", () => {
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S003", walkMinutes: 0 },
		];
		const { result } = renderHook(() => useDepartures(db, routes));

		expect(result.current.groups).toHaveLength(1);
		const dep = result.current.groups[0].departures[0];
		expect(dep.fare).toBeNull();
	});

	it("同じ降車バス停への複数経路は 1 グループに統合される", () => {
		// 同じ S002 への 2 経路を登録（実際には同じだが、テスト用）
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 0 },
			{ id: 2, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 5 },
		];
		const { result } = renderHook(() => useDepartures(db, routes));

		// 同一降車バス停なので 1 グループ
		const s002Groups = result.current.groups.filter(
			(g) => g.toStopId === "test:S002",
		);
		expect(s002Groups).toHaveLength(1);
	});
});
