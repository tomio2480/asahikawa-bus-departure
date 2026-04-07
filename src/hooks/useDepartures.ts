import { useCallback, useEffect, useRef, useState } from "react";
import type { Database } from "sql.js";
import { getActiveServiceIds } from "../lib/calendar-service";
import {
	type Departure,
	calculateBoardingTime,
	getDepartures,
} from "../lib/departure-query";
import { getStopName } from "../lib/stop-search";
import type { RegisteredRouteEntry } from "../types/route-entry";

/** 1 分間隔で自動更新する */
const REFRESH_INTERVAL_MS = 60_000;

/** 降車バス停ごとにグルーピングした発車案内 */
export type DepartureGroup = {
	toStopId: string;
	toStopName: string;
	departures: Departure[];
};

type UseDeparturesReturn = {
	/** 降車バス停ごとの発車案内グループ */
	groups: DepartureGroup[];
	/** 最終更新時刻 */
	lastUpdated: Date | null;
};

/**
 * 登録経路の発車案内を取得し、降車バス停ごとにグルーピングするフック。
 * 1 分ごとに自動更新する。
 *
 * db と routes は ref 経由で参照し、useCallback の依存配列に含めない。
 * routes が呼び出し元で毎レンダー新規生成される場合の無限ループを防止する。
 */
export function useDepartures(
	db: Database | null,
	routes: RegisteredRouteEntry[],
): UseDeparturesReturn {
	const [groups, setGroups] = useState<DepartureGroup[]>([]);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

	const dbRef = useRef(db);
	dbRef.current = db;
	const routesRef = useRef(routes);
	routesRef.current = routes;

	const fetchDepartures = useCallback(() => {
		const currentDb = dbRef.current;
		const currentRoutes = routesRef.current;

		if (currentDb === null || currentRoutes.length === 0) {
			setGroups([]);
			setLastUpdated(currentRoutes.length === 0 ? new Date() : null);
			return;
		}

		const now = new Date();
		const serviceIds = getActiveServiceIds(currentDb, now);

		const groupMap = new Map<
			string,
			{ toStopName: string; departures: Departure[] }
		>();

		for (const route of currentRoutes) {
			const boardingTime = calculateBoardingTime(now, route.walkMinutes);
			const departures = getDepartures(
				currentDb,
				serviceIds,
				route.fromStopId,
				route.toStopId,
				boardingTime,
			);

			if (departures.length === 0) continue;

			const existing = groupMap.get(route.toStopId);
			if (existing) {
				existing.departures.push(...departures);
			} else {
				const toStopName = getStopName(currentDb, route.toStopId);
				groupMap.set(route.toStopId, { toStopName, departures });
			}
		}

		const result: DepartureGroup[] = [];
		for (const [toStopId, { toStopName, departures }] of groupMap) {
			const unique = Array.from(
				new Map(
					departures.map((d) => [`${d.tripId}-${d.departureTime}`, d]),
				).values(),
			);
			unique.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
			result.push({ toStopId, toStopName, departures: unique });
		}

		result.sort((a, b) => {
			const aTime = a.departures[0]?.departureTime ?? "";
			const bTime = b.departures[0]?.departureTime ?? "";
			return aTime.localeCompare(bTime);
		});

		setGroups(result);
		setLastUpdated(now);
	}, []);

	// タイマーによる定期更新（初回取得は変更検知用 useEffect に統一）
	useEffect(() => {
		const id = setInterval(fetchDepartures, REFRESH_INTERVAL_MS);
		return () => clearInterval(id);
	}, [fetchDepartures]);

	// db または routes の内容が変わったときに即時再取得する。
	// fetchDepartures は ref 経由で db/routes を参照するため、
	// 依存配列に db と routesKey を含めて変更検知する。
	const routesKey = JSON.stringify(routes);
	// biome-ignore lint/correctness/useExhaustiveDependencies: db と routesKey の変更で再取得を発火させる意図的な依存
	useEffect(() => {
		fetchDepartures();
	}, [db, routesKey, fetchDepartures]);

	return { groups, lastUpdated };
}
