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
