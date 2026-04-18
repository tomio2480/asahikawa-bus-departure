import { useCallback, useEffect, useRef, useState } from "react";
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
	const reloadSeqRef = useRef(0);
	// 初回ロード完了後は setLoading(true) を呼ばない。
	// add/update/remove 後の reload で loading が true に戻ると
	// App.tsx の `{db && !loading && !error && (...)}` ブロックが
	// 一時的にアンマウントされ、ページのスクロール位置が先頭に戻る
	// （MapView/DepartureBoard/RouteRegistration が再マウントされる）。
	// 画面ちらつきとスクロール飛びを防ぐため、リロードは静かに行う。
	const hasLoadedOnceRef = useRef(false);

	const reload = useCallback(async () => {
		const seq = ++reloadSeqRef.current;
		if (!hasLoadedOnceRef.current) {
			setLoading(true);
		}
		try {
			const all = await getAllRoutes();
			const registered = all.filter(
				(route): route is RegisteredRouteEntry => route.id != null,
			);
			if (seq !== reloadSeqRef.current) return;
			setRoutes(registered);
			setError(null);
			// 読み込み成功時のみ「初回ロード済み」フラグを立てる。
			// finally で立てると初回が失敗しても true になり、以降の再試行で
			// setLoading(true) が呼ばれず LoadingSpinner が表示されなくなる。
			hasLoadedOnceRef.current = true;
		} catch (e) {
			if (seq !== reloadSeqRef.current) return;
			setError(e instanceof Error ? e : new Error(String(e)));
		} finally {
			if (seq === reloadSeqRef.current) {
				setLoading(false);
			}
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
