import { useCallback, useEffect, useRef, useState } from "react";
import type { Departure } from "../lib/departure-query";
import type { RegisteredRouteEntry } from "../types/route-entry";

type DepartureWithStop = Departure & { toStopName?: string };

type UseNotificationOptions = {
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
		if (typeof globalThis.Notification === "undefined") return "denied" as NotificationPermission;
		const result = await globalThis.Notification.requestPermission();
		setPermission(result);
		return result;
	}, []);

	useEffect(() => {
		if (!enabled) return;
		if (permission !== "granted") return;
		if (notifyBeforeMinutes <= 0) return;

		const enabledRoutes = new Map<string, RegisteredRouteEntry>();
		for (const route of routes) {
			if (route.notifyEnabled) {
				enabledRoutes.set(
					`${route.fromStopId}-${route.toStopId}`,
					route,
				);
			}
		}
		if (enabledRoutes.size === 0) return;

		const currentTime = getCurrentJstTime();
		const currentMinutes = timeToMinutes(currentTime);

		for (const dep of departures) {
			const key = `${dep.tripId}-${dep.departureTime}`;
			if (notifiedRef.current.has(key)) continue;

			const routeKey = `${dep.fromStopId}-${dep.toStopId}`;
			if (!enabledRoutes.has(routeKey)) continue;

			const depMinutes = timeToMinutes(dep.departureTime);
			const minutesUntil = depMinutes - currentMinutes;

			if (minutesUntil > 0 && minutesUntil <= notifyBeforeMinutes) {
				notifiedRef.current.add(key);
				new globalThis.Notification(`バス発車 ${minutesUntil}分前`, {
					body: formatNotificationBody(dep),
				});
			}
		}
	}, [departures, routes, notifyBeforeMinutes, enabled, permission]);

	return { permission, requestPermission };
}
