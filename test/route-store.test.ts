import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
	addRoute,
	deleteRoute,
	exportRoutes,
	getAllRoutes,
	getRoute,
	importRoutes,
	updateRoute,
} from "../src/lib/route-store";

beforeEach(() => {
	// 各テストの前に IndexedDB をリセット
	globalThis.indexedDB = new IDBFactory();
});

describe("CRUD 操作", () => {
	it("経路を追加して取得できる", async () => {
		const id = await addRoute({
			fromStopId: "S001",
			toStopId: "S002",
			walkMinutes: 5,
		});
		expect(id).toBe(1);

		const route = await getRoute(id);
		expect(route).toEqual({
			id: 1,
			fromStopId: "S001",
			toStopId: "S002",
			walkMinutes: 5,
		});
	});

	it("複数の経路を追加して全件取得できる", async () => {
		await addRoute({ fromStopId: "S001", toStopId: "S002", walkMinutes: 5 });
		await addRoute({ fromStopId: "S003", toStopId: "S004", walkMinutes: 10 });

		const routes = await getAllRoutes();
		expect(routes).toHaveLength(2);
	});

	it("経路を更新できる", async () => {
		const id = await addRoute({
			fromStopId: "S001",
			toStopId: "S002",
			walkMinutes: 5,
		});
		await updateRoute({
			id,
			fromStopId: "S001",
			toStopId: "S002",
			walkMinutes: 10,
		});

		const route = await getRoute(id);
		expect(route?.walkMinutes).toBe(10);
	});

	it("id なしで更新するとエラーになる", async () => {
		await expect(
			updateRoute({
				fromStopId: "S001",
				toStopId: "S002",
				walkMinutes: 5,
			} as never),
		).rejects.toThrow("Route id is required for update");
	});

	it("経路を削除できる", async () => {
		const id = await addRoute({
			fromStopId: "S001",
			toStopId: "S002",
			walkMinutes: 5,
		});
		await deleteRoute(id);

		const route = await getRoute(id);
		expect(route).toBeUndefined();
	});

	it("存在しない ID の取得は undefined を返す", async () => {
		const route = await getRoute(999);
		expect(route).toBeUndefined();
	});
});

describe("入力値のサニタイズ", () => {
	it("walkMinutes の負値は 0 になる", async () => {
		const id = await addRoute({
			fromStopId: "S001",
			toStopId: "S002",
			walkMinutes: -5,
		});
		const route = await getRoute(id);
		expect(route?.walkMinutes).toBe(0);
	});

	it("walkMinutes の小数は切り捨てられる", async () => {
		const id = await addRoute({
			fromStopId: "S001",
			toStopId: "S002",
			walkMinutes: 5.9,
		});
		const route = await getRoute(id);
		expect(route?.walkMinutes).toBe(5);
	});

	it("walkMinutes が NaN の場合は 0 になる", async () => {
		const id = await addRoute({
			fromStopId: "S001",
			toStopId: "S002",
			walkMinutes: Number.NaN,
		});
		const route = await getRoute(id);
		expect(route?.walkMinutes).toBe(0);
	});
});

describe("JSON エクスポート", () => {
	it("全経路を version 付きで出力する", async () => {
		await addRoute({ fromStopId: "S001", toStopId: "S002", walkMinutes: 5 });
		await addRoute({ fromStopId: "S003", toStopId: "S004", walkMinutes: 10 });

		const exported = await exportRoutes();
		expect(exported.version).toBe(1);
		expect(exported.routes).toHaveLength(2);
		expect(exported.routes[0]).toEqual({
			fromStopId: "S001",
			toStopId: "S002",
			walkMinutes: 5,
		});
	});

	it("エクスポートデータに id を含まない", async () => {
		await addRoute({ fromStopId: "S001", toStopId: "S002", walkMinutes: 5 });

		const exported = await exportRoutes();
		expect("id" in exported.routes[0]).toBe(false);
	});
});

describe("JSON インポート", () => {
	it("正しい形式のデータをインポートできる", async () => {
		const json = JSON.stringify({
			version: 1,
			routes: [
				{ fromStopId: "S001", toStopId: "S002", walkMinutes: 5 },
				{ fromStopId: "S003", toStopId: "S004", walkMinutes: 10 },
			],
		});

		const count = await importRoutes(json);
		expect(count).toBe(2);

		const routes = await getAllRoutes();
		expect(routes).toHaveLength(2);
	});

	it("stop_id の存在確認ができる", async () => {
		const validStopIds = new Set(["S001", "S002"]);
		const json = JSON.stringify({
			version: 1,
			routes: [{ fromStopId: "S001", toStopId: "S999", walkMinutes: 5 }],
		});

		await expect(importRoutes(json, validStopIds)).rejects.toThrow(
			"Unknown stop_id: S999",
		);
	});

	it("既存データに追加される", async () => {
		await addRoute({ fromStopId: "S001", toStopId: "S002", walkMinutes: 5 });

		const json = JSON.stringify({
			version: 1,
			routes: [{ fromStopId: "S003", toStopId: "S004", walkMinutes: 10 }],
		});
		await importRoutes(json);

		const routes = await getAllRoutes();
		expect(routes).toHaveLength(2);
	});
});

describe("インポートバリデーション", () => {
	it("不正な JSON はエラーになる", async () => {
		await expect(importRoutes("not json")).rejects.toThrow();
	});

	it("version が異なるとエラーになる", async () => {
		const json = JSON.stringify({ version: 2, routes: [] });
		await expect(importRoutes(json)).rejects.toThrow("Unsupported version: 2");
	});

	it("routes が配列でないとエラーになる", async () => {
		const json = JSON.stringify({ version: 1, routes: "invalid" });
		await expect(importRoutes(json)).rejects.toThrow("routes must be an array");
	});

	it("配列がルートだとエラーになる", async () => {
		const json = JSON.stringify([1, 2, 3]);
		await expect(importRoutes(json)).rejects.toThrow("arrays are not allowed");
	});

	it("fromStopId が空文字だとエラーになる", async () => {
		const json = JSON.stringify({
			version: 1,
			routes: [{ fromStopId: "", toStopId: "S002", walkMinutes: 5 }],
		});
		await expect(importRoutes(json)).rejects.toThrow(
			"fromStopId must be a non-empty string",
		);
	});

	it("walkMinutes が数値でないとエラーになる", async () => {
		const json = JSON.stringify({
			version: 1,
			routes: [{ fromStopId: "S001", toStopId: "S002", walkMinutes: "abc" }],
		});
		await expect(importRoutes(json)).rejects.toThrow(
			"walkMinutes must be a finite number",
		);
	});

	it("サイズ上限を超えるとエラーになる", async () => {
		const huge = "x".repeat(1024 * 1024 + 1);
		await expect(importRoutes(huge)).rejects.toThrow("exceeds maximum size");
	});

	it("経路数上限を超えるとエラーになる", async () => {
		const routes = Array.from({ length: 1001 }, (_, i) => ({
			fromStopId: `S${i}`,
			toStopId: `S${i + 1}`,
			walkMinutes: 5,
		}));
		const json = JSON.stringify({ version: 1, routes });
		await expect(importRoutes(json)).rejects.toThrow("maximum is 1000");
	});

	it("プロトタイプ汚染を防ぐ（__proto__ キーを持つオブジェクト）", async () => {
		const json =
			'{"version":1,"routes":[{"fromStopId":"S001","toStopId":"S002","walkMinutes":5,"__proto__":{"polluted":true}}]}';
		const count = await importRoutes(json);
		expect(count).toBe(1);
		// プロトタイプが汚染されていないことを確認
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});
});
