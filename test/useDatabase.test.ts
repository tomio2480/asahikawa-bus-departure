import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDatabase } from "../src/hooks/useDatabase";

vi.mock("sql.js", () => {
	const mockDb = {
		exec: vi.fn((sql: string) => {
			if (sql.includes("sqlite_master")) {
				return [
					{
						columns: ["name"],
						values: [
							["agency"],
							["stops"],
							["routes"],
							["trips"],
							["stop_times"],
							["calendar"],
							["calendar_dates"],
							["shapes"],
							["fare_attributes"],
							["fare_rules"],
						],
					},
				];
			}
			return [];
		}),
		run: vi.fn(),
		prepare: vi.fn(),
		close: vi.fn(),
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
});
