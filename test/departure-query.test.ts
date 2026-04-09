import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	calculateBoardingTime,
	calculateLookbackTime,
	getDepartures,
} from "../src/lib/departure-query";
import { createSchema } from "../src/lib/gtfs-loader";

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

	it("負の徒歩時間は 0 として扱う", () => {
		const now = new Date("2026-04-06T08:00:00+09:00");
		expect(calculateBoardingTime(now, -5)).toBe("08:00:00");
	});

	it("小数の徒歩時間は切り捨てる", () => {
		const now = new Date("2026-04-06T08:00:00+09:00");
		expect(calculateBoardingTime(now, 5.9)).toBe("08:05:00");
	});

	it("深夜 0 時を 00 として扱う", () => {
		// 2026-04-06 00:00:00 JST
		const now = new Date("2026-04-06T00:00:00+09:00");
		expect(calculateBoardingTime(now, 0)).toBe("00:00:00");
	});
});

describe("calculateLookbackTime", () => {
	it("通常の減算", () => {
		const now = new Date("2026-04-06T08:10:00+09:00");
		expect(calculateLookbackTime(now, 10)).toBe("08:00:00");
	});

	it("時をまたぐ減算", () => {
		const now = new Date("2026-04-06T09:05:00+09:00");
		expect(calculateLookbackTime(now, 10)).toBe("08:55:00");
	});

	it("0未満はクランプされる", () => {
		const now = new Date("2026-04-06T00:05:00+09:00");
		expect(calculateLookbackTime(now, 10)).toBe("00:00:00");
	});

	it("減算0分は現在時刻", () => {
		const now = new Date("2026-04-06T12:30:00+09:00");
		expect(calculateLookbackTime(now, 0)).toBe("12:30:00");
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
		shapeId?: string,
	) {
		db.run(
			"INSERT INTO trips (trip_id, route_id, service_id, trip_headsign, shape_id) VALUES (?, ?, ?, ?, ?)",
			[tripId, routeId, serviceId, headsign ?? null, shapeId ?? null],
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
				shapeId: null,
				fare: null,
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

		it("shape_id がある便は shapeId を返す", () => {
			// beforeEach の R001/S001/S002 を再利用し、shape_id 付き trip を追加
			insertTrip("T002", "R001", "weekday", "市役所前", "SH001");
			insertStopTime("T002", "S001", 1, "10:00:00", "10:00:00");
			insertStopTime("T002", "S002", 2, "10:15:00", "10:15:00");

			const result = getDepartures(db, ["weekday"], "S001", "S002", "09:00:00");
			expect(result[0].shapeId).toBe("SH001");
		});
	});

	describe("路線名のフォールバック", () => {
		it("route_short_name が空文字列の場合 route_long_name を使う", () => {
			db.run(
				"INSERT INTO routes (route_id, agency_id, route_short_name, route_long_name) VALUES (?, ?, ?, ?)",
				["R001", "A001", "", "長い路線名"],
			);
			insertTrip("T001", "R001", "weekday", "市役所前");
			insertStopTime("T001", "S001", 1, "08:00:00", "08:00:00");
			insertStopTime("T001", "S002", 2, "08:15:00", "08:15:00");

			const result = getDepartures(db, ["weekday"], "S001", "S002", "07:00:00");
			expect(result[0].routeName).toBe("長い路線名");
		});

		it("両方とも空文字列の場合は空文字列を返す", () => {
			db.run(
				"INSERT INTO routes (route_id, agency_id, route_short_name, route_long_name) VALUES (?, ?, ?, ?)",
				["R001", "A001", "", ""],
			);
			insertTrip("T001", "R001", "weekday", "市役所前");
			insertStopTime("T001", "S001", 1, "08:00:00", "08:00:00");
			insertStopTime("T001", "S002", 2, "08:15:00", "08:15:00");

			const result = getDepartures(db, ["weekday"], "S001", "S002", "07:00:00");
			expect(result[0].routeName).toBe("");
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

		it("limit が 0 の場合は空配列を返す", () => {
			const result = getDepartures(
				db,
				["weekday"],
				"S001",
				"S002",
				"07:00:00",
				0,
			);
			expect(result).toHaveLength(0);
		});

		it("limit が負の場合は空配列を返す", () => {
			const result = getDepartures(
				db,
				["weekday"],
				"S001",
				"S002",
				"07:00:00",
				-1,
			);
			expect(result).toHaveLength(0);
		});

		it("limit が小数の場合は切り捨てる", () => {
			const result = getDepartures(
				db,
				["weekday"],
				"S001",
				"S002",
				"07:00:00",
				1.9,
			);
			expect(result).toHaveLength(1);
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

	describe("複数バス停 ID での検索", () => {
		beforeEach(() => {
			// 同名バス停が 2 つ（上り・下りの想定）
			insertRoute("R001", "A001", "1");
			insertRoute("R002", "A001", "2");

			// 便 1: S001A → S002A
			insertTrip("T001", "R001", "weekday", "市役所前");
			insertStopTime("T001", "S001A", 1, "08:00:00", "08:00:00");
			insertStopTime("T001", "S002A", 2, "08:15:00", "08:15:00");

			// 便 2: S001B → S002B（同じ物理バス停の別ポール）
			insertTrip("T002", "R002", "weekday", "市役所前");
			insertStopTime("T002", "S001B", 1, "08:30:00", "08:30:00");
			insertStopTime("T002", "S002B", 2, "08:45:00", "08:45:00");
		});

		it("fromStopIds 配列で複数の乗車バス停を検索できる", () => {
			const result = getDepartures(
				db,
				["weekday"],
				["S001A", "S001B"],
				["S002A", "S002B"],
				"07:00:00",
			);
			expect(result).toHaveLength(2);
			expect(result[0].departureTime).toBe("08:00:00");
			expect(result[1].departureTime).toBe("08:30:00");
		});

		it("単一 stop_id の文字列でも引き続き動作する", () => {
			const result = getDepartures(
				db,
				["weekday"],
				"S001A",
				"S002A",
				"07:00:00",
			);
			expect(result).toHaveLength(1);
			expect(result[0].tripId).toBe("T001");
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
