import { describe, expect, it } from "vitest";
import { extractOperatorId, getAgencyColor } from "../src/lib/agency-colors";

describe("extractOperatorId", () => {
	it("コロン区切りの ID からオペレーター接頭辞を返す", () => {
		expect(extractOperatorId("dohoku_bus:R001")).toBe("dohoku_bus");
		expect(extractOperatorId("furano_bus:101")).toBe("furano_bus");
		expect(extractOperatorId("asahikawa_denkikido:X99")).toBe(
			"asahikawa_denkikido",
		);
	});

	it("コロンを含まない ID には null を返す", () => {
		expect(extractOperatorId("R001")).toBeNull();
		expect(extractOperatorId("plain_id")).toBeNull();
		expect(extractOperatorId("")).toBeNull();
	});
});

describe("getAgencyColor", () => {
	it("ふらのバスの色情報を返す", () => {
		expect(getAgencyColor("furano_bus:101")).toEqual({
			agencyName: "ふらのバス",
			color: "#704795",
		});
	});

	it("旭川電気軌道の色情報を返す", () => {
		expect(getAgencyColor("asahikawa_denkikido:X99")).toEqual({
			agencyName: "旭川電気軌道",
			color: "#AF011C",
		});
	});

	it("道北バスの色情報を返す", () => {
		expect(getAgencyColor("dohoku_bus:R001")).toEqual({
			agencyName: "道北バス",
			color: "#96C46B",
		});
	});

	it("中央バスの色情報を返す", () => {
		expect(getAgencyColor("chuo_bus:R001")).toEqual({
			agencyName: "中央バス",
			color: "#D60000",
		});
	});

	it("沿岸バスの色情報を返す", () => {
		expect(getAgencyColor("engan_bus:R001")).toEqual({
			agencyName: "沿岸バス",
			color: "#02FFFF",
		});
	});

	it("未登録のオペレーターには null を返す", () => {
		expect(getAgencyColor("unknown_bus:999")).toBeNull();
	});

	it("コロンを含まない ID には null を返す", () => {
		expect(getAgencyColor("R001")).toBeNull();
	});
});
