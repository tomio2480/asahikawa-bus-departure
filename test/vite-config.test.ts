import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import configFn from "../vite.config";

/**
 * sql.js の wasm は `public/` へコピーして配信する。
 * 開発サーバーは `public/` の一覧をプラグインの `buildStart` より前に走査するため、
 * `buildStart` でコピーすると走査に間に合わず index.html へフォールバックする（Issue #132）。
 * コピーは `configResolved` の時点で終えていなければならない。
 */
function getCopySqlWasmPlugin(command: "serve" | "build"): Plugin {
	const config = configFn({ command, mode: "development" });
	const plugins = config.plugins as Plugin[];
	const plugin = plugins
		.flat(Number.POSITIVE_INFINITY)
		.find(
			(p): p is Plugin => Boolean(p) && (p as Plugin).name === "copy-sql-wasm",
		);
	if (!plugin) {
		throw new Error("copy-sql-wasm プラグインが見つからない");
	}
	return plugin;
}

describe("copy-sql-wasm プラグイン", () => {
	let publicDir: string;

	beforeEach(() => {
		publicDir = mkdtempSync(join(tmpdir(), "public-"));
	});

	afterEach(() => {
		rmSync(publicDir, { recursive: true, force: true });
	});

	it("buildStart ではなく configResolved でコピーする", () => {
		const plugin = getCopySqlWasmPlugin("serve");

		expect(plugin.configResolved).toBeTypeOf("function");
		expect(plugin.buildStart).toBeUndefined();
	});

	it("解決済みの publicDir へ 2 つの wasm を書き出す", () => {
		const plugin = getCopySqlWasmPlugin("serve");
		const configResolved = plugin.configResolved as (config: {
			publicDir: string;
		}) => void;

		configResolved({ publicDir });

		for (const name of ["sql-wasm.wasm", "sql-wasm-browser.wasm"]) {
			const dest = join(publicDir, name);
			expect(existsSync(dest)).toBe(true);
			expect(statSync(dest).size).toBeGreaterThan(0);
		}
	});

	it("本番ビルドでも同じ経路でコピーする", () => {
		const plugin = getCopySqlWasmPlugin("build");
		const configResolved = plugin.configResolved as (config: {
			publicDir: string;
		}) => void;

		configResolved({ publicDir });

		expect(existsSync(join(publicDir, "sql-wasm.wasm"))).toBe(true);
	});
});
