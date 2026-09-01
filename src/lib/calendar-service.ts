import type { Database } from "sql.js";

const TIMEZONE = "Asia/Tokyo";

const WEEKDAY_COLUMNS = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
] as const;

function getJstParts(date: Date): { year: number; month: number; day: number } {
	const fmt = new Intl.DateTimeFormat("en-US", {
		timeZone: TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const parts = fmt.formatToParts(date);
	return {
		year: Number(parts.find((p) => p.type === "year")?.value),
		month: Number(parts.find((p) => p.type === "month")?.value),
		day: Number(parts.find((p) => p.type === "day")?.value),
	};
}

function getJstWeekday(date: Date): number {
	const weekdayStr = new Intl.DateTimeFormat("en-US", {
		timeZone: TIMEZONE,
		weekday: "short",
	}).format(date);
	const map = {
		Sun: 0,
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6,
	} as const;
	const weekday = map[weekdayStr as keyof typeof map];
	if (weekday === undefined) {
		throw new Error(`Unsupported weekday token: ${weekdayStr}`);
	}
	return weekday;
}

function formatDate(date: Date): string {
	const { year, month, day } = getJstParts(date);
	return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

/** 前期間データの ID に付く接頭辞（useDatabase の loadGtfsData と対応） */
const PREV_PREFIX = "prev~";

function isPrevServiceId(serviceId: string): boolean {
	return serviceId.includes(PREV_PREFIX);
}

/** service_id の事業者部分（"denkikido:prev~WD" → "denkikido"）を返す */
function getOperatorId(serviceId: string): string {
	const colonIndex = serviceId.indexOf(":");
	return colonIndex < 0 ? "" : serviceId.substring(0, colonIndex);
}

/** 現行ダイヤの適用が始まっている事業者を返す */
function getOperatorsWithStartedSchedule(
	db: Database,
	dateStr: string,
): Set<string> {
	const operators = new Set<string>();
	const result = db.exec(
		"SELECT DISTINCT service_id FROM calendar WHERE start_date <= ?",
		[dateStr],
	);
	if (result.length === 0) {
		return operators;
	}
	for (const row of result[0].values) {
		const serviceId = row[0] as string;
		if (isPrevServiceId(serviceId)) continue;
		operators.add(getOperatorId(serviceId));
	}
	return operators;
}

/**
 * 現行ダイヤが開始済みの事業者について、前期間の service_id を落とす。
 *
 * 前期間データは、次期データが先に公開されて現行期間が上書きされる事情への
 * 対処であり、現行ダイヤの開始前を埋めるために保持する。開始後も混ぜると、
 * 改定で消えた便が残り、取得上限も重複した便に食われる。
 */
function excludeSupersededPrevServiceIds(
	db: Database,
	serviceIds: string[],
	dateStr: string,
): string[] {
	if (!serviceIds.some(isPrevServiceId)) {
		return serviceIds;
	}
	const startedOperators = getOperatorsWithStartedSchedule(db, dateStr);
	return serviceIds.filter(
		(serviceId) =>
			!isPrevServiceId(serviceId) ||
			!startedOperators.has(getOperatorId(serviceId)),
	);
}

export function getActiveServiceIds(db: Database, date: Date): string[] {
	const dateStr = formatDate(date);
	const weekdayColumn = WEEKDAY_COLUMNS[getJstWeekday(date)];

	const result = db.exec(
		`SELECT service_id FROM calendar
		   WHERE ${weekdayColumn} = 1 AND start_date <= ? AND end_date >= ?
		 UNION
		 SELECT service_id FROM calendar_dates
		   WHERE date = ? AND exception_type = 1
		 EXCEPT
		 SELECT service_id FROM calendar_dates
		   WHERE date = ? AND exception_type = 2`,
		[dateStr, dateStr, dateStr, dateStr],
	);

	if (result.length === 0) {
		return [];
	}
	const serviceIds = result[0].values.map((row) => row[0] as string);
	return excludeSupersededPrevServiceIds(db, serviceIds, dateStr);
}
