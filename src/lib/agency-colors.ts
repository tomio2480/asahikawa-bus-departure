export type AgencyColorEntry = {
	agencyName: string;
	color: string;
};

const AGENCY_COLORS: ReadonlyMap<string, AgencyColorEntry> = new Map([
	["furano_bus", { agencyName: "ふらのバス", color: "#704795" }],
	["asahikawa_denkikido", { agencyName: "旭川電気軌道", color: "#AF011C" }],
	["dohoku_bus", { agencyName: "道北バス", color: "#96C46B" }],
	["chuo_bus", { agencyName: "中央バス", color: "#D60000" }],
	["engan_bus", { agencyName: "沿岸バス", color: "#02FFFF" }],
]);

/** ネームスペース付き ID からオペレーター ID を抽出する */
export function extractOperatorId(routeId: string): string | null {
	const colonIndex = routeId.indexOf(":");
	return colonIndex >= 0 ? routeId.substring(0, colonIndex) : null;
}

/** 路線 ID から事業者カラー情報を取得する */
export function getAgencyColor(routeId: string): AgencyColorEntry | null {
	const operatorId = extractOperatorId(routeId);
	return operatorId ? (AGENCY_COLORS.get(operatorId) ?? null) : null;
}
