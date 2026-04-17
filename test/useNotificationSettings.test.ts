import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useNotificationSettings } from "../src/hooks/useNotificationSettings";

const STORAGE_KEY = "notify-before-minutes";

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	localStorage.clear();
});

describe("useNotificationSettings", () => {
	it("デフォルトの通知時間は5分である", () => {
		const { result } = renderHook(() => useNotificationSettings());
		expect(result.current.minutes).toBe(5);
	});

	it("localStorage に保存された値を読み込む", () => {
		localStorage.setItem(STORAGE_KEY, "10");
		const { result } = renderHook(() => useNotificationSettings());
		expect(result.current.minutes).toBe(10);
	});

	it("変更した値が localStorage に保存される", () => {
		const { result } = renderHook(() => useNotificationSettings());
		act(() => {
			result.current.setMinutes(15);
		});
		expect(result.current.minutes).toBe(15);
		expect(localStorage.getItem(STORAGE_KEY)).toBe("15");
	});

	it("不正な値はデフォルトの5にフォールバックする", () => {
		localStorage.setItem(STORAGE_KEY, "abc");
		const { result } = renderHook(() => useNotificationSettings());
		expect(result.current.minutes).toBe(5);
	});

	it("0以下の値はデフォルトの5にフォールバックする", () => {
		localStorage.setItem(STORAGE_KEY, "0");
		const { result } = renderHook(() => useNotificationSettings());
		expect(result.current.minutes).toBe(5);
	});

	it("値が1〜60の範囲にクランプされる", () => {
		const { result } = renderHook(() => useNotificationSettings());
		act(() => {
			result.current.setMinutes(100);
		});
		expect(result.current.minutes).toBe(60);
		act(() => {
			result.current.setMinutes(-5);
		});
		expect(result.current.minutes).toBe(1);
	});
});
