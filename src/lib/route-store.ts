import type { RouteEntry, RouteEntryExport } from "../types/route-entry";

const DB_NAME = "asahikawa-bus-departure";
const DB_VERSION = 1;
const STORE_NAME = "routes";

/** エクスポート形式のバージョン番号 */
const EXPORT_VERSION = 1 as const;

/** JSON インポート時の最大サイズ（バイト） */
const MAX_IMPORT_SIZE = 1024 * 1024;

/** JSON インポート時の最大経路数 */
const MAX_ROUTE_COUNT = 1000;

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onblocked = () => {
			reject(new Error("Database upgrade blocked by another connection"));
		};
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, {
					keyPath: "id",
					autoIncrement: true,
				});
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/** 経路を追加する */
export async function addRoute(entry: Omit<RouteEntry, "id">): Promise<number> {
	const sanitized = sanitizeEntry(entry);
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		const request = store.add(sanitized);
		let id: number;
		request.onsuccess = () => {
			id = request.result as number;
		};
		tx.oncomplete = () => {
			db.close();
			resolve(id);
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
	});
}

/** 経路を ID で取得する */
export async function getRoute(id: number): Promise<RouteEntry | undefined> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readonly");
		const store = tx.objectStore(STORE_NAME);
		const request = store.get(id);
		let result: RouteEntry | undefined;
		request.onsuccess = () => {
			result = request.result as RouteEntry | undefined;
		};
		tx.oncomplete = () => {
			db.close();
			resolve(result);
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
	});
}

/** 全経路を取得する */
export async function getAllRoutes(): Promise<RouteEntry[]> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readonly");
		const store = tx.objectStore(STORE_NAME);
		const request = store.getAll();
		let result: RouteEntry[] = [];
		request.onsuccess = () => {
			result = request.result as RouteEntry[];
		};
		tx.oncomplete = () => {
			db.close();
			resolve(result);
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
	});
}

/** 経路を更新する */
export async function updateRoute(entry: RouteEntry): Promise<void> {
	if (entry.id == null) {
		throw new Error("Route id is required for update");
	}
	const sanitized = { ...sanitizeEntry(entry), id: entry.id };
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		const getRequest = store.get(entry.id as number);
		getRequest.onsuccess = () => {
			if (getRequest.result == null) {
				tx.abort();
				return;
			}
			store.put(sanitized);
		};
		getRequest.onerror = () => {
			tx.abort();
		};
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
		tx.onabort = () => {
			db.close();
			reject(tx.error ?? new Error(`Route not found: ${entry.id}`));
		};
	});
}

/** 経路を削除する */
export async function deleteRoute(id: number): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		store.delete(id);
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
	});
}

/** 全経路を JSON エクスポート形式で返す */
export async function exportRoutes(): Promise<RouteEntryExport> {
	const routes = await getAllRoutes();
	return {
		version: EXPORT_VERSION,
		routes: routes.map(({ fromStopId, toStopId, walkMinutes }) => ({
			fromStopId,
			toStopId,
			walkMinutes,
		})),
	};
}

/** JSON 文字列から経路をインポートする */
export async function importRoutes(
	json: string,
	validStopIds?: Set<string>,
): Promise<number> {
	if (new TextEncoder().encode(json).byteLength > MAX_IMPORT_SIZE) {
		throw new Error(
			`Import data exceeds maximum size of ${MAX_IMPORT_SIZE} bytes`,
		);
	}

	const data: unknown = JSON.parse(json);
	validateExportFormat(data);

	const exported = data as RouteEntryExport;
	if (exported.routes.length > MAX_ROUTE_COUNT) {
		throw new Error(
			`Import data contains ${exported.routes.length} routes, maximum is ${MAX_ROUTE_COUNT}`,
		);
	}

	for (const route of exported.routes) {
		validateRouteFields(route);
		if (validStopIds) {
			if (!validStopIds.has(route.fromStopId)) {
				throw new Error(`Unknown stop_id: ${route.fromStopId}`);
			}
			if (!validStopIds.has(route.toStopId)) {
				throw new Error(`Unknown stop_id: ${route.toStopId}`);
			}
		}
	}

	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		let count = 0;
		for (const route of exported.routes) {
			const entry = sanitizeEntry(route);
			const request = store.add(entry);
			request.onsuccess = () => {
				count++;
			};
			request.onerror = () => {
				tx.abort();
			};
		}
		tx.oncomplete = () => {
			db.close();
			resolve(count);
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
		tx.onabort = () => {
			db.close();
			reject(tx.error ?? new Error("Import aborted due to an error"));
		};
	});
}

/** 入力値をバリデーションし正規化する */
function sanitizeEntry(entry: Omit<RouteEntry, "id">): Omit<RouteEntry, "id"> {
	validateRouteFields(entry);
	return {
		fromStopId: entry.fromStopId,
		toStopId: entry.toStopId,
		walkMinutes: Math.max(0, Math.floor(entry.walkMinutes)),
	};
}

/** エクスポート形式のバリデーション */
function validateExportFormat(data: unknown): asserts data is RouteEntryExport {
	if (data == null || typeof data !== "object") {
		throw new Error("Invalid import data: not an object");
	}
	if (Array.isArray(data)) {
		throw new Error("Invalid import data: arrays are not allowed");
	}
	const obj = data as Record<string, unknown>;
	if (obj.version !== EXPORT_VERSION) {
		throw new Error(`Unsupported version: ${String(obj.version)}`);
	}
	if (!Array.isArray(obj.routes)) {
		throw new Error("Invalid import data: routes must be an array");
	}
}

/** 経路フィールドのバリデーション */
function validateRouteFields(route: unknown): void {
	if (route == null || typeof route !== "object") {
		throw new Error("Invalid route entry: not an object");
	}
	if (Array.isArray(route)) {
		throw new Error("Invalid route entry: arrays are not allowed");
	}
	const r = route as Record<string, unknown>;
	if (typeof r.fromStopId !== "string" || r.fromStopId === "") {
		throw new Error(
			"Invalid route entry: fromStopId must be a non-empty string",
		);
	}
	if (typeof r.toStopId !== "string" || r.toStopId === "") {
		throw new Error("Invalid route entry: toStopId must be a non-empty string");
	}
	if (typeof r.walkMinutes !== "number" || !Number.isFinite(r.walkMinutes)) {
		throw new Error("Invalid route entry: walkMinutes must be a finite number");
	}
}
