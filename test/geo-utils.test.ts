import { describe, expect, it } from "vitest";
import {
	NEARBY_THRESHOLD_METERS,
	distanceMeters,
	findClosestPointIndex,
} from "../src/lib/geo-utils";

describe("distanceMeters", () => {
	it("同一地点の距離は 0", () => {
		expect(distanceMeters(43.77, 142.37, 43.77, 142.37)).toBe(0);
	});

	it("旭川駅付近で南北約 111m の距離を正しく計算する", () => {
		// 緯度 0.001 度 ≈ 111.32m
		const d = distanceMeters(43.77, 142.37, 43.771, 142.37);
		expect(d).toBeGreaterThan(100);
		expect(d).toBeLessThan(120);
	});

	it("旭川駅付近で東西約 80m の距離を正しく計算する", () => {
		// 経度 0.001 度 × cos(43.77°) ≈ 80m
		const d = distanceMeters(43.77, 142.37, 43.77, 142.371);
		expect(d).toBeGreaterThan(70);
		expect(d).toBeLessThan(90);
	});

	it("上り・下りバス停（約 50m）を近距離と判定できる", () => {
		// 道路を挟んだ上り・下りは通常 50m 以内
		const d = distanceMeters(43.7631, 142.3582, 43.7635, 142.3582);
		expect(d).toBeLessThan(NEARBY_THRESHOLD_METERS);
	});

	it("遠距離のバス停（数 km 以上）を正しく判定できる", () => {
		// 旭川駅付近とふらの付近（約 60km）
		const d = distanceMeters(43.7631, 142.3582, 43.34, 142.38);
		expect(d).toBeGreaterThan(40_000);
	});

	it("NEARBY_THRESHOLD_METERS は 500 である", () => {
		expect(NEARBY_THRESHOLD_METERS).toBe(500);
	});
});

describe("findClosestPointIndex", () => {
	const points = [
		{ lat: 43.77, lon: 142.36 },
		{ lat: 43.775, lon: 142.365 },
		{ lat: 43.78, lon: 142.37 },
	];

	it("完全一致する座標のインデックスを返す", () => {
		expect(findClosestPointIndex(points, 43.775, 142.365)).toBe(1);
	});

	it("先頭に最も近い場合は 0 を返す", () => {
		expect(findClosestPointIndex(points, 43.77, 142.36)).toBe(0);
	});

	it("末尾に最も近い場合は最後のインデックスを返す", () => {
		expect(findClosestPointIndex(points, 43.78, 142.37)).toBe(2);
	});

	it("中間点に最も近いインデックスを返す", () => {
		// 43.776 は points[1](43.775) に最も近い
		expect(findClosestPointIndex(points, 43.776, 142.365)).toBe(1);
	});

	it("空配列の場合は -1 を返す", () => {
		expect(findClosestPointIndex([], 43.77, 142.36)).toBe(-1);
	});
});
