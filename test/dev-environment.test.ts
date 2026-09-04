import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 開発環境の宣言が 1 か所へ揃っているかを検査する。
 *
 * jsdom 30 は Node の下限を `^22.22.2 || ^24.15.0 || >=26.0.0` へ引き上げた。
 * 一方でリポジトリには版の記録が無く、workflow の `node-version: 22` は
 * 22 系の最新へ解決される。ローカルが古い 22 系のままでも気づけない（Issue #151）。
 *
 * 版は `.nvmrc` へ 1 度だけ書き、`engines` と workflow はそこへ揃える。
 */

const repoRoot = join(import.meta.dirname, "..");

/** setup-node を使う workflow。node を使わないものは対象外とする。 */
const WORKFLOWS_USING_NODE = [
	"ci.yml",
	"deploy.yml",
	"npm-audit.yml",
	"update-gtfs.yml",
];

function readRepoFile(...segments: string[]): string {
	return readFileSync(join(repoRoot, ...segments), "utf8");
}

function readPackageJson(): {
	engines?: { node?: string };
	devDependencies?: Record<string, string>;
} {
	return JSON.parse(readRepoFile("package.json"));
}

describe("Node の版指定", () => {
	it(".nvmrc がメジャー版だけを記録する", () => {
		const nvmrc = readRepoFile(".nvmrc").trim();

		expect(nvmrc).toMatch(/^\d+$/);
	});

	/**
	 * `>=` で書くと jsdom が拒む 23 系・25 系まで対象へ含めてしまう。
	 * 開発と CI は 22 系だけを使うため、範囲もその 1 本へ閉じる。
	 */
	it("engines.node が .nvmrc と同じメジャー版の系へ閉じている", () => {
		const nvmrc = readRepoFile(".nvmrc").trim();
		const engines = readPackageJson().engines?.node;

		expect(engines).toBeDefined();
		expect(engines).toMatch(/^\^\d+\.\d+\.\d+$/);
		expect(engines?.replace("^", "").split(".")[0]).toBe(nvmrc);
	});

	it.each(WORKFLOWS_USING_NODE)(
		"%s が node-version を直書きせず .nvmrc を参照する",
		(workflow) => {
			const yaml = readRepoFile(".github", "workflows", workflow);

			expect(yaml).toContain("node-version-file: .nvmrc");
			expect(yaml).not.toMatch(/^\s*node-version:/m);
		},
	);
});

describe("開発依存の宣言", () => {
	/**
	 * jest-dom 7 で `@testing-library/dom` が必須の peer dependency となった。
	 * 推移的な解決へ頼ると、どこから来た依存かを追えなくなる（Issue #152）。
	 */
	it("@testing-library/dom を devDependencies へ明示する", () => {
		const devDependencies = readPackageJson().devDependencies ?? {};

		expect(devDependencies["@testing-library/dom"]).toBeDefined();
	});
});
