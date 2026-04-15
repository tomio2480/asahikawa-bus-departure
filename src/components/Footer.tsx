/** アプリケーションのフッター */
export function Footer() {
	return (
		<footer className="footer footer-center bg-base-100 text-base-content p-6 mt-auto">
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
