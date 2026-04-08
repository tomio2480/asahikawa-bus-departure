import { useCallback, useRef, useState } from "react";
import { exportRoutes, importRoutes } from "../lib/route-store";

type RouteTransferProps = {
	/** インポート完了時のコールバック */
	onImportComplete: () => void;
};

/** File の内容をテキストとして読み取る */
function readFileAsText(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsText(file);
	});
}

/** 経路データのエクスポート/インポートを行うコンポーネント */
export function RouteTransfer({ onImportComplete }: RouteTransferProps) {
	const [message, setMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleExport = useCallback(async () => {
		setMessage(null);
		try {
			const data = await exportRoutes();
			const json = JSON.stringify(data, null, 2);
			const blob = new Blob([json], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			try {
				const a = document.createElement("a");
				a.href = url;
				a.download = `routes-${new Date().toISOString().slice(0, 10)}.json`;
				a.click();
			} finally {
				URL.revokeObjectURL(url);
			}
		} catch (err) {
			setMessage({
				type: "error",
				text: err instanceof Error ? err.message : "エクスポートに失敗しました",
			});
		}
	}, []);

	const handleFileChange = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;

			setMessage(null);
			try {
				const text = await readFileAsText(file);
				const count = await importRoutes(text);
				setMessage({
					type: "success",
					text: `${count} 件の経路をインポートしました`,
				});
				onImportComplete();
			} catch (err) {
				setMessage({
					type: "error",
					text: err instanceof Error ? err.message : "インポートに失敗しました",
				});
			} finally {
				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}
			}
		},
		[onImportComplete],
	);

	const handleImportClick = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				className="btn btn-outline btn-sm"
				onClick={handleExport}
			>
				エクスポート
			</button>
			<button
				type="button"
				className="btn btn-outline btn-sm"
				onClick={handleImportClick}
			>
				インポート
			</button>
			<input
				ref={fileInputRef}
				type="file"
				accept=".json"
				className="hidden"
				onChange={handleFileChange}
			/>
			{message && (
				<div
					className={`text-sm ${message.type === "error" ? "text-error" : "text-success"}`}
					role="alert"
				>
					{message.text}
				</div>
			)}
		</div>
	);
}
