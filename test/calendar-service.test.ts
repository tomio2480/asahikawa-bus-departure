import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getActiveServiceIds } from "../src/lib/calendar-service";
import { createSchema } from "../src/lib/gtfs-loader";

describe("getActiveServiceIds", () => {
	let db: Database;

	beforeEach(async () => {
		const SQL = await initSqlJs();
		db = new SQL.Database();
		createSchema(db);
	});

	afterEach(() => {
		db.close();
	});

	function insertCalendar(
		serviceId: string,
		days: [number, number, number, number, number, number, number],
		startDate: string,
		endDate: string,
	) {
		db.run(
			"INSERT INTO calendar (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			[serviceId, ...days, startDate, endDate],
		);
	}

	function insertCalendarDate(
		serviceId: string,
		date: string,
		exceptionType: number,
	) {
		db.run(
			"INSERT INTO calendar_dates (service_id, date, exception_type) VALUES (?, ?, ?)",
			[serviceId, date, exceptionType],
		);
	}

	describe("曜日ベース判定", () => {
		beforeEach(() => {
			// 平日ダイヤ: 月〜金
			insertCalendar("weekday", [1, 1, 1, 1, 1, 0, 0], "20260401", "20270331");
			// 土曜ダイヤ
			insertCalendar("saturday", [0, 0, 0, 0, 0, 1, 0], "20260401", "20270331");
			// 日曜ダイヤ
			insertCalendar("sunday", [0, 0, 0, 0, 0, 0, 1], "20260401", "20270331");
		});

		it("平日に平日ダイヤが返される", () => {
			// 2026-04-06 は月曜
			const result = getActiveServiceIds(db, new Date(2026, 3, 6));
			expect(result).toEqual(["weekday"]);
		});

		it("土曜に土曜ダイヤが返される", () => {
			// 2026-04-11 は土曜
			const result = getActiveServiceIds(db, new Date(2026, 3, 11));
			expect(result).toEqual(["saturday"]);
		});

		it("日曜に日曜ダイヤが返される", () => {
			// 2026-04-12 は日曜
			const result = getActiveServiceIds(db, new Date(2026, 3, 12));
			expect(result).toEqual(["sunday"]);
		});
	});

	describe("有効期間の判定", () => {
		it("start_date 前は空配列が返される", () => {
			insertCalendar("weekday", [1, 1, 1, 1, 1, 0, 0], "20260401", "20270331");
			// 2026-03-31 は火曜だが有効期間外
			const result = getActiveServiceIds(db, new Date(2026, 2, 31));
			expect(result).toEqual([]);
		});

		it("end_date 後は空配列が返される", () => {
			insertCalendar("weekday", [1, 1, 1, 1, 1, 0, 0], "20260401", "20270331");
			// 2027-04-01 は木曜だが有効期間外
			const result = getActiveServiceIds(db, new Date(2027, 3, 1));
			expect(result).toEqual([]);
		});
	});

	describe("calendar_dates による例外処理", () => {
		beforeEach(() => {
			insertCalendar("weekday", [1, 1, 1, 1, 1, 0, 0], "20260401", "20270331");
			insertCalendar("holiday", [0, 0, 0, 0, 0, 0, 1], "20260401", "20270331");
		});

		it("exception_type=2 で平日ダイヤが除外される（祝日）", () => {
			// 2026-05-05 は火曜（こどもの日）
			insertCalendarDate("weekday", "20260505", 2);
			const result = getActiveServiceIds(db, new Date(2026, 4, 5));
			expect(result).not.toContain("weekday");
		});

		it("exception_type=1 で祝日ダイヤが追加される", () => {
			// 2026-05-05 は火曜（こどもの日）に祝日ダイヤを追加
			insertCalendarDate("weekday", "20260505", 2);
			insertCalendarDate("holiday", "20260505", 1);
			const result = getActiveServiceIds(db, new Date(2026, 4, 5));
			expect(result).toEqual(["holiday"]);
		});
	});

	describe("旭川電気軌道パターン（平日/土日 2 パターン）", () => {
		beforeEach(() => {
			insertCalendar(
				"denkikido:weekday",
				[1, 1, 1, 1, 1, 0, 0],
				"20260401",
				"20270331",
			);
			// 土日を同一ダイヤで運行
			insertCalendar(
				"denkikido:weekend",
				[0, 0, 0, 0, 0, 1, 1],
				"20260401",
				"20270331",
			);
		});

		it("土曜に weekend ダイヤが返される", () => {
			const result = getActiveServiceIds(db, new Date(2026, 3, 11));
			expect(result).toEqual(["denkikido:weekend"]);
		});

		it("日曜に weekend ダイヤが返される", () => {
			const result = getActiveServiceIds(db, new Date(2026, 3, 12));
			expect(result).toEqual(["denkikido:weekend"]);
		});
	});

	describe("道北バス・ふらのバスパターン（平日/土曜/日曜 3 パターン）", () => {
		beforeEach(() => {
			insertCalendar(
				"dohoku:weekday",
				[1, 1, 1, 1, 1, 0, 0],
				"20260401",
				"20270331",
			);
			insertCalendar(
				"dohoku:saturday",
				[0, 0, 0, 0, 0, 1, 0],
				"20260401",
				"20270331",
			);
			insertCalendar(
				"dohoku:sunday",
				[0, 0, 0, 0, 0, 0, 1],
				"20260401",
				"20270331",
			);
		});

		it("平日に weekday ダイヤのみ返される", () => {
			const result = getActiveServiceIds(db, new Date(2026, 3, 6));
			expect(result).toEqual(["dohoku:weekday"]);
		});

		it("土曜に saturday ダイヤのみ返される", () => {
			const result = getActiveServiceIds(db, new Date(2026, 3, 11));
			expect(result).toEqual(["dohoku:saturday"]);
		});

		it("日曜に sunday ダイヤのみ返される", () => {
			const result = getActiveServiceIds(db, new Date(2026, 3, 12));
			expect(result).toEqual(["dohoku:sunday"]);
		});
	});

	describe("複数事業者の統合", () => {
		it("複数事業者の service_id が同時に返される", () => {
			insertCalendar(
				"denkikido:weekday",
				[1, 1, 1, 1, 1, 0, 0],
				"20260401",
				"20270331",
			);
			insertCalendar(
				"dohoku:weekday",
				[1, 1, 1, 1, 1, 0, 0],
				"20260401",
				"20270331",
			);
			insertCalendar(
				"furano:weekday",
				[1, 1, 1, 1, 1, 0, 0],
				"20260401",
				"20270331",
			);

			const result = getActiveServiceIds(db, new Date(2026, 3, 6));
			expect(result).toHaveLength(3);
			expect(result).toContain("denkikido:weekday");
			expect(result).toContain("dohoku:weekday");
			expect(result).toContain("furano:weekday");
		});
	});
});
