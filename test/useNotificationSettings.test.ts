import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

	it("localStorage.setItem が例外を投げた場合 setMinutes も throw し、state は変更されない", () => {
		const { result } = renderHook(() => useNotificationSettings());
		const initial = result.current.minutes;
		const setItemSpy = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementation(() => {
				throw new DOMException("quota exceeded", "QuotaExceededError");
			});

		try {
			expect(() => {
				act(() => {
					result.current.setMinutes(30);
				});
			}).toThrow(/quota exceeded/);
			// state は永続化失敗時に変更されないこと（画面表示と保存済み値の整合を維持）
			expect(result.current.minutes).toBe(initial);
		} finally {
			setItemSpy.mockRestore();
		}
	});
});
