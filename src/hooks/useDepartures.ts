import { useCallback, useEffect, useRef, useState } from "react";
import type { Database } from "sql.js";
import { getActiveServiceIds } from "../lib/calendar-service";
import {
	type Departure,
	calculateBoardingTime,
	calculateLookbackTime,
	getDepartures,
} from "../lib/departure-query";
import { type Fare, getFare } from "../lib/fare-query";
import { getSiblingStopIds, getStopName } from "../lib/stop-search";
import type { RegisteredRouteEntry } from "../types/route-entry";

/** 1 分間隔で自動更新する */
const REFRESH_INTERVAL_MS = 60_000;

/** 出発済みの便を表示する遡り時間（分） */
const LOOKBACK_MINUTES = 10;

/** 降車バス停ごとにグルーピングした発車案内 */
export type DepartureGroup = {
	toStopId: string;
	toStopName: string;
	departures: Departure[];
	/** 翌日の始発以降の便かどうか */
	isNextDay?: boolean;
};

type UseDeparturesReturn = {
	/** 降車バス停ごとの発車案内グループ */
	groups: DepartureGroup[];
	/** 最終更新時刻 */
	lastUpdated: Date | null;
	/** データ取得時のエラー */
	error: Error | null;
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
	const [error, setError] = useState<Error | null>(null);

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
			setError(null);
			return;
		}

		try {
			const now = new Date();
			const serviceIds = getActiveServiceIds(currentDb, now);
			const lookbackTime = calculateLookbackTime(now, LOOKBACK_MINUTES);

			const groupMap = new Map<
				string,
				{
					toStopName: string;
					departures: Departure[];
					isNextDay?: boolean;
				}
			>();

			const fareCache = new Map<string, Fare | null>();
			const stopNameCache = new Map<string, string>();

			/** departure に付帯情報を設定する */
			function enrichDeparture(
				db: Database,
				dep: Departure,
				currentTimeStr: string | null,
				walkMinutes: number,
			): void {
				// 出発済みフラグ（実際にバスが出発したかどうかを現在時刻と比較）
				if (currentTimeStr) {
					dep.isDeparted = dep.departureTime < currentTimeStr;
				}

				// 徒歩時間を考慮した自宅出発目安時刻
				const [hStr, mStr, sStr] = dep.departureTime.split(":");
				const totalMin =
					Number(hStr) * 60 +
					Number(mStr) -
					Math.max(0, Math.floor(walkMinutes));
				if (totalMin >= 0) {
					const lh = Math.floor(totalMin / 60);
					const lm = totalMin % 60;
					dep.leaveByTime = `${String(lh).padStart(2, "0")}:${String(lm).padStart(2, "0")}:${sStr}`;
				} else {
					dep.leaveByTime = "00:00:00";
				}

				// 乗車バス停名
				if (!stopNameCache.has(dep.fromStopId)) {
					stopNameCache.set(dep.fromStopId, getStopName(db, dep.fromStopId));
				}
				dep.fromStopName = stopNameCache.get(dep.fromStopId);

				// 運賃
				const fareKey = `${dep.routeId}:${dep.fromStopId}:${dep.toStopId}`;
				if (!fareCache.has(fareKey)) {
					fareCache.set(
						fareKey,
						getFare(db, dep.fromStopId, dep.toStopId, dep.routeId),
					);
				}
				dep.fare = fareCache.get(fareKey) ?? null;
			}

			const currentTimeStr = calculateBoardingTime(now, 0);

			for (const route of currentRoutes) {
				const fromStopIds = getSiblingStopIds(currentDb, route.fromStopId);
				const toStopIds = getSiblingStopIds(currentDb, route.toStopId);

				// ルックバック時刻（出発済み便も含めるため）を afterTime に使う
				// walkMinutes >= 0 のため lookbackTime は常に boardingTime 以前
				const afterTime = lookbackTime;
				const departures = getDepartures(
					currentDb,
					serviceIds,
					fromStopIds,
					toStopIds,
					afterTime,
					15,
				);

				if (departures.length === 0) continue;

				for (const dep of departures) {
					enrichDeparture(currentDb, dep, currentTimeStr, route.walkMinutes);
				}

				const existing = groupMap.get(route.toStopId);
				if (existing) {
					existing.departures.push(...departures);
				} else {
					const toStopName = getStopName(currentDb, route.toStopId);
					groupMap.set(route.toStopId, { toStopName, departures });
				}
			}

			// 翌日の始発便を取得（本日分が全て空の場合）
			if (groupMap.size === 0 && currentRoutes.length > 0) {
				const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
				const tomorrowServiceIds = getActiveServiceIds(currentDb, tomorrow);

				if (tomorrowServiceIds.length > 0) {
					for (const route of currentRoutes) {
						const fromStopIds = getSiblingStopIds(currentDb, route.fromStopId);
						const toStopIds = getSiblingStopIds(currentDb, route.toStopId);
						const departures = getDepartures(
							currentDb,
							tomorrowServiceIds,
							fromStopIds,
							toStopIds,
							"00:00:00",
							3,
						);

						if (departures.length === 0) continue;

						for (const dep of departures) {
							enrichDeparture(currentDb, dep, null, route.walkMinutes);
						}

						const existing = groupMap.get(route.toStopId);
						if (existing) {
							existing.departures.push(...departures);
							existing.isNextDay = true;
						} else {
							const toStopName = getStopName(currentDb, route.toStopId);
							groupMap.set(route.toStopId, {
								toStopName,
								departures,
								isNextDay: true,
							});
						}
					}
				}
			}

			const result: DepartureGroup[] = [];
			for (const [toStopId, data] of groupMap) {
				const unique = Array.from(
					new Map(
						data.departures.map((d) => [`${d.tripId}-${d.departureTime}`, d]),
					).values(),
				);
				unique.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
				result.push({
					toStopId,
					toStopName: data.toStopName,
					departures: unique,
					isNextDay: data.isNextDay,
				});
			}

			result.sort((a, b) => {
				const aTime = a.departures[0]?.departureTime ?? "";
				const bTime = b.departures[0]?.departureTime ?? "";
				return aTime.localeCompare(bTime);
			});

			setGroups(result);
			setLastUpdated(now);
			setError(null);
		} catch (e) {
			setGroups([]);
			setError(e instanceof Error ? e : new Error(String(e)));
		}
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

	return { groups, lastUpdated, error };
}
