import { copyFileSync } from "node:fs";
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
		transformIndexHtml(html) {
			return html.replace(
				"<head>",
				`<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
			);
		},
		apply: "build",
	};
}

function copySqlWasm(): Plugin {
	return {
		name: "copy-sql-wasm",
		buildStart() {
			copyFileSync(
				"node_modules/sql.js/dist/sql-wasm.wasm",
				"public/sql-wasm.wasm",
			);
			copyFileSync(
				"node_modules/sql.js/dist/sql-wasm-browser.wasm",
				"public/sql-wasm-browser.wasm",
			);
		},
	};
}

export default defineConfig(({ command }) => ({
	base: command === "build" ? "/asahikawa-bus-departure/" : "/",
	plugins: [react(), tailwindcss(), copySqlWasm(), injectCsp()],
}));
