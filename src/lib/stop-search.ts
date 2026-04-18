import type { Database } from "sql.js";
import { NEARBY_THRESHOLD_METERS, distanceMeters } from "./geo-utils";
import { isReachable } from "./stop-reachability";

/** 名前統合の距離閾値（メートル） */
const MERGE_THRESHOLD_METERS = 200;

/** バス停名を正規化する（Unicode NFKC 正規化で全角/半角を統一） */
function normalizeName(name: string): string {
	return name.normalize("NFKC").trim();
}

/** 正規化済みの名前で包含関係を判定する */
function normalizedNamesContain(na: string, nb: string): boolean {
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

/**
 * 到達可能性フィルタオプション。
 *
 * Issue #90: 乗り換えを前提としないため、検索結果から直通便で
 * 到達不能なバス停を除外するために用いる。両フィールドを同時に
 * 指定した場合は AND 条件で絞り込む。
 */
export type ReachabilityFilter = {
	/** 指定した stop_id 群のいずれかから直通便で到達できる候補のみ返す */
	reachableFromOrigin?: string[];
	/** 指定した stop_id 群のいずれかに直通便で到達できる候補のみ返す */
	reachableToDestination?: string[];
};

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
	limit: number = DEFAULT_LIMIT,
	filter: ReachabilityFilter = {},
): StopSearchResult[] {
	const trimmed = query.trim();
	if (trimmed === "") {
		return [];
	}

	const sanitizedLimit = Math.max(1, Math.min(Math.floor(limit), 100));

	const escaped = escapeLike(trimmed);

	// coderabbitai #96 指摘: 到達可能性フィルタは SQL 段階ではなく
	// クラスタリング後に適用する。SQL 段階で個別 stop を除外すると、
	// クラスタ内で一部メンバーのみ直通便の起点/終点に成り得るケースで
	// `clusterStopIds` の「クラスタに含まれる全物理バス停」という契約が
	// 破壊される（事業者バッジの欠落や名前統合の崩れを招く）ため。
	// ここでは名前マッチのみを SQL で行い、到達可能性はクラスタ単位で
	// `isReachable` を使って判定する。
	//
	// 空配列は「フィルタなし」と解釈し、呼び出し側で未選択状態を
	// 安全に扱えるようにする（クラスタ展開の結果が空のときの防御）。
	const sql =
		"SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_name LIKE ? ESCAPE '\\' ORDER BY stop_name, stop_id";
	const stmt = db.prepare(sql);
	let rawRows: RawStopRow[];
	try {
		stmt.bind([`%${escaped}%`]);
		rawRows = [];
		while (stmt.step()) {
			const row = stmt.getAsObject() as unknown as RawStopRow;
			rawRows.push(row);
		}
	} finally {
		stmt.free();
	}

	if (rawRows.length === 0) {
		return [];
	}

	const clusters = clusterByNameAndDistance(rawRows);

	const originIds = filter.reachableFromOrigin;
	const hasOriginFilter = originIds !== undefined && originIds.length > 0;
	const destinationIds = filter.reachableToDestination;
	const hasDestinationFilter =
		destinationIds !== undefined && destinationIds.length > 0;

	// クラスタ単位の到達可能性判定。クラスタ内のいずれかのメンバーが
	// 条件を満たせばクラスタを採用し、clusterStopIds は生成時の完全な
	// 集合を保持する。
	const filteredClusters = clusters.filter((cluster) => {
		const prefixedIds = cluster.stopIds;
		if (hasOriginFilter && !isReachable(db, originIds, prefixedIds)) {
			return false;
		}
		if (hasDestinationFilter && !isReachable(db, prefixedIds, destinationIds)) {
			return false;
		}
		return true;
	});

	const needsDisambiguation = findNamesNeedingDisambiguation(filteredClusters);
	const results: StopSearchResult[] = [];

	for (const cluster of filteredClusters) {
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
	// 正規化済み名前を事前計算してループ内の再正規化を回避
	const normalizedMergedNames: string[][] = mergedNames.map((names) =>
		names.map(normalizeName),
	);
	for (let i = 0; i < clusters.length; i++) {
		for (let j = i + 1; j < clusters.length; j++) {
			const canMerge =
				normalizedMergedNames[i].some((ni) =>
					normalizedMergedNames[j].some((nj) => normalizedNamesContain(ni, nj)),
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
				normalizedMergedNames[i].push(...normalizedMergedNames[j]);
				clusters.splice(j, 1);
				mergedNames.splice(j, 1);
				normalizedMergedNames.splice(j, 1);
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
	const normalizedRefName = normalizeName(refName);
	const degPerMeter = 1 / 111_000; // 緯度 1 度 ≈ 111km
	const latDelta = MERGE_THRESHOLD_METERS * degPerMeter;
	const lonDelta =
		MERGE_THRESHOLD_METERS / (111_000 * Math.cos((refLat * Math.PI) / 180));
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
				normalizedNamesContain(
					normalizedRefName,
					normalizeName(row.stop_name),
				) &&
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
