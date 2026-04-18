import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationSettings } from "../src/hooks/useNotificationSettings";
import { useNotifyBeforeMinutesInput } from "../src/hooks/useNotifyBeforeMinutesInput";

const STORAGE_KEY = "notify-before-minutes";

/**
 * フックの呼び出し側が useNotificationSettings の minutes/setMinutes を
 * そのまま渡す実運用の形を再現するためのラッパ。
 * フック自身は永続化責務を持たないが、テストでは永続化まで通した
 * 結合テスト相当の検証を維持するためにこの形を採用する。
 */
function useWrapper() {
	const { minutes, setMinutes } = useNotificationSettings();
	return useNotifyBeforeMinutesInput(minutes, setMinutes);
}

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
		const { result } = renderHook(() => useWrapper());
		expect(result.current.minutes).toBe(8);
		expect(result.current.inputValue).toBe("8");
	});

	it("setInputValue は inputValue のみを変更し minutes は変わらない", () => {
		const { result } = renderHook(() => useWrapper());
		const initialMinutes = result.current.minutes;

		act(() => {
			result.current.setInputValue("30");
		});

		expect(result.current.inputValue).toBe("30");
		expect(result.current.minutes).toBe(initialMinutes);
	});

	it("有効な変更済みの値に対して canCommit が true になる", () => {
		const { result } = renderHook(() => useWrapper());
		// デフォルト minutes=5
		act(() => {
			result.current.setInputValue("15");
		});
		expect(result.current.canCommit).toBe(true);
	});

	it("現在値と同じ値のとき canCommit は false", () => {
		const { result } = renderHook(() => useWrapper());
		// 初期 inputValue=5, minutes=5
		expect(result.current.canCommit).toBe(false);
	});

	it("範囲外（0 以下）の入力では canCommit は false", () => {
		const { result } = renderHook(() => useWrapper());
		act(() => {
			result.current.setInputValue("0");
		});
		expect(result.current.canCommit).toBe(false);
	});

	it("範囲外（60 超）の入力では canCommit は false", () => {
		const { result } = renderHook(() => useWrapper());
		act(() => {
			result.current.setInputValue("61");
		});
		expect(result.current.canCommit).toBe(false);
	});

	it("小数の入力では canCommit は false", () => {
		const { result } = renderHook(() => useWrapper());
		act(() => {
			result.current.setInputValue("5.5");
		});
		expect(result.current.canCommit).toBe(false);
	});

	it("空文字の入力では canCommit は false", () => {
		const { result } = renderHook(() => useWrapper());
		act(() => {
			result.current.setInputValue("");
		});
		expect(result.current.canCommit).toBe(false);
	});

	it("commit() は有効な入力を minutes に反映し { ok: true } を返す", () => {
		const { result } = renderHook(() => useWrapper());

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
		const { result } = renderHook(() => useWrapper());
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
		const { result } = renderHook(() => useWrapper());
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
		const { result } = renderHook(() => useWrapper());

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

	it("外部 minutes が編集開始後に変化しても inputValue を破壊しない", () => {
		// Issue #89 回帰防止 + #93 リフトアップ後の追加保証:
		// 呼び出し側で minutes を再評価しても、フックは useState 初期化子で
		// マウント時のみ minutes を参照するため、編集中の inputValue は保持される。
		const { result, rerender } = renderHook(
			({ minutes }: { minutes: number }) => {
				const setMinutes = vi.fn();
				return useNotifyBeforeMinutesInput(minutes, setMinutes);
			},
			{ initialProps: { minutes: 5 } },
		);

		act(() => {
			result.current.setInputValue("12");
		});
		expect(result.current.inputValue).toBe("12");

		// 外部から minutes を 20 に変更（他タブ同期などを想定）
		rerender({ minutes: 20 });

		// inputValue は編集中の "12" のまま保持されなければならない
		expect(result.current.inputValue).toBe("12");
		// minutes は rerender 後の値を反映する
		expect(result.current.minutes).toBe(20);
	});
});
