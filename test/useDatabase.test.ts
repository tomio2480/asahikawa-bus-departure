import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDatabase } from "../src/hooks/useDatabase";

const mockClose = vi.hoisted(() => vi.fn());

vi.mock("sql.js", () => {
	const mockDb = {
		exec: vi.fn(() => []),
		run: vi.fn(),
		prepare: vi.fn(),
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

describe("useDatabase", () => {
	afterEach(() => {
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

	it("アンマウント時に db.close() が呼ばれる", async () => {
		const { result, unmount } = renderHook(() => useDatabase());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		unmount();
		expect(mockClose).toHaveBeenCalled();
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
