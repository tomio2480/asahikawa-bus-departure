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
	const [processing, setProcessing] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleExport = useCallback(async () => {
		setMessage(null);
		setProcessing(true);
		try {
			const data = await exportRoutes();
			const json = JSON.stringify(data, null, 2);
			const blob = new Blob([json], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			try {
				const a = document.createElement("a");
				a.href = url;
				a.download = `routes-${new Date().toLocaleDateString("sv-SE")}.json`;
				a.style.display = "none";
				document.body.appendChild(a);
				a.click();
				setTimeout(() => {
					document.body.removeChild(a);
					URL.revokeObjectURL(url);
				}, 100);
			} catch (err) {
				URL.revokeObjectURL(url);
				throw err;
			}
		} catch (err) {
			setMessage({
				type: "error",
				text: err instanceof Error ? err.message : "エクスポートに失敗しました",
			});
		} finally {
			setProcessing(false);
		}
	}, []);

	const handleFileChange = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;

			setMessage(null);
			setProcessing(true);
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
				setProcessing(false);
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
		<div className="relative">
			<div className="flex items-center gap-2">
				<button
					type="button"
					className="btn btn-outline btn-sm"
					onClick={handleExport}
					disabled={processing}
				>
					エクスポート
				</button>
				<button
					type="button"
					className="btn btn-outline btn-sm"
					onClick={handleImportClick}
					disabled={processing}
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
			</div>
			{message && (
				<div
					className={`absolute right-0 mt-1 whitespace-nowrap text-sm ${message.type === "error" ? "text-error" : "text-success"}`}
					role="alert"
				>
					{message.text}
				</div>
			)}
		</div>
	);
}
