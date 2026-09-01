import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Database } from "sql.js";
import type { Departure } from "../lib/departure-query";
import { getSiblingStopIds } from "../lib/stop-search";
import type { RegisteredRouteEntry } from "../types/route-entry";

type DepartureWithStop = Departure & {
	toStopName?: string;
	isNextDay?: boolean;
};

type UseNotificationOptions = {
	/** sql.js データベース（兄弟停留所の展開に使用。未指定時は直接 ID マッチにフォールバック） */
	db?: Database | null;
	departures: DepartureWithStop[];
	routes: RegisteredRouteEntry[];
	notifyBeforeMinutes: number;
	/** マスタースイッチ（いずれかの経路で通知が有効なら true） */
	enabled: boolean;
};

type UseNotificationReturn = {
	/** 現在の Notification パーミッション状態 */
	permission: NotificationPermission | "unsupported";
	/** パーミッションを要求する（ユーザー操作から呼ぶこと） */
	requestPermission: () => Promise<NotificationPermission>;
};

/** HH:MM:SS 形式の時刻を HH:MM に短縮する */
function formatTime(time: string): string {
	return time.split(":").slice(0, 2).join(":");
}

/** 現在の JST 時刻を HH:MM:SS 形式で返す */
function getCurrentJstTime(): string {
	const now = new Date();
	const fmt = new Intl.DateTimeFormat("ja-JP", {
		timeZone: "Asia/Tokyo",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	});
	const parts = fmt.formatToParts(now);
	const h = parts.find((p) => p.type === "hour")?.value ?? "00";
	const m = parts.find((p) => p.type === "minute")?.value ?? "00";
	const s = parts.find((p) => p.type === "second")?.value ?? "00";
	return `${h}:${m}:${s}`;
}

/** HH:MM:SS 形式の時刻を当日 0:00 からの分数に変換する */
function timeToMinutes(time: string): number {
	const [hStr, mStr] = time.split(":");
	return Number(hStr) * 60 + Number(mStr);
}

/** 通知本文を生成する */
function formatNotificationBody(dep: DepartureWithStop): string {
	const lines: string[] = [];
	lines.push(
		`${formatTime(dep.departureTime)} ${dep.fromStopName ?? ""} 発 → ${formatTime(dep.arrivalTime)} ${dep.toStopName ?? ""} 着`,
	);
	lines.push(dep.routeName);
	if (dep.fare) {
		lines.push(
			dep.fare.currencyType === "JPY"
				? `${dep.fare.price}円`
				: `${dep.fare.price} ${dep.fare.currencyType}`,
		);
	}
	return lines.join("\n");
}

/**
 * 発車前の通知を管理するフック。
 *
 * useDepartures の 1 分更新に連動して通知判定を行う。
 * 通知済みの便は tripId + departureTime で追跡し、重複送信を防止する。
 */
export function useNotification({
	db,
	departures,
	routes,
	notifyBeforeMinutes,
	enabled,
}: UseNotificationOptions): UseNotificationReturn {
	const notifiedRef = useRef(new Set<string>());

	const [permission, setPermission] = useState<
		NotificationPermission | "unsupported"
	>(() => {
		if (typeof globalThis.Notification === "undefined") return "unsupported";
		return globalThis.Notification.permission;
	});

	const requestPermission = useCallback(async () => {
		if (typeof globalThis.Notification === "undefined")
			return "denied" as NotificationPermission;
		const result = await globalThis.Notification.requestPermission();
		setPermission(result);
		return result;
	}, []);

	// 通知が有効な経路の Map（routes 変更時のみ再構築）。
	// Departure.fromStopId / toStopId は実際のバス停留所 ID（同一場所の別乗り場 = 兄弟
	// 停留所）になり得る一方、登録経路の fromStopId / toStopId はユーザーが登録した
	// 1 つの ID のみ。useDepartures と同じく getSiblingStopIds で兄弟展開した全組
	// み合わせをキーに登録することで、登録 ID と異なる兄弟 ID からの departure でも
	// マッチできる。
	const enabledRoutes = useMemo(() => {
		const map = new Map<string, RegisteredRouteEntry>();
		for (const r of routes) {
			if (!r.notifyEnabled) continue;
			const fromSiblings = db
				? getSiblingStopIds(db, r.fromStopId)
				: [r.fromStopId];
			const toSiblings = db ? getSiblingStopIds(db, r.toStopId) : [r.toStopId];
			for (const f of fromSiblings) {
				for (const t of toSiblings) {
					map.set(`${f}-${t}`, r);
				}
			}
		}
		return map;
	}, [db, routes]);

	useEffect(() => {
		if (!enabled) return;
		if (permission !== "granted") return;
		if (notifyBeforeMinutes <= 0) return;
		if (enabledRoutes.size === 0) return;

		// 現在の departures に含まれない tripId を notifiedRef から除去
		const currentKeys = new Set(
			departures.map((d) => `${d.tripId}-${d.departureTime}`),
		);
		for (const key of notifiedRef.current) {
			if (!currentKeys.has(key)) {
				notifiedRef.current.delete(key);
			}
		}

		const currentTime = getCurrentJstTime();
		const currentMinutes = timeToMinutes(currentTime);

		for (const dep of departures) {
			// 翌日便は通知対象外（時刻計算が当日基準のため）
			if (dep.isNextDay) continue;

			const key = `${dep.tripId}-${dep.departureTime}`;
			if (notifiedRef.current.has(key)) continue;

			const routeKey = `${dep.fromStopId}-${dep.toStopId}`;
			const route = enabledRoutes.get(routeKey);
			if (!route) continue;

			// 徒歩時間を差し引いた自宅出発目安時刻を基準に通知タイミングを計算する
			const walkMinutes = Math.max(0, Math.floor(route.walkMinutes));
			const depMinutes = timeToMinutes(dep.departureTime);
			const leaveMinutes = depMinutes - walkMinutes;
			let minutesUntilLeave = leaveMinutes - currentMinutes;
			// GTFS の 24 時超表記（例: 24:05）と 0 時過ぎの現在時刻の差を補正
			if (minutesUntilLeave > 1200) minutesUntilLeave -= 1440;

			if (minutesUntilLeave > 0 && minutesUntilLeave <= notifyBeforeMinutes) {
				notifiedRef.current.add(key);
				new globalThis.Notification(`出発 ${minutesUntilLeave}分前`, {
					body: formatNotificationBody(dep),
				});
			}
		}
	}, [departures, enabledRoutes, notifyBeforeMinutes, enabled, permission]);

	return { permission, requestPermission };
}
