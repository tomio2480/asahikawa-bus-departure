import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";

/** トーストのビジュアル種別 */
export type ToastVariant = "success" | "error" | "info";

export type Toast = {
	/** 一意 ID（dismissToast や React key に使用） */
	id: number;
	/** 表示メッセージ */
	message: string;
	/** ビジュアル種別 */
	variant: ToastVariant;
};

type ShowToastOptions = {
	variant?: ToastVariant;
	/** 自動消去までのミリ秒（デフォルト 3000ms） */
	durationMs?: number;
};

type ToastContextValue = {
	toasts: Toast[];
	showToast: (message: string, options?: ShowToastOptions) => void;
	dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 3000;

/**
 * トースト通知のプロバイダ。
 * 配下の useToast 呼び出しに対して toasts 配列と操作関数を提供する。
 */
export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const nextIdRef = useRef(1);

	const dismissToast = useCallback((id: number) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const showToast = useCallback(
		(message: string, options?: ShowToastOptions) => {
			const id = nextIdRef.current;
			nextIdRef.current += 1;
			const variant = options?.variant ?? "success";
			const durationMs = options?.durationMs ?? DEFAULT_DURATION_MS;
			setToasts((prev) => [...prev, { id, message, variant }]);
			if (durationMs > 0) {
				setTimeout(() => {
					setToasts((prev) => prev.filter((t) => t.id !== id));
				}, durationMs);
			}
		},
		[],
	);

	const value = useMemo(
		() => ({ toasts, showToast, dismissToast }),
		[toasts, showToast, dismissToast],
	);

	return (
		<ToastContext.Provider value={value}>{children}</ToastContext.Provider>
	);
}

/** トースト操作フック（ToastProvider 配下でのみ使用可能） */
export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext);
	if (ctx == null) {
		throw new Error("useToast must be used within ToastProvider");
	}
	return ctx;
}
