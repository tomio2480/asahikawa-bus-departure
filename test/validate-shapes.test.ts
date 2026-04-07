import { describe, expect, it } from "vitest";
import { validateShapesCsv } from "../scripts/validate-shapes";

describe("validateShapesCsv", () => {
	it("正常な shapes.txt を受け入れる", () => {
		const csv = [
			"shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
			"S001,43.770,142.365,1",
			"S001,43.771,142.366,2",
		].join("\n");
		expect(() => validateShapesCsv(csv)).not.toThrow();
	});

	it("空の CSV でエラーを返す", () => {
		expect(() => validateShapesCsv("")).toThrow("shapes.txt is empty");
	});

	it("ヘッダのみでデータ行がない場合にエラーを返す", () => {
		const csv = "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n";
		expect(() => validateShapesCsv(csv)).toThrow("no data rows");
	});

	it("必須カラムが欠けている場合にエラーを返す", () => {
		const csv = [
			"shape_id,shape_pt_lat,shape_pt_lon",
			"S001,43.770,142.365",
		].join("\n");
		expect(() => validateShapesCsv(csv)).toThrow("shape_pt_sequence");
	});

	it("緯度が数値でない場合にエラーを返す", () => {
		const csv = [
			"shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
			"S001,abc,142.365,1",
		].join("\n");
		expect(() => validateShapesCsv(csv)).toThrow("Invalid latitude");
	});

	it("経度が数値でない場合にエラーを返す", () => {
		const csv = [
			"shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
			"S001,43.770,xyz,1",
		].join("\n");
		expect(() => validateShapesCsv(csv)).toThrow("Invalid longitude");
	});

	it("緯度が北海道の範囲外の場合にエラーを返す", () => {
		const csv = [
			"shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
			"S001,40.0,142.365,1",
		].join("\n");
		expect(() => validateShapesCsv(csv)).toThrow("latitude 40 out of range");
	});

	it("経度が北海道の範囲外の場合にエラーを返す", () => {
		const csv = [
			"shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
			"S001,43.770,130.0,1",
		].join("\n");
		expect(() => validateShapesCsv(csv)).toThrow("longitude 130 out of range");
	});

	it("shape_pt_sequence が正の整数でない場合にエラーを返す", () => {
		const csv = [
			"shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
			"S001,43.770,142.365,-1",
		].join("\n");
		expect(() => validateShapesCsv(csv)).toThrow("Invalid shape_pt_sequence");
	});

	it("shape_pt_sequence が空の場合にエラーを返す", () => {
		const csv = [
			"shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
			"S001,43.770,142.365,",
		].join("\n");
		expect(() => validateShapesCsv(csv)).toThrow("Invalid shape_pt_sequence");
	});

	it("shape_id が空の場合にエラーを返す", () => {
		const csv = [
			"shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
			",43.770,142.365,1",
		].join("\n");
		expect(() => validateShapesCsv(csv)).toThrow("Missing shape_id");
	});
});
