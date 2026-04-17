import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotification } from "../src/hooks/useNotification";
import type { Departure } from "../src/lib/departure-query";
import type { RegisteredRouteEntry } from "../src/types/route-entry";

const mockNotificationConstructor = vi.fn();

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });

	Object.defineProperty(globalThis, "Notification", {
		writable: true,
		configurable: true,
		value: Object.assign(mockNotificationConstructor, {
			permission: "granted" as NotificationPermission,
			requestPermission: vi.fn().mockResolvedValue("granted"),
		}),
	});

	mockNotificationConstructor.mockClear();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function makeDeparture(overrides?: Partial<Departure & { toStopName: string; isNextDay?: boolean }>): Departure & { toStopName: string; isNextDay?: boolean } {
	return {
		tripId: "T001",
		routeId: "R001",
		routeName: "77-旭川線",
		headsign: "旭川空港行き",
		departureTime: "08:10:00",
		arrivalTime: "08:37:00",
		fromStopId: "test:S001",
		toStopId: "test:S002",
		shapeId: null,
		fare: { fareId: "F001", price: 560, currencyType: "JPY" },
		fromStopName: "旭川医大病院前",
		toStopName: "旭川空港",
		...overrides,
	};
}

function makeRoute(overrides?: Partial<RegisteredRouteEntry>): RegisteredRouteEntry {
	return {
		id: 1,
		fromStopId: "test:S001",
		toStopId: "test:S002",
		walkMinutes: 10,
		notifyEnabled: true,
		...overrides,
	};
}

describe("useNotification", () => {
	it("通知が有効な経路の出発N分前に通知が送信される", () => {
		vi.setSystemTime(new Date("2026-04-17T08:05:00+09:00"));

		renderHook(() =>
			useNotification({
				departures: [makeDeparture()],
				routes: [makeRoute()],
				notifyBeforeMinutes: 5,
				enabled: true,
			}),
		);

		expect(mockNotificationConstructor).toHaveBeenCalledOnce();
		expect(mockNotificationConstructor.mock.calls[0][0]).toContain("5分前");
	});

	it("notifyEnabled が false の経路は通知されない", () => {
		vi.setSystemTime(new Date("2026-04-17T08:05:00+09:00"));

		renderHook(() =>
			useNotification({
				departures: [makeDeparture()],
				routes: [makeRoute({ notifyEnabled: false })],
				notifyBeforeMinutes: 5,
				enabled: true,
			}),
		);

		expect(mockNotificationConstructor).not.toHaveBeenCalled();
	});

	it("同じ便に対して重複通知しない", () => {
		vi.setSystemTime(new Date("2026-04-17T08:05:00+09:00"));
		const departures = [makeDeparture()];
		const routes = [makeRoute()];

		const { rerender } = renderHook(
			({ deps }) => useNotification(deps),
			{
				initialProps: {
					deps: { departures, routes, notifyBeforeMinutes: 5, enabled: true },
				},
			},
		);

		expect(mockNotificationConstructor).toHaveBeenCalledOnce();

		rerender({
			deps: { departures, routes, notifyBeforeMinutes: 5, enabled: true },
		});

		expect(mockNotificationConstructor).toHaveBeenCalledOnce();
	});

	it("パーミッションが denied の場合は通知しない", () => {
		vi.setSystemTime(new Date("2026-04-17T08:05:00+09:00"));
		(globalThis.Notification as unknown as { permission: string }).permission = "denied";

		renderHook(() =>
			useNotification({
				departures: [makeDeparture()],
				routes: [makeRoute()],
				notifyBeforeMinutes: 5,
				enabled: true,
			}),
		);

		expect(mockNotificationConstructor).not.toHaveBeenCalled();
	});

	it("出発時刻を過ぎた便は通知しない", () => {
		vi.setSystemTime(new Date("2026-04-17T08:11:00+09:00"));

		renderHook(() =>
			useNotification({
				departures: [makeDeparture()],
				routes: [makeRoute()],
				notifyBeforeMinutes: 5,
				enabled: true,
			}),
		);

		expect(mockNotificationConstructor).not.toHaveBeenCalled();
	});

	it("enabled が false の場合は通知しない", () => {
		vi.setSystemTime(new Date("2026-04-17T08:05:00+09:00"));

		renderHook(() =>
			useNotification({
				departures: [makeDeparture()],
				routes: [makeRoute()],
				notifyBeforeMinutes: 5,
				enabled: false,
			}),
		);

		expect(mockNotificationConstructor).not.toHaveBeenCalled();
	});

	it("通知の body に発車時刻、乗車バス停名、到着時刻、行先、運賃、路線名が含まれる", () => {
		vi.setSystemTime(new Date("2026-04-17T08:05:00+09:00"));

		renderHook(() =>
			useNotification({
				departures: [makeDeparture()],
				routes: [makeRoute()],
				notifyBeforeMinutes: 5,
				enabled: true,
			}),
		);

		const body = mockNotificationConstructor.mock.calls[0][1]?.body as string;
		expect(body).toContain("08:10");
		expect(body).toContain("旭川医大病院前");
		expect(body).toContain("08:37");
		expect(body).toContain("旭川空港");
		expect(body).toContain("560円");
		expect(body).toContain("77-旭川線");
	});

	it("Notification API が未対応の環境では通知しない", () => {
		vi.setSystemTime(new Date("2026-04-17T08:05:00+09:00"));
		// @ts-expect-error テスト用に Notification を undefined にする
		globalThis.Notification = undefined;

		const { result } = renderHook(() =>
			useNotification({
				departures: [makeDeparture()],
				routes: [makeRoute()],
				notifyBeforeMinutes: 5,
				enabled: true,
			}),
		);

		expect(result.current.permission).toBe("unsupported");
		expect(mockNotificationConstructor).not.toHaveBeenCalled();
	});

	it("notifyEnabled が undefined の経路は通知されない", () => {
		vi.setSystemTime(new Date("2026-04-17T08:05:00+09:00"));

		renderHook(() =>
			useNotification({
				departures: [makeDeparture()],
				routes: [makeRoute({ notifyEnabled: undefined })],
				notifyBeforeMinutes: 5,
				enabled: true,
			}),
		);

		expect(mockNotificationConstructor).not.toHaveBeenCalled();
	});

	it("翌日便（isNextDay）は通知対象外である", () => {
		vi.setSystemTime(new Date("2026-04-17T08:05:00+09:00"));

		renderHook(() =>
			useNotification({
				departures: [makeDeparture({ isNextDay: true })],
				routes: [makeRoute()],
				notifyBeforeMinutes: 5,
				enabled: true,
			}),
		);

		expect(mockNotificationConstructor).not.toHaveBeenCalled();
	});
});
