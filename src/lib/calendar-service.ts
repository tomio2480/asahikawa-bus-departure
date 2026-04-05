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

	const calendarResult = db.exec(
		`SELECT service_id FROM calendar
		 WHERE ${weekdayColumn} = 1
		   AND start_date <= ?
		   AND end_date >= ?`,
		[dateStr, dateStr],
	);

	const serviceIds = new Set<string>();
	if (calendarResult.length > 0) {
		for (const row of calendarResult[0].values) {
			serviceIds.add(row[0] as string);
		}
	}

	const addResult = db.exec(
		"SELECT service_id FROM calendar_dates WHERE date = ? AND exception_type = 1",
		[dateStr],
	);
	if (addResult.length > 0) {
		for (const row of addResult[0].values) {
			serviceIds.add(row[0] as string);
		}
	}

	const removeResult = db.exec(
		"SELECT service_id FROM calendar_dates WHERE date = ? AND exception_type = 2",
		[dateStr],
	);
	if (removeResult.length > 0) {
		for (const row of removeResult[0].values) {
			serviceIds.delete(row[0] as string);
		}
	}

	return [...serviceIds];
}
