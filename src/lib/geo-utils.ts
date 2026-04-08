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
