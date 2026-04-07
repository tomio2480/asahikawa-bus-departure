/** ユーザが登録する経路情報 */
export type RouteEntry = {
	/** 自動採番される主キー */
	id?: number;
	/** 乗車バス停 ID */
	fromStopId: string;
	/** 降車バス停 ID */
	toStopId: string;
	/** 徒歩所要時間（分） */
	walkMinutes: number;
};

/** IndexedDB に保存済みの経路情報（id 必須） */
export type RegisteredRouteEntry = RouteEntry & { id: number };

/** JSON エクスポート形式 */
export type RouteEntryExport = {
	version: 1;
	routes: Omit<RouteEntry, "id">[];
};
