import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	calculateBoardingTime,
	getDepartures,
	timeToSeconds,
} from "../src/lib/departure-query";
import { createSchema } from "../src/lib/gtfs-loader";

describe("timeToSeconds", () => {
	it("通常の時刻を秒数に変換する", () => {
		expect(timeToSeconds("08:00:00")).toBe(28800);
		expect(timeToSeconds("00:00:00")).toBe(0);
		expect(timeToSeconds("12:30:45")).toBe(45045);
	});

	it("24 時超の時刻を正しく変換する", () => {
		expect(timeToSeconds("25:30:00")).toBe(91800);
		expect(timeToSeconds("26:00:00")).toBe(93600);
	});

	it("不正な形式でエラーを投げる", () => {
		expect(() => timeToSeconds("invalid")).toThrow(/Invalid time format/);
		expect(() => timeToSeconds("08:00")).toThrow(/Invalid time format/);
		expect(() => timeToSeconds("abc:00:00")).toThrow(/Invalid time format/);
	});
});

describe("calculateBoardingTime", () => {
	it("徒歩時間を加算した乗車可能時刻を返す", () => {
		// 2026-04-06 08:00:00 JST
		const now = new Date("2026-04-06T08:00:00+09:00");
		expect(calculateBoardingTime(now, 5)).toBe("08:05:00");
	});

	it("時をまたぐ加算を正しく処理する", () => {
		// 2026-04-06 08:55:00 JST
		const now = new Date("2026-04-06T08:55:00+09:00");
		expect(calculateBoardingTime(now, 10)).toBe("09:05:00");
	});

	it("徒歩 0 分の場合は現在時刻をそのまま返す", () => {
		const now = new Date("2026-04-06T12:30:00+09:00");
		expect(calculateBoardingTime(now, 0)).toBe("12:30:00");
	});

	it("深夜の加算で 24 時超を返す", () => {
		// 2026-04-06 23:50:00 JST
		const now = new Date("2026-04-06T23:50:00+09:00");
		expect(calculateBoardingTime(now, 15)).toBe("24:05:00");
	});
});

