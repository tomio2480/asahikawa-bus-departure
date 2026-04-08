import type { Database } from "sql.js";
import { NEARBY_THRESHOLD_METERS, distanceMeters } from "./geo-utils";

/** バス停検索結果の型 */
export type StopSearchResult = {
	stop_id: string;
	stop_name: string;
	/** 同名バス停が遠距離に存在する場合の区別ラベル（事業者名など） */
	disambiguationLabel?: string;
};

/** 検索結果の最大件数 */
const DEFAULT_LIMIT = 20;

/** SQL から取得する生データの型 */
type RawStopRow = {
	stop_id: string;
	stop_name: string;
	stop_lat: number;
	stop_lon: number;
};

/** クラスタリング後の中間データ */
type StopCluster = {
	representativeId: string;
	stopName: string;
	lat: number;
	lon: number;
	stopIds: string[];
};

/**
 * バス停名でインクリメンタルサーチを行う。
 *
 * 同名バス停が近距離（500m 以内）にある場合はひとつに統合する。
 * 同名バス停が遠距離にある場合は別エントリとして返し、
 * 事業者名で区別するラベルを付与する。
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
		"SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_name LIKE ? ESCAPE '\\' ORDER BY stop_name, stop_id",
	);
	try {
		stmt.bind([`%${escaped}%`]);
		const rawRows: RawStopRow[] = [];
		while (stmt.step()) {
			const row = stmt.getAsObject() as unknown as RawStopRow;
			rawRows.push(row);
		}

		if (rawRows.length === 0) {
			return [];
		}

		const clusters = clusterByNameAndDistance(rawRows);
		const needsDisambiguation = findNamesNeedingDisambiguation(clusters);
		const results: StopSearchResult[] = [];

		for (const cluster of clusters) {
			if (results.length >= sanitizedLimit) break;

			const result: StopSearchResult = {
				stop_id: cluster.representativeId,
				stop_name: cluster.stopName,
			};

			if (needsDisambiguation.has(cluster.stopName)) {
				result.disambiguationLabel = resolveDisambiguationLabel(
					db,
					cluster.representativeId,
				);
			}

			results.push(result);
		}

		return results;
	} finally {
		stmt.free();
	}
}

/**
 * 同名バス停を距離ベースでクラスタリングする。
 *
 * 同じ名前のバス停を近距離（500m 以内）でグループ化し、
 * 各クラスタの代表 stop_id（辞書順で最小）を返す。
 */
function clusterByNameAndDistance(rows: RawStopRow[]): StopCluster[] {
	const byName = new Map<string, RawStopRow[]>();
	for (const row of rows) {
		const existing = byName.get(row.stop_name);
		if (existing) {
			existing.push(row);
		} else {
			byName.set(row.stop_name, [row]);
		}
	}

	const clusters: StopCluster[] = [];

	for (const [stopName, stops] of byName) {
		const nameClusters: StopCluster[] = [];

		for (const stop of stops) {
			let merged = false;
			for (const cluster of nameClusters) {
				if (
					distanceMeters(
						cluster.lat,
						cluster.lon,
						stop.stop_lat,
						stop.stop_lon,
					) <= NEARBY_THRESHOLD_METERS
				) {
					cluster.stopIds.push(stop.stop_id);
					// 代表 ID は辞書順で最小のものを採用
					if (stop.stop_id < cluster.representativeId) {
						cluster.representativeId = stop.stop_id;
						cluster.lat = stop.stop_lat;
						cluster.lon = stop.stop_lon;
					}
					merged = true;
					break;
				}
			}
			if (!merged) {
				nameClusters.push({
					representativeId: stop.stop_id,
					stopName,
					lat: stop.stop_lat,
					lon: stop.stop_lon,
					stopIds: [stop.stop_id],
				});
			}
		}

		clusters.push(...nameClusters);
	}

	clusters.sort((a, b) => {
		if (a.stopName < b.stopName) return -1;
		if (a.stopName > b.stopName) return 1;
		return 0;
	});
	return clusters;
}

/**
 * 同名で複数クラスタが存在するバス停名を特定する。
 */
function findNamesNeedingDisambiguation(clusters: StopCluster[]): Set<string> {
	const nameCount = new Map<string, number>();
	for (const c of clusters) {
		nameCount.set(c.stopName, (nameCount.get(c.stopName) ?? 0) + 1);
	}
	const result = new Set<string>();
	for (const [name, count] of nameCount) {
		if (count > 1) {
			result.add(name);
		}
	}
	return result;
}

/**
 * 区別ラベルを生成する。
 *
 * stop_id のオペレータプレフィックス（例: "dohoku:S001" → "dohoku"）から
 * agency テーブルの事業者名を引いてラベルとする。
 */
function resolveDisambiguationLabel(db: Database, stopId: string): string {
	const colonIndex = stopId.indexOf(":");
	if (colonIndex < 0) return stopId;

	const operatorPrefix = stopId.substring(0, colonIndex);

	const result = db.exec(
		"SELECT agency_name FROM agency WHERE agency_id LIKE ? LIMIT 1",
		[`${operatorPrefix}:%`],
	);
	if (result.length > 0 && result[0].values.length > 0) {
		return result[0].values[0][0] as string;
	}
	return operatorPrefix;
}

/** stop_id からバス停名を取得する。見つからない場合は stop_id をそのまま返す */
export function getStopName(db: Database, stopId: string): string {
	const stmt = db.prepare("SELECT stop_name FROM stops WHERE stop_id = ?");
	try {
		stmt.bind([stopId]);
		if (stmt.step()) {
			const row = stmt.getAsObject() as unknown as { stop_name: string };
			return row.stop_name;
		}
		return stopId;
	} finally {
		stmt.free();
	}
}

/**
 * 指定した stop_id と同名かつ近距離（500m 以内）のバス停の全 stop_id を返す。
 * 同じ物理的な場所にある上り・下りや別事業者のバス停を網羅する。
 * 遠距離の同名バス停は含めない。
 */
export function getSiblingStopIds(db: Database, stopId: string): string[] {
	const result = db.exec(
		`SELECT s2.stop_id, s2.stop_lat, s2.stop_lon, s1.stop_lat AS ref_lat, s1.stop_lon AS ref_lon
		 FROM stops s1
		 JOIN stops s2 ON s1.stop_name = s2.stop_name
		 WHERE s1.stop_id = ?`,
		[stopId],
	);
	if (result.length === 0) {
		return [stopId];
	}

	const siblings: string[] = [];
	for (const row of result[0].values) {
		const siblingId = row[0] as string;
		const sibLat = row[1] as number;
		const sibLon = row[2] as number;
		const refLat = row[3] as number;
		const refLon = row[4] as number;

		if (
			distanceMeters(refLat, refLon, sibLat, sibLon) <= NEARBY_THRESHOLD_METERS
		) {
			siblings.push(siblingId);
		}
	}

	return siblings.length > 0 ? siblings : [stopId];
}

/** LIKE のワイルドカード文字をエスケープする */
function escapeLike(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
