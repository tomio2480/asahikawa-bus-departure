import { cleanup } from "@testing-library/react";
import { renderHook, waitFor } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { useDatabase } from "../src/hooks/useDatabase";

const mockClose = vi.hoisted(() => vi.fn());
const mockExec = vi.hoisted(() => vi.fn(() => []));
const mockRun = vi.hoisted(() => vi.fn());
const mockPrepare = vi.hoisted(() =>
	vi.fn(() => ({ run: vi.fn(), free: vi.fn() })),
);

vi.mock("sql.js", () => {
	const mockDb = {
		exec: mockExec,
		run: mockRun,
		prepare: mockPrepare,
		close: mockClose,
	};
	const MockDatabase = vi.fn(() => mockDb);
	return {
		default: vi.fn(() =>
			Promise.resolve({
				Database: MockDatabase,
			}),
		),
	};
});

const emptyGtfsData = {
	agency: [],
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

// fetch をモック
const mockFetch = vi.fn(() =>
	Promise.resolve({
		ok: true,
		json: () => Promise.resolve(emptyGtfsData),
	}),
) as unknown as typeof globalThis.fetch;

vi.stubGlobal("fetch", mockFetch);

describe("useDatabase", () => {
	afterAll(() => {
		vi.unstubAllGlobals();
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("初期状態は loading: true", () => {
		const { result } = renderHook(() => useDatabase());
		expect(result.current.loading).toBe(true);
		expect(result.current.db).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("初期化完了後に db が返される", async () => {
		const { result } = renderHook(() => useDatabase());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.db).not.toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("3 社分の GTFS データを fetch する", async () => {
		const { result } = renderHook(() => useDatabase());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(mockFetch).toHaveBeenCalledTimes(3);
		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining("asahikawa_denkikido.json"),
		);
		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining("dohoku_bus.json"),
		);
		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining("furano_bus.json"),
		);
	});

	it("アンマウント時に db.close() が呼ばれる", async () => {
		const { result, unmount } = renderHook(() => useDatabase());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		unmount();
		expect(mockClose).toHaveBeenCalled();
	});

	it("fetch 失敗時に error が設定される", async () => {
		(mockFetch as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
			Promise.resolve({
				ok: false,
				status: 404,
				json: () => Promise.resolve({}),
			} as Response),
		);

		const { result } = renderHook(() => useDatabase());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.db).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toContain("404");
	});
});

describe("useDatabase（初期化失敗）", () => {
	it("初期化失敗時に error が設定される", async () => {
		vi.resetModules();

		vi.doMock("sql.js", () => ({
			default: vi.fn(() => Promise.reject(new Error("WASM load failed"))),
		}));

		const { useDatabase: useDatabaseFresh } = await import(
			"../src/hooks/useDatabase"
		);
		const { result } = renderHook(() => useDatabaseFresh());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.db).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("WASM load failed");
	});
});