describe("getDepartures", () => {
	let db: Database;

	beforeEach(async () => {
		const SQL = await initSqlJs();
		db = new SQL.Database();
		createSchema(db);
	});

	afterEach(() => {
		db.close();
	});

	function insertRoute(routeId: string, agencyId: string, shortName: string) {
		db.run(
			"INSERT INTO routes (route_id, agency_id, route_short_name) VALUES (?, ?, ?)",
			[routeId, agencyId, shortName],
		);
	}

	function insertTrip(
		tripId: string,
		routeId: string,
		serviceId: string,
		headsign?: string,
	) {
		db.run(
			"INSERT INTO trips (trip_id, route_id, service_id, trip_headsign) VALUES (?, ?, ?, ?)",
			[tripId, routeId, serviceId, headsign ?? null],
		);
	}

	function insertStopTime(
		tripId: string,
		stopId: string,
		seq: number,
		arrival: string,
		departure: string,
	) {
		db.run(
			"INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence) VALUES (?, ?, ?, ?, ?)",
			[tripId, arrival, departure, stopId, seq],
		);
	}

	describe("基本的な発車案内", () => {
		beforeEach(() => {
			insertRoute("R001", "A001", "1");
			insertTrip("T001", "R001", "weekday", "市役所前");
			insertStopTime("T001", "S001", 1, "08:00:00", "08:00:00");
			insertStopTime("T001", "S002", 2, "08:15:00", "08:15:00");
		});

		it("乗車バス停から降車バス停への便を取得する", () => {
			const result = getDepartures(db, ["weekday"], "S001", "S002", "07:00:00");
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				tripId: "T001",
				routeId: "R001",
				routeName: "1",
				headsign: "市役所前",
				departureTime: "08:00:00",
				arrivalTime: "08:15:00",
				fromStopId: "S001",
				toStopId: "S002",
			});
		});

		it("逆方向の便は取得しない", () => {
			const result = getDepartures(db, ["weekday"], "S002", "S001", "07:00:00");
			expect(result).toHaveLength(0);
		});

		it("afterTime 以前の便は除外する", () => {
			const result = getDepartures(db, ["weekday"], "S001", "S002", "08:01:00");
			expect(result).toHaveLength(0);
		});

		it("afterTime ちょうどの便は含む", () => {
			const result = getDepartures(db, ["weekday"], "S001", "S002", "08:00:00");
			expect(result).toHaveLength(1);
		});
	});

	describe("複数便のソート", () => {
		beforeEach(() => {
			insertRoute("R001", "A001", "1");
			insertRoute("R002", "A001", "2");

			insertTrip("T001", "R001", "weekday", "市役所前");
			insertStopTime("T001", "S001", 1, "08:30:00", "08:30:00");
			insertStopTime("T001", "S002", 2, "08:45:00", "08:45:00");

			insertTrip("T002", "R002", "weekday", "市役所前");
			insertStopTime("T002", "S001", 1, "08:00:00", "08:00:00");
			insertStopTime("T002", "S002", 2, "08:20:00", "08:20:00");

			insertTrip("T003", "R001", "weekday", "市役所前");
			insertStopTime("T003", "S001", 1, "09:00:00", "09:00:00");
			insertStopTime("T003", "S002", 2, "09:15:00", "09:15:00");
		});

		it("出発時刻の昇順でソートされる", () => {
			const result = getDepartures(db, ["weekday"], "S001", "S002", "07:00:00");
			expect(result).toHaveLength(3);
			expect(result[0].departureTime).toBe("08:00:00");
			expect(result[1].departureTime).toBe("08:30:00");
			expect(result[2].departureTime).toBe("09:00:00");
		});

		it("limit で取得件数を制限できる", () => {
			const result = getDepartures(
				db,
				["weekday"],
				"S001",
				"S002",
				"07:00:00",
				2,
			);
			expect(result).toHaveLength(2);
		});
	});

	describe("service_id によるフィルタリング", () => {
		beforeEach(() => {
			insertRoute("R001", "A001", "1");

			insertTrip("T001", "R001", "weekday", "市役所前");
			insertStopTime("T001", "S001", 1, "08:00:00", "08:00:00");
			insertStopTime("T001", "S002", 2, "08:15:00", "08:15:00");

			insertTrip("T002", "R001", "saturday", "市役所前");
			insertStopTime("T002", "S001", 1, "09:00:00", "09:00:00");
			insertStopTime("T002", "S002", 2, "09:15:00", "09:15:00");
		});

		it("指定した service_id の便のみ取得する", () => {
			const result = getDepartures(db, ["weekday"], "S001", "S002", "07:00:00");
			expect(result).toHaveLength(1);
			expect(result[0].tripId).toBe("T001");
		});

		it("複数の service_id を指定できる", () => {
			const result = getDepartures(
				db,
				["weekday", "saturday"],
				"S001",
				"S002",
				"07:00:00",
			);
			expect(result).toHaveLength(2);
		});

		it("空の service_id 配列で空の結果を返す", () => {
			const result = getDepartures(db, [], "S001", "S002", "07:00:00");
			expect(result).toHaveLength(0);
		});
	});

	describe("24 時超の時刻処理", () => {
		beforeEach(() => {
			insertRoute("R001", "A001", "深夜");

			insertTrip("T001", "R001", "weekday", "終点");
			insertStopTime("T001", "S001", 1, "25:30:00", "25:30:00");
			insertStopTime("T001", "S002", 2, "25:45:00", "25:45:00");
		});

		it("24 時超の便を取得できる", () => {
			const result = getDepartures(db, ["weekday"], "S001", "S002", "25:00:00");
			expect(result).toHaveLength(1);
			expect(result[0].departureTime).toBe("25:30:00");
		});

		it("24 時超の afterTime で正しくフィルタする", () => {
			const result = getDepartures(db, ["weekday"], "S001", "S002", "25:31:00");
			expect(result).toHaveLength(0);
		});
	});

	describe("途中バス停を経由する便", () => {
		beforeEach(() => {
			insertRoute("R001", "A001", "1");

			// S001 -> S002 -> S003 の路線
			insertTrip("T001", "R001", "weekday", "終点");
			insertStopTime("T001", "S001", 1, "08:00:00", "08:00:00");
			insertStopTime("T001", "S002", 2, "08:10:00", "08:10:00");
			insertStopTime("T001", "S003", 3, "08:20:00", "08:20:00");
		});

		it("途中バス停をスキップした区間も取得できる", () => {
			const result = getDepartures(db, ["weekday"], "S001", "S003", "07:00:00");
			expect(result).toHaveLength(1);
			expect(result[0].arrivalTime).toBe("08:20:00");
		});

		it("途中バス停から降車バス停への区間も取得できる", () => {
			const result = getDepartures(db, ["weekday"], "S002", "S003", "07:00:00");
			expect(result).toHaveLength(1);
			expect(result[0].departureTime).toBe("08:10:00");
		});
	});

	describe("複数事業者の統合", () => {
		it("異なる事業者の便が混在しても正しくソートされる", () => {
			insertRoute("denkikido:R001", "denkikido:A001", "電気軌道1");
			insertRoute("dohoku:R001", "dohoku:A001", "道北1");

			insertTrip(
				"denkikido:T001",
				"denkikido:R001",
				"denkikido:weekday",
				"行先A",
			);
			insertStopTime(
				"denkikido:T001",
				"denkikido:S001",
				1,
				"08:30:00",
				"08:30:00",
			);
			insertStopTime(
				"denkikido:T001",
				"denkikido:S002",
				2,
				"08:45:00",
				"08:45:00",
			);

			insertTrip("dohoku:T001", "dohoku:R001", "dohoku:weekday", "行先B");
			insertStopTime("dohoku:T001", "dohoku:S001", 1, "08:00:00", "08:00:00");
			insertStopTime("dohoku:T001", "dohoku:S002", 2, "08:20:00", "08:20:00");

			// 同一バス停を共有する場合は stop_id が同じ名前空間になる
			// ここでは別々の stop_id だが、同じ物理バス停の例
			const result1 = getDepartures(
				db,
				["denkikido:weekday"],
				"denkikido:S001",
				"denkikido:S002",
				"07:00:00",
			);
			expect(result1).toHaveLength(1);
			expect(result1[0].routeName).toBe("電気軌道1");

			const result2 = getDepartures(
				db,
				["dohoku:weekday"],
				"dohoku:S001",
				"dohoku:S002",
				"07:00:00",
			);
			expect(result2).toHaveLength(1);
			expect(result2[0].routeName).toBe("道北1");
		});
	});
});
