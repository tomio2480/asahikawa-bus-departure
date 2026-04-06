import "fake-indexeddb/auto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useRoutes } from "../src/hooks/useRoutes";
import { addRoute } from "../src/lib/route-store";

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
});

describe("useRoutes", () => {
	const waitForLoaded = async (result: {
		current: { loading: boolean };
	}) => {
		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});
	};

	it("初期状態は空の経路一覧を返す", async () => {
		const { result } = renderHook(() => useRoutes());
		await waitForLoaded(result);
		expect(result.current.routes).toEqual([]);
		expect(result.current.error).toBeNull();
	});

	it("既存の経路を読み込む", async () => {
		await addRoute({
			fromStopId: "S001",
			toStopId: "S002",
			walkMinutes: 5,
		});

		const { result } = renderHook(() => useRoutes());
		await waitForLoaded(result);

		expect(result.current.routes).toHaveLength(1);
		expect(result.current.routes[0].fromStopId).toBe("S001");
	});

	it("add で経路を追加し一覧が更新される", async () => {
		const { result } = renderHook(() => useRoutes());
		await waitForLoaded(result);

		await act(async () => {
			const id = await result.current.add({
				fromStopId: "S001",
				toStopId: "S002",
				walkMinutes: 5,
			});
			expect(id).toBe(1);
		});

		expect(result.current.routes).toHaveLength(1);
	});

	it("update で経路を更新し一覧が反映される", async () => {
		const { result } = renderHook(() => useRoutes());
		await waitForLoaded(result);

		await act(async () => {
			await result.current.add({
				fromStopId: "S001",
				toStopId: "S002",
				walkMinutes: 5,
			});
		});

		await act(async () => {
			await result.current.update({
				id: result.current.routes[0].id,
				fromStopId: "S001",
				toStopId: "S002",
				walkMinutes: 10,
			});
		});

		expect(result.current.routes[0].walkMinutes).toBe(10);
	});

	it("remove で経路を削除し一覧から消える", async () => {
		const { result } = renderHook(() => useRoutes());
		await waitForLoaded(result);

		await act(async () => {
			await result.current.add({
				fromStopId: "S001",
				toStopId: "S002",
				walkMinutes: 5,
			});
		});
		expect(result.current.routes).toHaveLength(1);

		await act(async () => {
			await result.current.remove(result.current.routes[0].id as number);
		});

		expect(result.current.routes).toHaveLength(0);
	});
});
