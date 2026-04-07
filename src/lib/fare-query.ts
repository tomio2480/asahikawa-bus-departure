import type { Database } from "sql.js";

export type Fare = {
	fareId: string;
	price: number;
	currencyType: string;
};

/**
 * 乗車バス停・降車バス停・路線から運賃を取得する。
 *
 * GTFS の運賃はゾーン制で、fare_rules テーブルの origin_id / destination_id が
 * stops テーブルの zone_id に対応する。route_id による絞り込みも行う。
 *
 * 検索優先順位:
 * 1. route_id + origin_id + destination_id が全て一致
 * 2. origin_id + destination_id が一致（route_id が NULL）
 * 3. route_id のみ一致（origin_id, destination_id が NULL）
 *
 * @param db - sql.js データベース
 * @param fromStopId - 乗車バス停 ID
 * @param toStopId - 降車バス停 ID
 * @param routeId - 路線 ID
 * @returns 運賃情報。該当なしの場合は null
 */
export function getFare(
	db: Database,
	fromStopId: string,
	toStopId: string,
	routeId: string,
): Fare | null {
	const stmt = db.prepare(`
		SELECT
			fa.fare_id,
			fa.price,
			fa.currency_type,
			CASE
				WHEN fr.route_id IS NOT NULL AND fr.origin_id IS NOT NULL AND fr.destination_id IS NOT NULL THEN 3
				WHEN fr.origin_id IS NOT NULL AND fr.destination_id IS NOT NULL THEN 2
				WHEN fr.route_id IS NOT NULL THEN 1
				ELSE 0
			END AS priority
		FROM fare_rules fr
		JOIN fare_attributes fa ON fr.fare_id = fa.fare_id
		LEFT JOIN stops s_from ON s_from.stop_id = ?
		LEFT JOIN stops s_to ON s_to.stop_id = ?
		WHERE
			(fr.route_id = ? OR fr.route_id IS NULL)
			AND (fr.origin_id = s_from.zone_id OR fr.origin_id IS NULL)
			AND (fr.destination_id = s_to.zone_id OR fr.destination_id IS NULL)
		ORDER BY priority DESC
		LIMIT 1
	`);

	try {
		stmt.bind([fromStopId, toStopId, routeId]);
		if (!stmt.step()) {
			return null;
		}
		const row = stmt.getAsObject() as unknown as {
			fare_id: string;
			price: number;
			currency_type: string;
			priority: number;
		};
		return {
			fareId: row.fare_id,
			price: row.price,
			currencyType: row.currency_type,
		};
	} finally {
		stmt.free();
	}
}
