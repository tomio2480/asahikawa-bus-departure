import type { Database } from "sql.js";

export type DataExpiry = {
	/** 全 calendar の最も早い end_date（YYYYMMDD） */
	earliestEndDate: string;
	/** 全 calendar の最も遅い end_date（YYYYMMDD） */
	latestEndDate: string;
	/** 指定日に全データが期限切れかどうかを判定する */
	isExpired: (dateStr: string) => boolean;
	/** 指定日に一部データが期限切れかどうかを判定する */
	isPartiallyExpired: (dateStr: string) => boolean;
};

/**
 * GTFS データの有効期限情報を取得する。
 *
 * calendar テーブルの end_date から最も早い期限と最も遅い期限を取得し、
 * 任意の日付に対して期限切れ判定を行う関数を返す。
 *
 * @param db - sql.js データベース
 * @returns 有効期限情報。calendar が空の場合は null
 */
export function getDataExpiry(db: Database): DataExpiry | null {
	const result = db.exec(
		"SELECT MIN(end_date) AS earliest, MAX(end_date) AS latest FROM calendar",
	);

	if (result.length === 0 || result[0].values[0][0] === null) {
		return null;
	}

	const earliest = result[0].values[0][0] as string;
	const latest = result[0].values[0][1] as string;

	return {
		earliestEndDate: earliest,
		latestEndDate: latest,
		isExpired: (dateStr: string) => dateStr > latest,
		isPartiallyExpired: (dateStr: string) =>
			dateStr > earliest && dateStr <= latest,
	};
}
