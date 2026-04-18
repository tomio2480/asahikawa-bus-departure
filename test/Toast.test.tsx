import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastContainer } from "../src/components/Toast";
import { ToastProvider, useToast } from "../src/hooks/useToast";

/** テスト用のトリガコンポーネント：マウント時に showToast を呼ぶ */
function Trigger({
	message,
	variant,
	durationMs,
}: {
	message: string;
	variant?: "success" | "error" | "info";
	durationMs?: number;
}) {
	const { showToast } = useToast();
	useEffect(() => {
		showToast(message, { variant, durationMs });
	}, [showToast, message, variant, durationMs]);
	return null;
}

describe("ToastContainer", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it("showToast されたメッセージが画面に表示される", () => {
		render(
			<ToastProvider>
				<ToastContainer />
				<Trigger message="設定を保存しました" />
			</ToastProvider>,
		);

		expect(screen.getByText("設定を保存しました")).toBeInTheDocument();
	});

	it("表示されたトーストは role=status でアナウンスされる", () => {
		render(
			<ToastProvider>
				<ToastContainer />
				<Trigger message="設定を保存しました" />
			</ToastProvider>,
		);

		const status = screen.getByRole("status");
		expect(status).toHaveTextContent("設定を保存しました");
	});

	it("durationMs 経過後にトーストが DOM から消える", () => {
		render(
			<ToastProvider>
				<ToastContainer />
				<Trigger message="消えるメッセージ" durationMs={1000} />
			</ToastProvider>,
		);
		expect(screen.getByText("消えるメッセージ")).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(1000);
		});
		expect(screen.queryByText("消えるメッセージ")).not.toBeInTheDocument();
	});

	it("メッセージのテキストが右寄せで表示される", () => {
		// 閉じるボタンが右側にあるため、メッセージ文字列も右寄せにして
		// 視覚的な整列を取りたい（issue #91）。
		render(
			<ToastProvider>
				<ToastContainer />
				<Trigger message="右寄せテスト" />
			</ToastProvider>,
		);
		const message = screen.getByText("右寄せテスト");
		expect(message.className).toMatch(/text-end/);
	});

	it("variant=error のトーストに alert-error クラスが付与される", () => {
		render(
			<ToastProvider>
				<ToastContainer />
				<Trigger message="保存に失敗しました" variant="error" />
			</ToastProvider>,
		);

		const toast = screen.getByText("保存に失敗しました").closest("[role]");
		expect(toast).not.toBeNull();
		expect(toast?.className).toMatch(/alert-error/);
	});

	it("variant=success のトーストに alert-success クラスが付与される", () => {
		render(
			<ToastProvider>
				<ToastContainer />
				<Trigger message="保存しました" variant="success" />
			</ToastProvider>,
		);

		const toast = screen.getByText("保存しました").closest("[role]");
		expect(toast?.className).toMatch(/alert-success/);
	});

	it("ToastContainer アンマウント時に pending タイマーがクリアされる", () => {
		// 自動消去用 setTimeout が ToastProvider レベルで発火すると、
		// アンマウントされてもタイマーが残り続けメモリリーク・scheduling 累積の
		// 原因になる。ToastItem の useEffect 内でスケジュールし、クリーンアップで
		// clearTimeout するよう実装されている必要がある。
		const { unmount } = render(
			<ToastProvider>
				<ToastContainer />
				<Trigger message="クリア対象" durationMs={5000} />
			</ToastProvider>,
		);
		expect(screen.getByText("クリア対象")).toBeInTheDocument();
		// durationMs=5000 のタイマーが少なくとも 1 件スケジュールされている
		expect(vi.getTimerCount()).toBeGreaterThan(0);

		unmount();
		// アンマウント後は pending タイマーが残っていない
		expect(vi.getTimerCount()).toBe(0);
	});

	it("複数トースト追加時に既存トーストの自動消去タイマーがリセットされない", () => {
		// ToastContainer の再レンダリング（2 つ目のトースト追加等）で
		// ToastItem に渡る onDismiss の参照が変わると、useEffect の依存変化で
		// cleanup→再スケジュールが走り durationMs が最初からやり直しになる。
		// その結果、後からトーストが追加されるたび既存トーストが消えなくなる。
		function DualTrigger() {
			const { showToast } = useToast();
			useEffect(() => {
				showToast("先に出したトースト", { durationMs: 1000 });
				// 500ms 後に 2 つ目を追加して ToastContainer を再レンダリングさせる
				const t = setTimeout(() => {
					showToast("後から出したトースト", { durationMs: 5000 });
				}, 500);
				return () => clearTimeout(t);
			}, [showToast]);
			return null;
		}

		render(
			<ToastProvider>
				<ToastContainer />
				<DualTrigger />
			</ToastProvider>,
		);
		expect(screen.getByText("先に出したトースト")).toBeInTheDocument();

		// 500ms 経過 → 2 つ目のトーストが追加され再レンダリング
		act(() => {
			vi.advanceTimersByTime(500);
		});
		expect(screen.getByText("後から出したトースト")).toBeInTheDocument();
		// 先のトーストはまだ残り 500ms なので表示されている
		expect(screen.getByText("先に出したトースト")).toBeInTheDocument();

		// さらに 500ms（累計 1000ms）進めると、先のトーストは本来消えているはず
		act(() => {
			vi.advanceTimersByTime(500);
		});
		expect(screen.queryByText("先に出したトースト")).not.toBeInTheDocument();
	});

	it("閉じるボタンをクリックするとトーストが消える", async () => {
		const { default: userEvent } = await import("@testing-library/user-event");
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

		render(
			<ToastProvider>
				<ToastContainer />
				<Trigger message="閉じられる" durationMs={0} />
			</ToastProvider>,
		);
		expect(screen.getByText("閉じられる")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "閉じる" }));
		expect(screen.queryByText("閉じられる")).not.toBeInTheDocument();
	});
});
