import { afterEach, describe, expect, it } from "vitest";
import { findA11yViolations } from "./a11y";

/**
 * findA11yViolations の振る舞いを固定する．
 * axe-core は DOM ツリーへ接続済みの要素しか検査しないため，
 * 各ケースで document.body へ差し込み，終了後に取り除く．
 */
describe("findA11yViolations", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("違反が無い要素では空配列を返す", async () => {
		const root = document.createElement("div");
		root.innerHTML = '<button type="button">保存</button>';
		document.body.appendChild(root);

		await expect(findA11yViolations(root)).resolves.toEqual([]);
	});

	it("alt の無い img を image-alt 違反として報告する", async () => {
		const root = document.createElement("div");
		root.innerHTML = '<img src="stop.png">';
		document.body.appendChild(root);

		const violations = await findA11yViolations(root);

		expect(violations).toHaveLength(1);
		expect(violations[0]).toMatch(/^image-alt: /);
	});

	it("jsdom で検査できない color-contrast を違反に含めない", async () => {
		// 灰色地に薄い灰色の文字．ブラウザなら color-contrast が落ちる配色．
		const root = document.createElement("div");
		root.innerHTML =
			'<p style="color:#777;background:#888">コントラストの低い文字</p>';
		document.body.appendChild(root);

		await expect(findA11yViolations(root)).resolves.toEqual([]);
	});

	it("ランドマークを持たない部品単体の描画を region 違反にしない", async () => {
		// 部品はページ全体（App）の中で main などのランドマークに包まれる．
		// 単体で描画したときにその不在を咎めると，全部品で偽陽性になる．
		document.body.innerHTML = "<h2>見出し</h2><p>本文</p>";

		await expect(findA11yViolations(document.body)).resolves.toEqual([]);
	});

	it("複数の違反をそれぞれ 1 行で返す", async () => {
		const root = document.createElement("div");
		root.innerHTML = '<img src="a.png"><input type="text">';
		document.body.appendChild(root);

		const violations = await findA11yViolations(root);

		expect(violations.map((v) => v.split(":")[0]).sort()).toEqual([
			"image-alt",
			"label",
		]);
	});
});
