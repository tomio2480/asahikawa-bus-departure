/** アプリケーションのフッター */
export function Footer() {
	return (
		<footer className="footer footer-center bg-base-100 text-base-content p-6 mt-auto space-y-4">
			<section className="text-sm text-base-content/70 space-y-2">
				<p>このサービスの情報は参考値です。</p>
				<p>
					正確な時刻・運賃は各事業者の公式ページをご確認ください。
				</p>
				<nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
					<a
						href="https://www.asahikawa-denkikidou.jp/"
						target="_blank"
						rel="noopener noreferrer"
						className="link link-hover"
					>
						旭川電気軌道
					</a>
					<a
						href="https://www.dohokubus.com/"
						target="_blank"
						rel="noopener noreferrer"
						className="link link-hover"
					>
						道北バス
					</a>
					<a
						href="https://www.furanobus.jp/"
						target="_blank"
						rel="noopener noreferrer"
						className="link link-hover"
					>
						ふらのバス
					</a>
				</nav>
			</section>
			<section className="text-xs text-base-content/50">
				<p>
					交通データ:
					<a
						href="https://ckan.hoda.jp/dataset/gtfs-data"
						target="_blank"
						rel="noopener noreferrer"
						className="link link-hover"
					>
						「公共交通GTFSデータ」（HODA 北海道オープンデータプラットフォーム）
					</a>
					を加工して作成 /
					<a
						href="https://creativecommons.org/licenses/by/4.0/deed.ja"
						target="_blank"
						rel="noopener noreferrer"
						className="link link-hover"
					>
						CC BY 4.0
					</a>
				</p>
			</section>
			<nav className="flex flex-wrap justify-center gap-x-4 gap-y-2">
				<a
					href="https://x.com/tomio2480"
					target="_blank"
					rel="noopener noreferrer"
					className="link link-hover"
				>
					X (Twitter)
				</a>
				<a
					href="https://github.com/sponsors/tomio2480"
					target="_blank"
					rel="noopener noreferrer"
					className="link link-hover"
				>
					GitHub Sponsors
				</a>
				<a
					href="https://github.com/tomio2480/asahikawa-bus-departure"
					target="_blank"
					rel="noopener noreferrer"
					className="link link-hover"
				>
					GitHub
				</a>
			</nav>
			<aside>
				<p>&copy; 2026 Shota Nishihara</p>
			</aside>
		</footer>
	);
}
