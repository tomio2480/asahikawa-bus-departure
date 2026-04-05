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
	const map: Record<string, number> = {
		Sun: 0,
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6,
	};
	return map[weekdayStr];
}

function formatDate(date: Date): string {
	const { year, month, day } = getJstParts(date);
	return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
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
	return result[0].values.map((row) => row[0] as string);
}
