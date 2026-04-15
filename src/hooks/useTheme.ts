import { useCallback, useEffect, useState } from "react";

/** テーマの設定値 */
export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "theme-preference";

/** デバイスのカラースキーム設定を取得する */
function getSystemTheme(): "light" | "dark" {
	if (typeof window.matchMedia !== "function") return "light";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

/** localStorage からテーマ設定を読み込む */
function loadPreference(): ThemePreference {
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === "light" || stored === "dark" || stored === "system") {
		return stored;
	}
	return "system";
}

/** テーマ設定に基づいて実際のテーマを適用する */
function applyTheme(preference: ThemePreference): void {
	const theme = preference === "system" ? getSystemTheme() : preference;
	document.documentElement.setAttribute("data-theme", theme);
}

/**
 * テーマ設定を管理するフック。
 *
 * localStorage に設定を保存し、デバイスのカラースキーム変更にも追従する。
 */
export function useTheme() {
	const [preference, setPreference] = useState<ThemePreference>(loadPreference);

	const changeTheme = useCallback((newPref: ThemePreference) => {
		setPreference(newPref);
		localStorage.setItem(STORAGE_KEY, newPref);
	}, []);

	// 初回マウント時にテーマを適用
	useEffect(() => {
		applyTheme(preference);
	}, [preference]);

	// デバイスのカラースキーム変更を監視（system モード時のみ）
	useEffect(() => {
		if (preference !== "system") return;
		if (typeof window.matchMedia !== "function") return;

		const mql = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => applyTheme("system");
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, [preference]);

	return { preference, changeTheme } as const;
}
