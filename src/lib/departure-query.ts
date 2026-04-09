import type { Database } from "sql.js";
import type { Fare } from "./fare-query";

export type Departure = {
	tripId: string;
	routeId: string;
	routeName: string;
	headsign: string;
	departureTime: string;
	arrivalTime: string;
	fromStopId: string;
	toStopId: string;
	shapeId: string | null;
	fare: Fare | null;
};

/**
 * 指定したバス停間の発車案内を取得する。
 *
 * GTFS の時刻文字列（HH:MM:SS）はゼロパディングされているため、
 * 文字列の辞書順比較で正しくフィルタ・ソートできる。
 * 24 時超の表記（例: "25:30:00"）も辞書順で正しく処理される。
 *
 * @param db - sql.js データベース
 * @param serviceIds - 有効な service_id の配列
 * @param fromStopIds - 乗車バス停 ID（文字列または配列）
 * @param toStopIds - 降車バス停 ID（文字列または配列）
 * @param afterTime - この時刻以降の便を取得（HH:MM:SS 形式）
 * @param limit - 取得件数の上限（デフォルト: 10）
 */
export function getDepartures(
	db: Database,
	serviceIds: string[],
	fromStopIds: string | string[],
	toStopIds: string | string[],
	afterTime: string,
	limit = 10,
): Departure[] {
	if (serviceIds.length === 0) {
		return [];
	}

	const sanitizedLimit = Math.max(0, Math.floor(limit));
	if (sanitizedLimit === 0) {
		return [];
	}

	const fromIds = Array.isArray(fromStopIds) ? fromStopIds : [fromStopIds];
	const toIds = Array.isArray(toStopIds) ? toStopIds : [toStopIds];

	if (fromIds.length === 0 || toIds.length === 0) {
		return [];
	}

	const fromPlaceholders = fromIds.map(() => "?").join(", ");
	const toPlaceholders = toIds.map(() => "?").join(", ");
	const servicePlaceholders = serviceIds.map(() => "?").join(", ");

	const result = db.exec(
		`SELECT
			st_from.trip_id,
			t.route_id,
			COALESCE(NULLIF(r.route_short_name, ''), NULLIF(r.route_long_name, ''), '') AS route_name,
			COALESCE(t.trip_headsign, '') AS headsign,
			st_from.departure_time,
			st_to.arrival_time,
			st_from.stop_id AS from_stop_id,
			st_to.stop_id AS to_stop_id,
			t.shape_id
		FROM stop_times st_from
		JOIN stop_times st_to
			ON st_from.trip_id = st_to.trip_id
			AND st_from.stop_sequence < st_to.stop_sequence
		JOIN trips t ON st_from.trip_id = t.trip_id
		JOIN routes r ON t.route_id = r.route_id
		WHERE st_from.stop_id IN (${fromPlaceholders})
			AND st_to.stop_id IN (${toPlaceholders})
			AND t.service_id IN (${servicePlaceholders})
			AND st_from.departure_time >= ?
		ORDER BY st_from.departure_time ASC
		LIMIT ?`,
		[...fromIds, ...toIds, ...serviceIds, afterTime, sanitizedLimit],
	);

	if (result.length === 0) {
		return [];
	}

	return result[0].values.map((row) => ({
		tripId: row[0] as string,
		routeId: row[1] as string,
		routeName: row[2] as string,
		headsign: row[3] as string,
		departureTime: row[4] as string,
		arrivalTime: row[5] as string,
		fromStopId: row[6] as string,
		toStopId: row[7] as string,
		shapeId: (row[8] as string | null) ?? null,
		fare: null,
	}));
}

/**
 * 現在時刻に徒歩所要時間を加算して乗車可能時刻を算出する。
 *
 * @param now - 現在時刻
 * @param walkMinutes - 徒歩所要時間（分）
 * @returns 乗車可能時刻（HH:MM:SS 形式）
 */
export function calculateBoardingTime(now: Date, walkMinutes: number): string {
	const sanitizedWalkMinutes = Math.max(0, Math.floor(walkMinutes));

	const fmt = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Tokyo",
		hourCycle: "h23",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const parts = fmt.formatToParts(now);
	const hourStr = parts.find((p) => p.type === "hour")?.value;
	const minuteStr = parts.find((p) => p.type === "minute")?.value;
	const secondStr = parts.find((p) => p.type === "second")?.value;
	if (!hourStr || !minuteStr || !secondStr) {
		throw new Error("Failed to extract time parts from Intl.DateTimeFormat");
	}
	const hours = Number(hourStr);
	const minutes = Number(minuteStr);
	const seconds = Number(secondStr);

	const totalMinutes = hours * 60 + minutes + sanitizedWalkMinutes;
	const h = Math.floor(totalMinutes / 60);
	const m = totalMinutes % 60;

	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
