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

	it("出発済みの便は isDeparted=true になる", () => {
		// 08:10 に設定 → 08:00の便は実際に出発済み
		vi.setSystemTime(new Date("2026-04-07T08:10:00+09:00"));
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 0,
			},
		];
		const { result } = renderHook(() => useDepartures(db, routes));

		expect(result.current.groups).toHaveLength(1);
		const deps = result.current.groups[0].departures;
		// 08:00の便は出発済み（現在 08:10 > 08:00）
		expect(deps[0].departureTime).toBe("08:00:00");
		expect(deps[0].isDeparted).toBe(true);
		// 09:00の便は未出発（現在 08:10 < 09:00）
		expect(deps[1].departureTime).toBe("09:00:00");
		expect(deps[1].isDeparted).toBe(false);
	});

	it("まだ出発していない便は徒歩時間に関係なく isDeparted=false", () => {
		// 07:50 + 徒歩15分 = 08:05 → バス停には間に合わないが、バスはまだ出発していない
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
		// 08:00の便はまだ出発していない（現在 07:50 < 08:00）
		expect(deps[0].departureTime).toBe("08:00:00");
		expect(deps[0].isDeparted).toBe(false);
		// 08:00 - 15分 = 07:45
		expect(deps[0].leaveByTime).toBe("07:45:00");
	});

	it("leaveByTime が負値の場合は 00:00:00 にクランプされる", () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 600,
			},
		];
		const { result } = renderHook(() => useDepartures(db, routes));

		expect(result.current.groups).toHaveLength(1);
		const deps = result.current.groups[0].departures;
		expect(deps[0].leaveByTime).toBe("00:00:00");
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

	it("notifyEnabled の変更では groups の参照が変わらない（再フェッチされない）", () => {
		const initialRoutes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
		];
		const { result, rerender } = renderHook(
			({ routes }: { routes: RegisteredRouteEntry[] }) =>
				useDepartures(db, routes),
			{ initialProps: { routes: initialRoutes } },
		);

		const groupsBefore = result.current.groups;
		expect(groupsBefore).toHaveLength(1);

		// notifyEnabled のみ変更した新しい配列（別参照）を渡す
		const toggledRoutes: RegisteredRouteEntry[] = [
			{ ...initialRoutes[0], notifyEnabled: true },
		];
		rerender({ routes: toggledRoutes });

		// 発車案内には影響しないフィールドなので groups の参照は不変
		expect(result.current.groups).toBe(groupsBefore);
	});
});

describe("現行期間と前期間が重なるとき", () => {
	/** 分単位の値を HH:MM:SS へ整形する */
	function timeStr(minutesFromMidnight: number): string {
		const h = Math.floor(minutesFromMidnight / 60);
		const m = minutesFromMidnight % 60;
		return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
	}

	/** S001 → S002 の便だけを持つダイヤを組み立てる */
	function buildScheduleGtfs(
		startDate: string,
		trips: { tripId: string; departureMinutes: number }[],
	): GtfsData {
		return {
			agency: baseGtfs.agency,
			stops: baseGtfs.stops,
			routes: baseGtfs.routes,
			trips: trips.map((t) => ({
				trip_id: t.tripId,
				route_id: "R001",
				service_id: "WD",
				trip_headsign: "市役所方面",
			})),
			stop_times: trips.flatMap((t) => [
				{
					trip_id: t.tripId,
					arrival_time: timeStr(t.departureMinutes),
					departure_time: timeStr(t.departureMinutes),
					stop_id: "S001",
					stop_sequence: 1,
				},
				{
					trip_id: t.tripId,
					arrival_time: timeStr(t.departureMinutes + 30),
					departure_time: timeStr(t.departureMinutes + 30),
					stop_id: "S002",
					stop_sequence: 2,
				},
			]),
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
					start_date: startDate,
					end_date: "20281231",
				},
			],
			calendar_dates: [],
			shapes: [],
			fare_attributes: [],
			fare_rules: [],
		};
	}

	/** 08:00 から 10 分間隔で 20 便 */
	const twentyTrips = Array.from({ length: 20 }, (_, i) => ({
		tripId: `T${String(i + 1).padStart(2, "0")}`,
		departureMinutes: 8 * 60 + i * 10,
	}));

	const routes: RegisteredRouteEntry[] = [
		{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 0 },
	];

	let overlapDb: InstanceType<(typeof SQL)["Database"]>;

	beforeEach(() => {
		overlapDb = new SQL.Database();
		createSchema(overlapDb);
	});

	afterEach(() => {
		overlapDb.close();
	});

	it("同一内容の前期間データがあっても取得上限が重複便に食われない", () => {
		loadGtfsData(overlapDb, buildScheduleGtfs("20260401", twentyTrips), "test");
		loadGtfsData(
			overlapDb,
			buildScheduleGtfs("20260101", twentyTrips),
			"test",
			"prev~",
		);

		const { result } = renderHook(() => useDepartures(overlapDb, routes));

		// getDepartures の取得上限は 15 件。重複便が混じると半分ほどに目減りする
		expect(result.current.groups[0].departures).toHaveLength(15);
	});

	it("改定で消えた便は現行ダイヤ開始後に表示しない", () => {
		loadGtfsData(overlapDb, buildScheduleGtfs("20260401", twentyTrips), "test");
		loadGtfsData(
			overlapDb,
			buildScheduleGtfs("20260101", [
				...twentyTrips,
				{ tripId: "T900", departureMinutes: 8 * 60 + 5 },
			]),
			"test",
			"prev~",
		);

		const { result } = renderHook(() => useDepartures(overlapDb, routes));

		const times = result.current.groups[0].departures.map(
			(d) => d.departureTime,
		);
		expect(times).not.toContain("08:05:00");
	});

	it("現行ダイヤ開始前は前期間の便を表示する", () => {
		const threeTrips = twentyTrips.slice(0, 3);
		loadGtfsData(overlapDb, buildScheduleGtfs("20260501", threeTrips), "test");
		loadGtfsData(
			overlapDb,
			buildScheduleGtfs("20260101", threeTrips),
			"test",
			"prev~",
		);

		const { result } = renderHook(() => useDepartures(overlapDb, routes));

		const departures = result.current.groups[0].departures;
		expect(departures).toHaveLength(3);
		// prev~ を除いた ID で返る（ハイライト・地図と ID を揃えるため）
		expect(departures[0].tripId).toBe("test:T01");
	});
});
