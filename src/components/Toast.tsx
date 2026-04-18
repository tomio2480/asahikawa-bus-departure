import { useEffect } from "react";
import { type Toast, type ToastVariant, useToast } from "../hooks/useToast";

const variantClass: Record<ToastVariant, string> = {
	success: "alert-success",
	error: "alert-error",
	info: "alert-info",
};

/** 画面右下にトーストを積む表示コンテナ */
export function ToastContainer() {
	const { toasts, dismissToast } = useToast();
	return (
		<div className="toast toast-end toast-bottom z-50">
			{toasts.map((toast) => (
				<ToastItem
					key={toast.id}
					toast={toast}
					onDismiss={() => dismissToast(toast.id)}
				/>
			))}
		</div>
	);
}

function ToastItem({
	toast,
	onDismiss,
}: {
	toast: Toast;
	onDismiss: () => void;
}) {
	// 自動消去タイマーを ToastItem のライフサイクルに合わせて管理する。
	// アンマウント・手動消去による再レンダリング時にクリーンアップで
	// clearTimeout が呼ばれるため、pending タイマーの残留を防ぐ。
	useEffect(() => {
		if (toast.durationMs <= 0) return;
		const timer = setTimeout(onDismiss, toast.durationMs);
		return () => clearTimeout(timer);
	}, [toast.durationMs, onDismiss]);

	const isError = toast.variant === "error";
	return (
		<div
			className={`alert ${variantClass[toast.variant]} shadow-lg`}
			role={isError ? "alert" : "status"}
			aria-live={isError ? "assertive" : "polite"}
		>
			<span>{toast.message}</span>
			<button
				type="button"
				className="btn btn-ghost btn-xs"
				aria-label="閉じる"
				onClick={onDismiss}
			>
				×
			</button>
		</div>
	);
}
