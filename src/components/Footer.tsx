const OPERATORS = [
	{ name: "旭川電気軌道", url: "https://www.asahikawa-denkikidou.jp/" },
	{ name: "道北バス", url: "https://www.dohokubus.com/" },
	{ name: "ふらのバス", url: "https://www.furanobus.jp/" },
] as const;

const SOCIAL_LINKS = [
	{ name: "X (Twitter)", url: "https://x.com/tomio2480" },
	{
		name: "GitHub Sponsors",
		url: "https://github.com/sponsors/tomio2480",
	},
	{
		name: "GitHub",
		url: "https://github.com/tomio2480/asahikawa-bus-departure",
	},
] as const;

/** 免責事項・公式リンク・データ出典を表示するカード */
export function DataAttribution() {
	return (
		<div className="card bg-base-100 shadow-sm">
			<div className="card-body text-center space-y-3">
				<section className="text-sm text-base-content/70 space-y-2">
					<p>このサービスの情報は参考値です。</p>
					<p>
						正確な時刻・運賃は各事業者の公式ページをご確認ください。
					</p>
					<nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
						{OPERATORS.map((op) => (
							<a
								key={op.url}
								href={op.url}
								target="_blank"
								rel="noopener noreferrer"
								className="link link-hover"
							>
								{op.name}
							</a>
						))}
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
							「公共交通GTFSデータ」（HODA
							北海道オープンデータプラットフォーム）
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
			</div>
		</div>
	);
}

/** アプリケーションのフッター */
export function Footer() {
	return (
		<footer className="mt-auto bg-base-300 text-base-content p-4 text-center space-y-2">
			<nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
				{SOCIAL_LINKS.map((link) => (
					<a
						key={link.url}
						href={link.url}
						target="_blank"
						rel="noopener noreferrer"
						className="link link-hover"
					>
						{link.name}
					</a>
				))}
			</nav>
			<p className="text-xs text-base-content/60">
				&copy; 2026 Shota Nishihara
			</p>
		</footer>
	);
}
