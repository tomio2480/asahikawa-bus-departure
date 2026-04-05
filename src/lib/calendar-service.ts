import type { Database } from "sql.js";

const WEEKDAY_COLUMNS = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
] as const;

function formatDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}${m}${d}`;
}

export function getActiveServiceIds(db: Database, date: Date): string[] {
	const dateStr = formatDate(date);
	const weekdayColumn = WEEKDAY_COLUMNS[date.getDay()];

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
