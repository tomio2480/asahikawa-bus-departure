import { describe, expect, it } from "vitest";
import { NEARBY_THRESHOLD_METERS, distanceMeters } from "../src/lib/geo-utils";

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
