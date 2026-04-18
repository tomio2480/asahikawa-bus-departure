import { useCallback, useState } from "react";
import {
	NOTIFY_DEFAULT_MINUTES,
	NOTIFY_MAX_MINUTES,
	NOTIFY_MIN_MINUTES,
} from "../constants/notification";

const STORAGE_KEY = "notify-before-minutes";

/** 通知タイミング（発車の何分前か）を管理するフック */
export function useNotificationSettings() {
	const [minutes, setMinutesState] = useState<number>(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored == null) return NOTIFY_DEFAULT_MINUTES;
		const n = Number(stored);
		if (!Number.isFinite(n) || n <= 0) return NOTIFY_DEFAULT_MINUTES;
		return Math.max(
			NOTIFY_MIN_MINUTES,
			Math.min(NOTIFY_MAX_MINUTES, Math.floor(n)),
		);
	});

	const setMinutes = useCallback((value: number) => {
		const clamped = Math.max(
			NOTIFY_MIN_MINUTES,
			Math.min(NOTIFY_MAX_MINUTES, Math.floor(value)),
		);
		// 永続化を先に試行し、成功した場合のみ state を更新する。
		// localStorage の書き込み失敗時（QuotaExceededError 等）に
		// 画面表示と保存値が乖離しないようにする。失敗時は throw して
		// 呼び出し側にエラー通知を委ねる。
		localStorage.setItem(STORAGE_KEY, String(clamped));
		setMinutesState(clamped);
	}, []);

	return { minutes, setMinutes } as const;
}
