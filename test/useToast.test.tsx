import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "../src/hooks/useToast";

function wrapper({ children }: { children: ReactNode }) {
	return <ToastProvider>{children}</ToastProvider>;
}

describe("useToast", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("showToast で新しいトーストが toasts に追加される", () => {
		const { result } = renderHook(() => useToast(), { wrapper });

		act(() => {
			result.current.showToast("保存しました", { variant: "success" });
		});

		expect(result.current.toasts).toHaveLength(1);
		expect(result.current.toasts[0].message).toBe("保存しました");
		expect(result.current.toasts[0].variant).toBe("success");
	});

	it("variant 未指定時はデフォルト success になる", () => {
		const { result } = renderHook(() => useToast(), { wrapper });

		act(() => {
			result.current.showToast("デフォルト");
		});

		expect(result.current.toasts[0].variant).toBe("success");
	});

	// 自動消去の振る舞いは ToastItem 側（useEffect）で実装しており、
	// ToastContainer をレンダリングしない renderHook だけでは検証できない。
	// DOM から消えることは test/Toast.test.tsx でカバーしている。

	it("同時に複数のトーストを追加できる", () => {
		const { result } = renderHook(() => useToast(), { wrapper });

		act(() => {
			result.current.showToast("1 つ目");
			result.current.showToast("2 つ目", { variant: "error" });
		});

		expect(result.current.toasts).toHaveLength(2);
		expect(result.current.toasts[0].message).toBe("1 つ目");
		expect(result.current.toasts[1].message).toBe("2 つ目");
		expect(result.current.toasts[1].variant).toBe("error");
	});

	it("dismissToast で個別に削除できる", () => {
		const { result } = renderHook(() => useToast(), { wrapper });

		act(() => {
			result.current.showToast("削除対象");
		});
		const id = result.current.toasts[0].id;

		act(() => {
			result.current.dismissToast(id);
		});
		expect(result.current.toasts).toHaveLength(0);
	});

	it("ToastProvider 外で useToast を呼ぶとエラーになる", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => renderHook(() => useToast())).toThrow(/ToastProvider/);
		spy.mockRestore();
	});
});
