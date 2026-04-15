import type { Database } from "sql.js";
import { NEARBY_THRESHOLD_METERS, distanceMeters } from "./geo-utils";

/** 名前統合の距離閾値（メートル） */
const MERGE_THRESHOLD_METERS = 200;

/** バス停名を正規化する（全角数字/英字→半角、全角スペース→半角） */
function normalizeName(name: string): string {
	return name
		.replace(/[０-９]/g, (c) =>
			String.fromCharCode(c.charCodeAt(0) - 0xfee0),
		)
		.replace(/[Ａ-Ｚａ-ｚ]/g, (c) =>
			String.fromCharCode(c.charCodeAt(0) - 0xfee0),
		)
		.replace(/\u3000/g, " ")
		.trim();
}

/** 正規化後に一方が他方を含む（前方/後方/部分一致/正規化一致）か判定する */
function namesContain(a: string, b: string): boolean {
	const na = normalizeName(a);
	const nb = normalizeName(b);
	return na.includes(nb) || nb.includes(na);
}

/** バス停検索結果の型 */
export type StopSearchResult = {
	stop_id: string;
	stop_name: string;
	/** 同名バス停が遠距離に存在する場合の区別ラベル（事業者名など） */
	disambiguationLabel?: string;
	/** クラスタに含まれる全バス停の stop_id（事業者バッジ表示用） */
	clusterStopIds: string[];
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
				clusterStopIds: cluster.stopIds,
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
 * バス停を距離ベースでクラスタリングする。
 *
 * 同じ名前のバス停を近距離（500m 以内）でグループ化する。
 * さらに、名前に包含関係があり 200m 以内のクラスタを統合する。
 * 統合されたクラスタの表示名は「短い名前/長い名前」形式になる。
 * 入力は stop_id 昇順であるため、最初にクラスタを形成した stop_id が代表となる。
 */
function clusterByNameAndDistance(rows: RawStopRow[]): StopCluster[] {
	// 同名バス停を距離でクラスタリング
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

	// 名前に包含関係があり 200m 以内のクラスタを統合
	// 比較には元の名前を使い、統合後の表示名は最後に構築する
	const originalNames = clusters.map((c) => c.stopName);
	const mergedNames: string[][] = clusters.map((_, i) => [originalNames[i]]);
	for (let i = 0; i < clusters.length; i++) {
		for (let j = i + 1; j < clusters.length; j++) {
			const canMerge =
				mergedNames[i].some((ni) =>
					mergedNames[j].some((nj) => namesContain(ni, nj)),
				) &&
				distanceMeters(
					clusters[i].lat,
					clusters[i].lon,
					clusters[j].lat,
					clusters[j].lon,
				) <= MERGE_THRESHOLD_METERS;
			if (canMerge) {
				clusters[i].stopIds.push(...clusters[j].stopIds);
				mergedNames[i].push(...mergedNames[j]);
				clusters.splice(j, 1);
				mergedNames.splice(j, 1);
				j--;
			}
		}
	}
	// 統合された名前を「短い名前/長い名前」形式に設定
	for (let i = 0; i < clusters.length; i++) {
		const uniqueNames = [...new Set(mergedNames[i])];
		if (uniqueNames.length > 1) {
			uniqueNames.sort((a, b) => a.length - b.length);
			clusters[i].stopName = uniqueNames.join("/");
		}
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
 * さらに、名前に包含関係があり 200m 以内のバス停も兄弟として返す。
 * 同じ物理的な場所にある上り・下りや別事業者のバス停を網羅する。
 * 遠距離の同名バス停は含めない。
 */
export function getSiblingStopIds(db: Database, stopId: string): string[] {
	const refStmt = db.prepare(
		"SELECT stop_name, stop_lat, stop_lon FROM stops WHERE stop_id = ?",
	);
	let refStop: { stop_name: string; stop_lat: number; stop_lon: number };
	try {
		refStmt.bind([stopId]);
		if (!refStmt.step()) {
			return [stopId];
		}
		refStop = refStmt.getAsObject() as typeof refStop;
	} finally {
		refStmt.free();
	}

	const { stop_name: refName, stop_lat: refLat, stop_lon: refLon } = refStop;

	// 同名バス停（500m 以内）
	const siblingsStmt = db.prepare(
		"SELECT stop_id, stop_lat, stop_lon FROM stops WHERE stop_name = ?",
	);
	const siblings: string[] = [];
	try {
		siblingsStmt.bind([refName]);
		while (siblingsStmt.step()) {
			const row = siblingsStmt.getAsObject() as {
				stop_id: string;
				stop_lat: number;
				stop_lon: number;
			};
			if (
				distanceMeters(refLat, refLon, row.stop_lat, row.stop_lon) <=
				NEARBY_THRESHOLD_METERS
			) {
				siblings.push(row.stop_id);
			}
		}
	} finally {
		siblingsStmt.free();
	}

	// 名前に包含関係があるバス停（200m 以内、bounding box で候補を絞り込み）
	const siblingIds = new Set(siblings);
	const degPerMeter = 1 / 111_000; // 緯度 1 度 ≈ 111km
	const latDelta = MERGE_THRESHOLD_METERS * degPerMeter;
	const lonDelta =
		MERGE_THRESHOLD_METERS /
		(111_000 * Math.cos((refLat * Math.PI) / 180));
	const nearbyStmt = db.prepare(
		"SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ?",
	);
	try {
		nearbyStmt.bind([
			refLat - latDelta,
			refLat + latDelta,
			refLon - lonDelta,
			refLon + lonDelta,
		]);
		while (nearbyStmt.step()) {
			const row = nearbyStmt.getAsObject() as {
				stop_id: string;
				stop_name: string;
				stop_lat: number;
				stop_lon: number;
			};
			if (siblingIds.has(row.stop_id)) continue;
			if (
				namesContain(refName, row.stop_name) &&
				distanceMeters(refLat, refLon, row.stop_lat, row.stop_lon) <=
					MERGE_THRESHOLD_METERS
			) {
				siblings.push(row.stop_id);
				siblingIds.add(row.stop_id);
			}
		}
	} finally {
		nearbyStmt.free();
	}

	return siblings.length > 0 ? siblings : [stopId];
}

/** LIKE のワイルドカード文字をエスケープする */
function escapeLike(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
