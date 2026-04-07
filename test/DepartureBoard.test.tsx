import { cleanup, render, screen } from "@testing-library/react";
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
import { DepartureBoard } from "../src/components/DepartureBoard";
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
			price: 290,
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
	// 2026-04-07 (火曜) 07:50 JST
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-04-07T07:50:00+09:00"));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	db.close();
});

describe("DepartureBoard コンポーネント", () => {
	it("経路未登録の場合はメッセージを表示する", () => {
		render(<DepartureBoard db={db} routes={[]} />);
		expect(screen.getByText(/経路が登録されていません/)).toBeInTheDocument();
	});

	it("降車バス停名がグループ見出しとして表示される", () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 0,
			},
		];
		render(<DepartureBoard db={db} routes={routes} />);
		expect(screen.getByText("市役所前")).toBeInTheDocument();
	});

	it("発車時刻と到着時刻が HH:MM 形式で表示される", () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 0,
			},
		];
		render(<DepartureBoard db={db} routes={routes} />);
		expect(screen.getByText("08:00")).toBeInTheDocument();
		expect(screen.getByText("08:30")).toBeInTheDocument();
	});

	it("路線名と行き先が表示される", () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 0,
			},
		];
		render(<DepartureBoard db={db} routes={routes} />);
		const routeNames = screen.getAllByText("1番");
		expect(routeNames.length).toBeGreaterThanOrEqual(1);
		const headsigns = screen.getAllByText("市役所方面");
		expect(headsigns.length).toBeGreaterThanOrEqual(1);
	});

	it("複数の降車バス停がそれぞれグルーピングされる", () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 0,
			},
			{
				id: 2,
				fromStopId: "test:S001",
				toStopId: "test:S003",
				walkMinutes: 0,
			},
		];
		render(<DepartureBoard db={db} routes={routes} />);
		expect(screen.getByText("市役所前")).toBeInTheDocument();
		expect(screen.getByText("旭川四条駅")).toBeInTheDocument();
	});

	it("発車予定がない場合はメッセージを表示する", () => {
		// 全便終了後の時刻に設定
		vi.setSystemTime(new Date("2026-04-07T23:00:00+09:00"));
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 0,
			},
		];
		render(<DepartureBoard db={db} routes={routes} />);
		expect(screen.getByText("現在の発車予定はありません")).toBeInTheDocument();
	});

	it("最終更新時刻が表示される", () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 0,
			},
		];
		render(<DepartureBoard db={db} routes={routes} />);
		expect(screen.getByText(/最終更新/)).toBeInTheDocument();
	});

	it("テーブルヘッダーが表示される", () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 0,
			},
		];
		render(<DepartureBoard db={db} routes={routes} />);
		expect(screen.getByText("発車")).toBeInTheDocument();
		expect(screen.getByText("到着")).toBeInTheDocument();
		expect(screen.getByText("路線")).toBeInTheDocument();
		expect(screen.getByText("行き先")).toBeInTheDocument();
		expect(screen.getByText("運賃")).toBeInTheDocument();
	});

	it("エラー発生時はエラーメッセージを表示する", () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 0,
			},
		];
		// DB を閉じてクエリを失敗させる
		db.close();
		render(<DepartureBoard db={db} routes={routes} />);
		expect(
			screen.getByText(/発車案内の取得に失敗しました/),
		).toBeInTheDocument();
		// afterEach で db.close() が再度呼ばれてもエラーにならないよう再生成
		db = new SQL.Database();
	});

	it("運賃が表示される", () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 0,
			},
		];
		render(<DepartureBoard db={db} routes={routes} />);
		const fares = screen.getAllByText("290円");
		expect(fares.length).toBeGreaterThanOrEqual(1);
	});

	it("運賃がない場合はハイフンを表示する", () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S003",
				walkMinutes: 0,
			},
		];
		render(<DepartureBoard db={db} routes={routes} />);
		expect(screen.getByText("-")).toBeInTheDocument();
	});

	it("Asaca 乗り継ぎ割引の注釈が表示される", () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 0,
			},
		];
		render(<DepartureBoard db={db} routes={routes} />);
		expect(screen.getByText(/Asaca/)).toBeInTheDocument();
		expect(screen.getByText(/100円引き/)).toBeInTheDocument();
	});

	it("徒歩時間を考慮して乗れない便は表示されない", () => {
		// 07:50 + 徒歩15分 = 08:05 → 08:00の便は乗れない
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 15,
			},
		];
		render(<DepartureBoard db={db} routes={routes} />);
		expect(screen.queryByText("08:00")).not.toBeInTheDocument();
		expect(screen.getByText("09:00")).toBeInTheDocument();
	});
});
