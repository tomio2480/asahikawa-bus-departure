import axe from "axe-core";

/**
 * jsdom には要素の配置と描画済みの CSS が無く，色のコントラストを判定できない．
 * この規則はブラウザの DevTools で確かめる（ACCESSIBILITY.md「手動確認の運用」）．
 */
const RULES_UNAVAILABLE_IN_JSDOM: axe.RunOptions["rules"] = {
	"color-contrast": { enabled: false },
};

/**
 * DOM ツリーへ接続済みの要素を axe-core で検査し，違反を 1 件 1 行で返す．
 * 形式は `<rule-id>: <help> (<selector>, ...)` とする．
 * 違反が無ければ空配列を返すため，テストでは `toEqual([])` で固定できる．
 */
export async function findA11yViolations(
	container: Element,
): Promise<string[]> {
	const results = await axe.run(container, {
		rules: RULES_UNAVAILABLE_IN_JSDOM,
	});
	return results.violations.map((violation) => {
		const targets = violation.nodes
			.map((node) => node.target.join(" "))
			.join(", ");
		return `${violation.id}: ${violation.help} (${targets})`;
	});
}
