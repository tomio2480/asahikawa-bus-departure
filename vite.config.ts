import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

/**
 * 本番ビルド時のみ CSP meta タグを挿入する。
 * 開発環境では HMR / React Refresh を妨げないよう CSP を適用しない。
 */
function injectCsp(): Plugin {
	const csp = [
		"default-src 'self'",
		"script-src 'self' 'wasm-unsafe-eval'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' https://*.tile.openstreetmap.org data:",
		"connect-src 'self'",
		"font-src 'self'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	].join("; ");

	return {
		name: "inject-csp",
		transformIndexHtml() {
			return [
				{
					tag: "meta",
					attrs: { "http-equiv": "Content-Security-Policy", content: csp },
					injectTo: "head-prepend",
				},
			];
		},
		apply: "build",
	};
}

/**
 * sql.js の wasm を `public/` へ配置する。
 *
 * 開発サーバーは `public/` の一覧を起動時に 1 度だけ走査し、その一覧に無い
 * パスは静的配信を素通しして index.html へフォールバックする。走査は
 * `configResolved` の後・`buildStart` の前に走るため、`buildStart` で
 * コピーすると初回起動時に間に合わず wasm の代わりに HTML が返る（Issue #132）。
 * コピーは `configResolved` で済ませる。
 */
function copySqlWasm(): Plugin {
	return {
		name: "copy-sql-wasm",
		configResolved({ publicDir }) {
			for (const name of ["sql-wasm.wasm", "sql-wasm-browser.wasm"]) {
				copyFileSync(
					`node_modules/sql.js/dist/${name}`,
					resolve(publicDir, name),
				);
			}
		},
	};
}

export default defineConfig(({ command }) => ({
	base: command === "build" ? "/asahikawa-bus-departure/" : "/",
	plugins: [react(), tailwindcss(), copySqlWasm(), injectCsp()],
}));
