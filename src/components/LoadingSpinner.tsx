/** データ読み込み中のローディング表示 */
export function LoadingSpinner() {
	return (
		<div className="flex flex-col items-center justify-center gap-2 py-8">
			<span
				className="loading loading-spinner loading-lg"
				role="status"
				aria-label="読み込み中"
			/>
			<p className="text-base-content/60">読み込み中...</p>
		</div>
	);
}
