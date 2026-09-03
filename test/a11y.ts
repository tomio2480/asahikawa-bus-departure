import axe from "axe-core";

/**
 * 部品単体のテストでは判定できない規則を外す．
 *
 * - color-contrast: jsdom には要素の配置と描画済みの CSS が無く，色を判定できない．
 *   ブラウザの DevTools で確かめる（ACCESSIBILITY.md「手動確認の運用」）．
 * - region: 部品は App の header / main / footer に包まれて初めてランドマークを持つ．
 *   単体で描画したときにその不在を咎めると，全部品で偽陽性になる．
 */
const RULES_DISABLED_FOR_COMPONENT_TESTS: axe.RunOptions["rules"] = {
	"color-contrast": { enabled: false },
	region: { enabled: false },
};

type FindA11yViolationsOptions = {
	/**
	 * ページ全体（App）を検査するときに true にする．
	 * ランドマークの構造そのものが対象になるため，region を有効へ戻す．
	 * aria-live や alert / status 役割の要素は axe がランドマークと同等に扱う．
	 */
	pageLevel?: boolean;
};

/**
 * DOM ツリーへ接続済みの要素を axe-core で検査し，違反を 1 件 1 行で返す．
 * 形式は `<rule-id>: <help> (<selector>, ...)` とする．
 * 違反が無ければ空配列を返すため，テストでは `toEqual([])` で固定できる．
 */
export async function findA11yViolations(
	container: Element,
	options: FindA11yViolationsOptions = {},
): Promise<string[]> {
	const rules = options.pageLevel
		? { ...RULES_DISABLED_FOR_COMPONENT_TESTS, region: { enabled: true } }
		: RULES_DISABLED_FOR_COMPONENT_TESTS;
	const results = await axe.run(container, { rules });
	return results.violations.map((violation) => {
		const targets = violation.nodes
			.map((node) => node.target.join(" "))
			.join(", ");
		return `${violation.id}: ${violation.help} (${targets})`;
	});
}
