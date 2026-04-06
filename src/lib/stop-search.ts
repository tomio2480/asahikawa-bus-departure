import type { Database } from "sql.js";

/** バス停検索結果の型 */
export type StopSearchResult = {
	stop_id: string;
	stop_name: string;
};

/** 検索結果の最大件数 */
const DEFAULT_LIMIT = 20;

/**
 * バス停名でインクリメンタルサーチを行う。
 * LIKE 演算子による部分一致検索を使用する。
 */
export function searchStops(
	db: Database,
	query: string,
	limit = DEFAULT_LIMIT,
): StopSearchResult[] {
	const trimmed = query.trim();
	if (trimmed === "") {
		return [];
	}

	const sanitizedLimit = Math.max(1, Math.min(Math.floor(limit), 100));

	const escaped = escapeLike(trimmed);
	const stmt = db.prepare(
		"SELECT stop_id, stop_name FROM stops WHERE stop_name LIKE ? ESCAPE '\\' ORDER BY stop_name LIMIT ?",
	);
	try {
		stmt.bind([`%${escaped}%`, sanitizedLimit]);
		const results: StopSearchResult[] = [];
		while (stmt.step()) {
			const row = stmt.getAsObject() as unknown as StopSearchResult;
			results.push(row);
		}
		return results;
	} finally {
		stmt.free();
	}
}

/** LIKE のワイルドカード文字をエスケープする */
function escapeLike(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
