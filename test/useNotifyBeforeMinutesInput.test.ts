import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotifyBeforeMinutesInput } from "../src/hooks/useNotifyBeforeMinutesInput";

const STORAGE_KEY = "notify-before-minutes";

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
});

describe("useNotifyBeforeMinutesInput", () => {
	it("初期状態で inputValue は minutes の文字列表現と一致する", () => {
		localStorage.setItem(STORAGE_KEY, "8");
		const { result } = renderHook(() => useNotifyBeforeMinutesInput());
		expect(result.current.minutes).toBe(8);
		expect(result.current.inputValue).toBe("8");
	});

	it("setInputValue は inputValue のみを変更し minutes は変わらない", () => {
		const { result } = renderHook(() => useNotifyBeforeMinutesInput());
		const initialMinutes = result.current.minutes;

		act(() => {
			result.current.setInputValue("30");
		});

		expect(result.current.inputValue).toBe("30");
		expect(result.current.minutes).toBe(initialMinutes);
	});

	it("有効な変更済みの値に対して canCommit が true になる", () => {
		const { result } = renderHook(() => useNotifyBeforeMinutesInput());
		// デフォルト minutes=5
		act(() => {
			result.current.setInputValue("15");
		});
		expect(result.current.canCommit).toBe(true);
	});

	it("現在値と同じ値のとき canCommit は false", () => {
		const { result } = renderHook(() => useNotifyBeforeMinutesInput());
		// 初期 inputValue=5, minutes=5
		expect(result.current.canCommit).toBe(false);
	});

	it("範囲外（0 以下）の入力では canCommit は false", () => {
		const { result } = renderHook(() => useNotifyBeforeMinutesInput());
		act(() => {
			result.current.setInputValue("0");
		});
		expect(result.current.canCommit).toBe(false);
	});

	it("範囲外（60 超）の入力では canCommit は false", () => {
		const { result } = renderHook(() => useNotifyBeforeMinutesInput());
		act(() => {
			result.current.setInputValue("61");
		});
		expect(result.current.canCommit).toBe(false);
	});

	it("小数の入力では canCommit は false", () => {
		const { result } = renderHook(() => useNotifyBeforeMinutesInput());
		act(() => {
			result.current.setInputValue("5.5");
		});
		expect(result.current.canCommit).toBe(false);
	});

	it("空文字の入力では canCommit は false", () => {
		const { result } = renderHook(() => useNotifyBeforeMinutesInput());
		act(() => {
			result.current.setInputValue("");
		});
		expect(result.current.canCommit).toBe(false);
	});

	it("commit() は有効な入力を minutes に反映し { ok: true } を返す", () => {
		const { result } = renderHook(() => useNotifyBeforeMinutesInput());

		act(() => {
			result.current.setInputValue("20");
		});

		let ret:
			| { ok: true; committedMinutes: number }
			| { ok: false; error: unknown }
			| undefined;
		act(() => {
			ret = result.current.commit();
		});

		expect(ret).toEqual({ ok: true, committedMinutes: 20 });
		expect(result.current.minutes).toBe(20);
		expect(result.current.inputValue).toBe("20");
		expect(localStorage.getItem(STORAGE_KEY)).toBe("20");
	});

	it("commit() で setMinutes が throw したら inputValue は元の minutes にロールバックされる", () => {
		const { result } = renderHook(() => useNotifyBeforeMinutesInput());
		const initialMinutes = result.current.minutes;

		act(() => {
			result.current.setInputValue("25");
		});
		expect(result.current.inputValue).toBe("25");

		const setItemSpy = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementation(() => {
				throw new DOMException("quota exceeded", "QuotaExceededError");
			});

		try {
			let ret:
				| { ok: true; committedMinutes: number }
				| { ok: false; error: unknown }
				| undefined;
			act(() => {
				ret = result.current.commit();
			});

			expect(ret?.ok).toBe(false);
			if (ret && ret.ok === false) {
				expect(ret.error).toBeInstanceOf(DOMException);
			}
			// minutes は変更されず、inputValue も元の値にロールバック
			expect(result.current.minutes).toBe(initialMinutes);
			expect(result.current.inputValue).toBe(String(initialMinutes));
		} finally {
			setItemSpy.mockRestore();
		}
	});

	it("canCommit=false の状態で commit() を呼んでも minutes は変わらない", () => {
		const { result } = renderHook(() => useNotifyBeforeMinutesInput());
		const initialMinutes = result.current.minutes;

		// 範囲外の値
		act(() => {
			result.current.setInputValue("999");
		});

		act(() => {
			result.current.commit();
		});

		expect(result.current.minutes).toBe(initialMinutes);
	});

	it("commit 完了後も以降の setInputValue は minutes と独立して動作する", () => {
		// Issue #89 の核心: 入力中の値が外部の minutes 変化で破壊されないこと。
		// このフックでは入力状態を minutes と同じスコープで保持するため、
		// 一度 commit した後に再度入力を始めても入力値が勝手にリセットされない。
		const { result } = renderHook(() => useNotifyBeforeMinutesInput());

		act(() => {
			result.current.setInputValue("10");
		});
		act(() => {
			result.current.commit();
		});
		expect(result.current.minutes).toBe(10);
		expect(result.current.inputValue).toBe("10");

		// ユーザーが新たな値を入力し始めた状況を再現
		act(() => {
			result.current.setInputValue("3");
		});
		// この時点では minutes は 10 のままで、inputValue だけが 3 になる
		expect(result.current.minutes).toBe(10);
		expect(result.current.inputValue).toBe("3");
	});
});
