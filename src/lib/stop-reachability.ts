import type { Database } from "sql.js";

/**
 * from のいずれかから to のいずれかへ直通便で到達できるかを判定する。
 *
 * Issue #90: 乗り換えを前提としないため、同一 trip 上で
 * from.stop_sequence < to.stop_sequence を満たす停留所ペアが
 * 1 組でも存在すれば到達可能とみなす。
 *
 * 大規模な路線網でも EXISTS により最初のヒットで探索が止まるため、
 * 停留所選択やフォーム送信時のリアルタイム判定に適した計算量になる。
 *
 * @param db sql.js データベース
 * @param fromStopIds 乗車側の候補 stop_id 群（クラスタ展開後を想定）
 * @param toStopIds 降車側の候補 stop_id 群（クラスタ展開後を想定）
 * @returns いずれかの (from, to) 組で直通便があれば true
 */
export function isReachable(
	db: Database,
	fromStopIds: string[],
	toStopIds: string[],
): boolean {
	// 空配列に対してはクエリを投げず false を返す。
	// IN () は SQL 構文エラーになるため防御的にガードする。
	if (fromStopIds.length === 0 || toStopIds.length === 0) {
		return false;
	}

	const fromPlaceholders = fromStopIds.map(() => "?").join(", ");
	const toPlaceholders = toStopIds.map(() => "?").join(", ");

	const stmt = db.prepare(
		`SELECT EXISTS (
			SELECT 1
			FROM stop_times st_from
			JOIN stop_times st_to
				ON st_from.trip_id = st_to.trip_id
				AND st_from.stop_sequence < st_to.stop_sequence
			WHERE st_from.stop_id IN (${fromPlaceholders})
				AND st_to.stop_id IN (${toPlaceholders})
		) AS reachable`,
	);
	try {
		stmt.bind([...fromStopIds, ...toStopIds]);
		if (!stmt.step()) {
			// SELECT EXISTS は必ず 1 行返すので通常このパスには到達しない。
			// 防御的に false を返す。
			return false;
		}
		const row = stmt.getAsObject() as { reachable: number };
		return row.reachable === 1;
	} finally {
		stmt.free();
	}
}
