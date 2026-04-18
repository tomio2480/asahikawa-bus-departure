import "fake-indexeddb/auto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRoutes } from "../src/hooks/useRoutes";
import * as routeStore from "../src/lib/route-store";
import { addRoute } from "../src/lib/route-store";
import type { RouteEntry } from "../src/types/route-entry";

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

	it("初回ロード完了後に update/add/remove が loading を再び true にしない（画面再マウント防止）", async () => {
		// 各 render の loading を収集する
		const loadingHistory: boolean[] = [];
		const { result } = renderHook(() => {
			const r = useRoutes();
			loadingHistory.push(r.loading);
			return r;
		});
		await waitForLoaded(result);

		// 初回ロードが完了し false に遷移したインデックスを特定
		const firstFalseIndex = loadingHistory.indexOf(false);
		expect(firstFalseIndex).toBeGreaterThanOrEqual(0);

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

		await act(async () => {
			await result.current.remove(result.current.routes[0].id);
		});

		// 初回ロード完了後のどの render でも loading が true に戻っていない
		const afterFirstLoad = loadingHistory.slice(firstFalseIndex);
		expect(afterFirstLoad.some((v) => v === true)).toBe(false);
	});

	it("初回ロード失敗後の reload では loading=true が再度設定される", async () => {
		// 初回 getAllRoutes を失敗させると hasLoadedOnceRef が誤って true に
		// 設定されるバグがあり、その後の reload で setLoading(true) が呼ばれない。
		// LoadingSpinner が表示されずユーザーへのフィードバックが欠落する。
		let resolveSecondCall: (value: RouteEntry[]) => void = () => {};
		const getAllRoutesSpy = vi
			.spyOn(routeStore, "getAllRoutes")
			.mockRejectedValueOnce(new Error("初回 IndexedDB アクセス失敗"))
			.mockImplementationOnce(
				() =>
					new Promise((r) => {
						resolveSecondCall = r;
					}),
			);

		const { result } = renderHook(() => useRoutes());

		// 初回ロードの失敗が反映されるまで待つ
		await waitFor(() => {
			expect(result.current.error).not.toBeNull();
		});
		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// reload を開始する（await しない。2 回目のコールは pending のまま）
		let reloadPromise: Promise<void> = Promise.resolve();
		act(() => {
			reloadPromise = result.current.reload();
		});

		// 2 回目の getAllRoutes が解決する前に loading=true になる必要がある
		await waitFor(() => {
			expect(result.current.loading).toBe(true);
		});

		// 2 回目の呼び出しを解決して reload を完了させる
		resolveSecondCall([]);
		await act(async () => {
			await reloadPromise;
		});

		// 成功後 loading=false に戻り、error もクリアされる
		expect(result.current.loading).toBe(false);
		expect(result.current.error).toBeNull();

		getAllRoutesSpy.mockRestore();
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
			await result.current.remove(result.current.routes[0].id);
		});

		expect(result.current.routes).toHaveLength(0);
	});
});
