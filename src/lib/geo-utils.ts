/**
 * 2 地点間の距離をメートルで返す（簡易計算）。
 *
 * 旭川市周辺（北緯 43 度付近）での利用を想定し、
 * 正距円筒図法の近似式を使用する。
 * 500m 程度の閾値判定には十分な精度である。
 */
export function distanceMeters(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const toRad = Math.PI / 180;
	const dy = (lat2 - lat1) * 111_320;
	const dx = (lon2 - lon1) * 111_320 * Math.cos(((lat1 + lat2) / 2) * toRad);
	return Math.sqrt(dx * dx + dy * dy);
}

/** 近距離とみなす閾値（メートル） */
export const NEARBY_THRESHOLD_METERS = 500;

/**
 * 座標配列の中で、指定座標に最も近い要素のインデックスを返す。
 *
 * @param points - 検索対象の座標配列（{lat, lon} の配列）
 * @param targetLat - 目標の緯度
 * @param targetLon - 目標の経度
 * @returns 最も近い要素のインデックス。配列が空の場合は -1
 */
export function findClosestPointIndex(
	points: ReadonlyArray<{ lat: number; lon: number }>,
	targetLat: number,
	targetLon: number,
): number {
	if (points.length === 0) return -1;

	let minDist = Number.POSITIVE_INFINITY;
	let minIdx = 0;
	for (let i = 0; i < points.length; i++) {
		const d = distanceMeters(
			points[i].lat,
			points[i].lon,
			targetLat,
			targetLon,
		);
		if (d < minDist) {
			minDist = d;
			minIdx = i;
		}
	}
	return minIdx;
}
