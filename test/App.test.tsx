import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/hooks/useDatabase", () => ({
	useDatabase: vi.fn(),
}));

vi.mock("../src/hooks/useRoutes", () => ({
	useRoutes: vi.fn(),
}));

vi.mock("../src/hooks/useDepartures", () => ({
	useDepartures: vi.fn(),
}));

import { useDatabase } from "../src/hooks/useDatabase";
import { useDepartures } from "../src/hooks/useDepartures";
import { useRoutes } from "../src/hooks/useRoutes";

const mockUseDatabase = vi.mocked(useDatabase);
const mockUseRoutes = vi.mocked(useRoutes);
const mockUseDepartures = vi.mocked(useDepartures);

// DepartureBoard, RouteRegistration, MapView, ExpiryWarning は DB を必要とするためモック
vi.mock("../src/components/DepartureBoard", () => ({
	DepartureBoard: () => <div data-testid="departure-board" />,
}));

vi.mock("../src/components/RouteRegistration", () => ({
	RouteRegistration: () => <div data-testid="route-registration" />,
}));

let capturedMapRoutes: unknown[] = [];
vi.mock("../src/components/MapView", () => ({
	MapView: (props: { routes: unknown[] }) => {
		capturedMapRoutes = props.routes;
		return <div data-testid="map-view" />;
	},
}));

vi.mock("../src/components/ExpiryWarning", () => ({
	ExpiryWarning: () => <div data-testid="expiry-warning" />,
}));

vi.mock("../src/lib/data-expiry", () => ({
	getDataExpiry: vi.fn(() => null),
}));

import App from "../src/App";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	capturedMapRoutes = [];
});

function setupDefaultMocks(
	overrides: {
		db?: ReturnType<typeof useDatabase>;
		routes?: ReturnType<typeof useRoutes>;
		departures?: ReturnType<typeof useDepartures>;
	} = {},
) {
	mockUseDatabase.mockReturnValue(
		overrides.db ?? { db: null, error: null, loading: true },
	);
	mockUseRoutes.mockReturnValue(
		overrides.routes ?? {
			routes: [],
			loading: true,
			error: null,
			add: vi.fn(),
			update: vi.fn(),
			remove: vi.fn(),
			reload: vi.fn(),
		},
	);
	mockUseDepartures.mockReturnValue(
		overrides.departures ?? {
			groups: [],
			lastUpdated: null,
			error: null,
		},
	);
}

