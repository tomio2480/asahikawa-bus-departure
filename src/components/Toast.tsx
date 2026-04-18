import { useEffect } from "react";
import { type Toast, type ToastVariant, useToast } from "../hooks/useToast";

const variantClass: Record<ToastVariant, string> = {
	success: "alert-success",
	error: "alert-error",
	info: "alert-info",
};

/** 画面右下にトーストを積む表示コンテナ */
export function ToastContainer() {
	const { toasts } = useToast();
	return (
		<div className="toast toast-end toast-bottom z-50">
			{toasts.map((toast) => (
				<ToastItem key={toast.id} toast={toast} />
			))}
		</div>
	);
}

function ToastItem({ toast }: { toast: Toast }) {
	// dismissToast は ToastProvider 側で useCallback により安定参照になっている。
	// onDismiss をプロップで受けると ToastContainer の再レンダリングごとに
	// 新しい参照となり useEffect の cleanup→再スケジュールで自動消去タイマーが
	// リセットされるため、ToastItem 内部で直接取得する。
	const { dismissToast } = useToast();

	// 自動消去タイマーを ToastItem のライフサイクルに合わせて管理する。
	// アンマウント・手動消去による再レンダリング時にクリーンアップで
	// clearTimeout が呼ばれるため、pending タイマーの残留を防ぐ。
	useEffect(() => {
		if (toast.durationMs <= 0) return;
		const timer = setTimeout(() => dismissToast(toast.id), toast.durationMs);
		return () => clearTimeout(timer);
	}, [toast.id, toast.durationMs, dismissToast]);

	const isError = toast.variant === "error";
	return (
		<div
			className={`alert ${variantClass[toast.variant]} shadow-lg`}
			role={isError ? "alert" : "status"}
			aria-live={isError ? "assertive" : "polite"}
		>
			{/* close ボタンが右端にあるため、メッセージも text-end で右寄せに
			    揃え視覚的な整列を取る（issue #91）。 */}
			<span className="flex-1 text-end">{toast.message}</span>
			<button
				type="button"
				className="btn btn-ghost btn-xs"
				aria-label="閉じる"
				onClick={() => dismissToast(toast.id)}
			>
				×
			</button>
		</div>
	);
}
