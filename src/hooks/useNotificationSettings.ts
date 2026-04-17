import { useCallback, useState } from "react";

const STORAGE_KEY = "notify-before-minutes";
const DEFAULT_MINUTES = 5;

/** 通知タイミング（発車の何分前か）を管理するフック */
export function useNotificationSettings() {
	const [minutes, setMinutesState] = useState<number>(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored == null) return DEFAULT_MINUTES;
		const n = Number(stored);
		return Number.isFinite(n) && n > 0 ? n : DEFAULT_MINUTES;
	});

	const setMinutes = useCallback((value: number) => {
		const clamped = Math.max(1, Math.min(60, Math.floor(value)));
		setMinutesState(clamped);
		localStorage.setItem(STORAGE_KEY, String(clamped));
	}, []);

	return { minutes, setMinutes } as const;
}
