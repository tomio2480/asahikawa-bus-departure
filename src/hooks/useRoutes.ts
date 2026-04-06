import { useCallback, useEffect, useState } from "react";
import {
	addRoute,
	deleteRoute,
	getAllRoutes,
	updateRoute,
} from "../lib/route-store";
import type { RegisteredRouteEntry, RouteEntry } from "../types/route-entry";

type UseRoutesReturn = {
	/** 登録済み経路一覧 */
	routes: RegisteredRouteEntry[];
	/** データ読み込み中 */
	loading: boolean;
	/** エラー情報 */
	error: Error | null;
	/** 経路を追加する */
	add: (entry: Omit<RouteEntry, "id">) => Promise<number>;
	/** 経路を更新する */
	update: (entry: RegisteredRouteEntry) => Promise<void>;
	/** 経路を削除する */
	remove: (id: number) => Promise<void>;
	/** 経路一覧を再読み込みする */
	reload: () => Promise<void>;
};

/** IndexedDB の経路データを管理するフック */
export function useRoutes(): UseRoutesReturn {
	const [routes, setRoutes] = useState<RegisteredRouteEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			const all = await getAllRoutes();
			setRoutes(all as RegisteredRouteEntry[]);
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e : new Error(String(e)));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		reload();
	}, [reload]);

	const add = useCallback(
		async (entry: Omit<RouteEntry, "id">) => {
			const id = await addRoute(entry);
			await reload();
			return id;
		},
		[reload],
	);

	const update = useCallback(
		async (entry: RegisteredRouteEntry) => {
			await updateRoute(entry);
			await reload();
		},
		[reload],
	);

	const remove = useCallback(
		async (id: number) => {
			await deleteRoute(id);
			await reload();
		},
		[reload],
	);

	return { routes, loading, error, add, update, remove, reload };
}
