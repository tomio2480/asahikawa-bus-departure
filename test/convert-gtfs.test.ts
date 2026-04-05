import { describe, expect, it } from "vitest";
import { parseCsv, validateCoordinate } from "../scripts/convert-gtfs";

describe("parseCsv", () => {
	it("CSV をパースしてレコード配列を返す", () => {
		const csv = "agency_id,agency_name\nA001,テストバス\nA002,別のバス";
		const result = parseCsv(csv);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({ agency_id: "A001", agency_name: "テストバス" });
		expect(result[1]).toEqual({ agency_id: "A002", agency_name: "別のバス" });
	});

	it("BOM 付き CSV を正しくパースする", () => {
		const csv = "\uFEFFstop_id,stop_name\nS001,旭川駅前";
		const result = parseCsv(csv);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ stop_id: "S001", stop_name: "旭川駅前" });
	});

	it("CRLF 改行を処理できる", () => {
		const csv = "stop_id,stop_name\r\nS001,旭川駅前\r\nS002,市役所前\r\n";
		const result = parseCsv(csv);
		expect(result).toHaveLength(2);
	});

	it("末尾の空行を無視する", () => {
		const csv = "stop_id,stop_name\nS001,旭川駅前\n\n";
		const result = parseCsv(csv);
		expect(result).toHaveLength(1);
	});

	it("空の CSV はヘッダーのみでも空配列を返す", () => {
		const csv = "stop_id,stop_name";
		const result = parseCsv(csv);
		expect(result).toHaveLength(0);
	});

	it("クォート付きフィールドを正しくパースする", () => {
		const csv = 'a,b,c\n"hello, world",2,3';
		const result = parseCsv(csv);
		expect(result[0]).toEqual({ a: "hello, world", b: "2", c: "3" });
	});

	it("不正な CSV でエラーを投げる", () => {
		const csv = 'a,b\n"unclosed quote,2';
		expect(() => parseCsv(csv)).toThrow(/CSV parse error/);
	});

	it("事業者ごとに列数が異なる stop_times をパースできる", () => {
		// 旭川電気軌道: 9 列（timepoint あり）
		const csv9 =
			"trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign,pickup_type,drop_off_type,timepoint\nT001,08:00:00,08:00:00,S001,1,,,0,1";
		const result9 = parseCsv(csv9);
		expect(result9[0].trip_id).toBe("T001");
		expect(result9[0].timepoint).toBe("1");

		// 道北バス・ふらのバス: 8 列（timepoint なし）
		const csv8 =
			"trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign,pickup_type,drop_off_type\nT001,08:00:00,08:00:00,S001,1,,,0";
		const result8 = parseCsv(csv8);
		expect(result8[0].trip_id).toBe("T001");
		expect(result8[0].timepoint).toBeUndefined();
	});
});

describe("validateCoordinate", () => {
	it("北海道の有効な座標を受け入れる", () => {
		expect(() => validateCoordinate(43.7631, 142.3582, "S001")).not.toThrow();
	});

	it("範囲外の緯度でエラーを投げる", () => {
		expect(() => validateCoordinate(35.0, 142.0, "S001")).toThrow(
			/Invalid latitude/,
		);
	});

	it("範囲外の経度でエラーを投げる", () => {
		expect(() => validateCoordinate(43.0, 130.0, "S001")).toThrow(
			/Invalid longitude/,
		);
	});

	it("NaN の座標でエラーを投げる", () => {
		expect(() => validateCoordinate(Number.NaN, 142.0, "S001")).toThrow(
			/Invalid coordinate \(NaN\)/,
		);
		expect(() => validateCoordinate(43.0, Number.NaN, "S001")).toThrow(
			/Invalid coordinate \(NaN\)/,
		);
	});
});