describe("App", () => {
	it("タイトルが表示される", () => {
		setupDefaultMocks();
		render(<App />);
		expect(screen.getByText("旭川バス発車案内")).toBeInTheDocument();
	});

	it("データ読み込み中はローディング表示される", () => {
		setupDefaultMocks();
		render(<App />);
		expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
		expect(screen.queryByTestId("departure-board")).not.toBeInTheDocument();
	});

	it("データベースエラー時にエラーメッセージが表示される", () => {
		setupDefaultMocks({
			db: {
				db: null,
				error: new Error("DB load failed"),
				loading: false,
			},
			routes: {
				routes: [],
				loading: false,
				error: null,
				add: vi.fn(),
				update: vi.fn(),
				remove: vi.fn(),
				reload: vi.fn(),
			},
		});
		render(<App />);
		expect(screen.getByText(/DB load failed/)).toBeInTheDocument();
	});

	it("経路データエラー時にエラーメッセージが表示される", () => {
		setupDefaultMocks({
			db: {
				db: {} as ReturnType<typeof useDatabase>["db"],
				error: null,
				loading: false,
			},
			routes: {
				routes: [],
				loading: false,
				error: new Error("IndexedDB not available"),
				add: vi.fn(),
				update: vi.fn(),
				remove: vi.fn(),
				reload: vi.fn(),
			},
		});
		render(<App />);
		expect(screen.getByText(/IndexedDB not available/)).toBeInTheDocument();
		expect(screen.queryByTestId("departure-board")).not.toBeInTheDocument();
	});

	it("読み込み完了後に発車案内と経路登録が表示される", () => {
		setupDefaultMocks({
			db: {
				db: {} as ReturnType<typeof useDatabase>["db"],
				error: null,
				loading: false,
			},
			routes: {
				routes: [],
				loading: false,
				error: null,
				add: vi.fn(),
				update: vi.fn(),
				remove: vi.fn(),
				reload: vi.fn(),
			},
		});
		render(<App />);
		expect(screen.getByTestId("departure-board")).toBeInTheDocument();
		expect(screen.getByTestId("route-registration")).toBeInTheDocument();
	});

	it("読み込み完了後に有効期限警告が表示される", () => {
		setupDefaultMocks({
			db: {
				db: {} as ReturnType<typeof useDatabase>["db"],
				error: null,
				loading: false,
			},
			routes: {
				routes: [],
				loading: false,
				error: null,
				add: vi.fn(),
				update: vi.fn(),
				remove: vi.fn(),
				reload: vi.fn(),
			},
		});
		render(<App />);
		expect(screen.getByTestId("expiry-warning")).toBeInTheDocument();
	});

	it("発車データがある場合に地図が表示される", () => {
		setupDefaultMocks({
			db: {
				db: {} as ReturnType<typeof useDatabase>["db"],
				error: null,
				loading: false,
			},
			routes: {
				routes: [],
				loading: false,
				error: null,
				add: vi.fn(),
				update: vi.fn(),
				remove: vi.fn(),
				reload: vi.fn(),
			},
			departures: {
				groups: [
					{
						toStopId: "stop1",
						toStopName: "テスト停留所",
						departures: [
							{
								tripId: "trip1",
								routeId: "route1",
								routeName: "テスト路線",
								headsign: "テスト行き",
								departureTime: "08:00:00",
								arrivalTime: "08:30:00",
								fromStopId: "from1",
								toStopId: "stop1",
								fare: null,
							},
						],
					},
				],
				lastUpdated: new Date(),
				error: null,
			},
		});
		render(<App />);
		expect(screen.getByText("経路マップ")).toBeInTheDocument();
		expect(screen.getByTestId("map-view")).toBeInTheDocument();
	});

	it("同一 tripId でも異なるバス停の経路は両方マップに渡される", () => {
		setupDefaultMocks({
			db: {
				db: {} as ReturnType<typeof useDatabase>["db"],
				error: null,
				loading: false,
			},
			routes: {
				routes: [],
				loading: false,
				error: null,
				add: vi.fn(),
				update: vi.fn(),
				remove: vi.fn(),
				reload: vi.fn(),
			},
			departures: {
				groups: [
					{
						toStopId: "stop1",
						toStopName: "停留所A",
						departures: [
							{
								tripId: "trip1",
								routeId: "route1",
								routeName: "路線1",
								headsign: "行き先A",
								departureTime: "08:00:00",
								arrivalTime: "08:30:00",
								fromStopId: "from1",
								toStopId: "stop1",
								fare: null,
							},
						],
					},
					{
						toStopId: "stop2",
						toStopName: "停留所B",
						departures: [
							{
								tripId: "trip1",
								routeId: "route1",
								routeName: "路線1",
								headsign: "行き先B",
								departureTime: "08:00:00",
								arrivalTime: "08:45:00",
								fromStopId: "from1",
								toStopId: "stop2",
								fare: null,
							},
						],
					},
				],
				lastUpdated: new Date(),
				error: null,
			},
		});
		render(<App />);
		expect(capturedMapRoutes).toHaveLength(2);
	});

	it("発車データがない場合は地図が表示されない", () => {
		setupDefaultMocks({
			db: {
				db: {} as ReturnType<typeof useDatabase>["db"],
				error: null,
				loading: false,
			},
			routes: {
				routes: [],
				loading: false,
				error: null,
				add: vi.fn(),
				update: vi.fn(),
				remove: vi.fn(),
				reload: vi.fn(),
			},
			departures: {
				groups: [],
				lastUpdated: new Date(),
				error: null,
			},
		});
		render(<App />);
		expect(screen.queryByText("経路マップ")).not.toBeInTheDocument();
		expect(screen.queryByTestId("map-view")).not.toBeInTheDocument();
	});
});
