import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { copyFileSync } from "node:fs";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

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
	plugins: [react(), tailwindcss(), copySqlWasm()],
}));
