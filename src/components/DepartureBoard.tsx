import { useEffect, useMemo, useState } from "react";
import type { DepartureGroup } from "../hooks/useDepartures";
import { getAgencyColor } from "../lib/agency-colors";

type DepartureBoardProps = {
	/** 降車バス停ごとの発車案内グループ */
	groups: DepartureGroup[];
	/** 最終更新時刻 */
	lastUpdated: Date | null;
	/** データ取得時のエラー */
	error: Error | null;
	/** 経路が登録されているかどうか */
	hasRoutes: boolean;
	/** ホバーまたは固定中の経路キー */
	hoveredRouteKey?: string | null;
	/** 経路ホバー時に呼ばれるコールバック（null でホバー解除） */
	onRouteHover?: (key: string | null) => void;
	/** 固定中の経路キー */
	pinnedRouteKey?: string | null;
	/** 経路クリック時のトグルコールバック */
	onRoutePinToggle?: (key: string) => void;
	/** 選択中の行先 ID の集合（空集合で全行先） */
	selectedDestinations?: Set<string>;
	/** 行先タグクリック時のトグルコールバック */
	onDestinationToggle?: (destinationId: string) => void;
	/** 通知が有効な経路が 1 件以上あるかどうか */
	hasNotifyEnabledRoutes?: boolean;
	/** 通知する出発目安の何分前（undefined のとき通知設定 UI を非表示） */
	notifyBeforeMinutes?: number;
	/** 通知タイミング変更コールバック */
	onNotifyBeforeMinutesChange?: (minutes: number) => void;
	/** 現在の Notification パーミッション */
	notifyPermission?: NotificationPermission | "unsupported";
	/** パーミッション要求コールバック */
	onRequestNotificationPermission?: () => Promise<NotificationPermission>;
};

/** HH:MM:SS または H:MM:SS 形式の時刻を HH:MM に短縮する */
function formatTime(time: string): string {
	return time.split(":").slice(0, 2).join(":");
}

/** 運賃を表示用にフォーマットする */
function formatFare(price: number, currencyType: string): string {
	if (currencyType === "JPY") {
		return `${price}円`;
	}
	return `${price} ${currencyType}`;
}

const updatedTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
	timeZone: "Asia/Tokyo",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

/** Date を HH:MM 形式（JST）にフォーマットする */
function formatUpdatedTime(date: Date): string {
	return updatedTimeFormatter.format(date);
}

/** スクロール領域の最大高さ（Tailwind の max-h-60 = 15rem 相当） */
const SCROLL_MAX_HEIGHT_CLASS = "max-h-60";

/** selectedDestinations のデフォルト値（参照安定性のためモジュールスコープで保持） */
const EMPTY_DESTINATIONS = new Set<string>();

/** ソート可能なカラム */
type SortKey = "leaveByTime" | "departureTime" | "arrivalTime";

/** ソート方向 */
type SortDirection = "asc" | "desc";

/** 発車案内を降車バス停ごとにグルーピングして表示するコンポーネント */
export function DepartureBoard({
	groups,
	lastUpdated,
	error,
	hasRoutes,
	hoveredRouteKey,
	onRouteHover,
	pinnedRouteKey,
	onRoutePinToggle,
	selectedDestinations = EMPTY_DESTINATIONS,
	onDestinationToggle,
	hasNotifyEnabledRoutes,
	notifyBeforeMinutes,
	onNotifyBeforeMinutesChange,
	notifyPermission,
	onRequestNotificationPermission,
}: DepartureBoardProps) {

	// 行先の選択肢（ドロップダウン用。フィルタ中も全選択肢を表示する）
	const destinations = useMemo(
		() =>
			new Map(
				groups.map(
					(group) => [group.toStopId, group.toStopName] as const,
				),
			),
		[groups],
	);

	// 選択中の行先でグループを絞り込む
	const visibleGroups = useMemo(
		() =>
			selectedDestinations.size === 0
				? groups
				: groups.filter((g) => selectedDestinations.has(g.toStopId)),
		[groups, selectedDestinations],
	);

	const [sortKey, setSortKey] = useState<SortKey>("departureTime");
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

	// 通知分前入力のローカル表示値（一時クリアを許容するため string で管理）
	const [notifyInputValue, setNotifyInputValue] = useState(
		() => (notifyBeforeMinutes !== undefined ? String(notifyBeforeMinutes) : ""),
	);
	// 外部から prop が変更された場合（localStorage 初期読込等）に同期する
	useEffect(() => {
		if (notifyBeforeMinutes !== undefined) {
			setNotifyInputValue(String(notifyBeforeMinutes));
		}
	}, [notifyBeforeMinutes]);

	const handleSortToggle = (key: SortKey) => {
		if (sortKey === key) {
			setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDirection("asc");
		}
	};

	// 表示対象の便を統合（ソートとは独立してメモ化）
	const flattenedDepartures = useMemo(
		() =>
			visibleGroups.flatMap((group) =>
				group.departures.map((dep) => ({
					...dep,
					toStopName: group.toStopName,
					isNextDay: group.isNextDay,
				})),
			),
		[visibleGroups],
	);

	// ソート適用（翌日便は常に当日便の後に配置）
	const allDepartures = useMemo(() => {
		const dir = sortDirection === "asc" ? 1 : -1;
		return [...flattenedDepartures].sort((a, b) => {
			const aNext = a.isNextDay ? 1 : 0;
			const bNext = b.isNextDay ? 1 : 0;
			if (aNext !== bNext) return aNext - bNext;
			const aVal = (a[sortKey] as string | undefined) ?? "";
			const bVal = (b[sortKey] as string | undefined) ?? "";
			return dir * aVal.localeCompare(bVal);
		});
	}, [flattenedDepartures, sortKey, sortDirection]);

	if (!hasRoutes) {
		return (
			<div className="card bg-base-100 shadow-sm">
				<div className="card-body">
					<p className="text-base-content/60">
						経路が登録されていません。経路を登録すると発車案内が表示されます。
					</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="card bg-base-100 shadow-sm">
				<div className="card-body">
					<div className="text-error" role="alert">
						発車案内の取得に失敗しました: {error.message}
					</div>
				</div>
			</div>
		);
	}

	const allNextDay =
		visibleGroups.length > 0 && visibleGroups.every((g) => g.isNextDay);

	const sortableHeader = (key: SortKey, label: string) => (
		<th
			className={`cursor-pointer select-none ${sortKey === key ? "bg-base-300" : ""}`}
			tabIndex={0}
			aria-sort={
				sortKey === key
					? sortDirection === "asc"
						? "ascending"
						: "descending"
					: "none"
			}
			onClick={() => handleSortToggle(key)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleSortToggle(key);
				}
			}}
		>
			{label}
			{sortKey === key && (sortDirection === "asc" ? " ▲" : " ▼")}
		</th>
	);

	return (
		<div className="space-y-4">
			{lastUpdated && (
				<div className="text-sm text-base-content/60">
					最終更新: {formatUpdatedTime(lastUpdated)}
				</div>
			)}

			<div className="text-sm text-base-content/60">
				{
					"※ IC カード「Asaca」利用時、同一停留所から 1 時間以内の乗り継ぎで 100円引き（小児 50円引き）"
				}
			</div>

			{(visibleGroups.length === 0 || allNextDay) && (
				<div className="card bg-base-100 shadow-sm">
					<div className="card-body">
						<p className="text-base-content/60">現在の発車予定はありません</p>
					</div>
				</div>
			)}

			{groups.length > 0 && (
				<div className="card bg-base-100 shadow-sm">
					<div className="card-body">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex flex-wrap items-center gap-3">
								<h3 className="card-title text-lg">発車案内</h3>
								{allNextDay && (
									<span className="badge badge-outline badge-sm">
										始発以降の便
									</span>
								)}
								{destinations.size > 1 && (
									<div
										className="flex flex-wrap gap-1"
										role="group"
										aria-label="行き先で絞り込む"
									>
										{[...destinations.entries()].map(([stopId, name]) => {
											const isActive =
												selectedDestinations.has(stopId);
											return (
												<button
													key={stopId}
													type="button"
													aria-pressed={isActive}
													className={`badge cursor-pointer hover:opacity-80 transition-opacity ${isActive ? "badge-primary" : "badge-outline"}`}
													onClick={() =>
														onDestinationToggle?.(stopId)
													}
												>
													{name || stopId}
												</button>
											);
										})}
									</div>
								)}
							</div>
							{hasNotifyEnabledRoutes && notifyBeforeMinutes !== undefined && (
								<div className="flex items-center gap-1.5 text-sm shrink-0 ml-auto">
									<label
										htmlFor="notify-before-minutes"
										className="text-base-content/70 cursor-pointer"
									>
										通知
									</label>
									<input
										id="notify-before-minutes"
										type="number"
										className="input input-bordered input-xs w-14"
										min="1"
										max="60"
										step="1"
										value={notifyInputValue}
										onChange={(e) => {
											setNotifyInputValue(e.target.value);
											const v = Number(e.target.value);
											// UI 属性 min="1" max="60" step="1" と意図を揃える
											if (Number.isInteger(v) && v >= 1 && v <= 60) {
												onNotifyBeforeMinutesChange?.(v);
											}
										}}
										onBlur={() => {
											// フォーカスを外したとき、不正な入力値を最終有効値に戻す
											if (notifyBeforeMinutes !== undefined) {
												setNotifyInputValue(String(notifyBeforeMinutes));
											}
										}}
									/>
									<span className="text-base-content/70">分前</span>
									{notifyPermission === "default" && (
										<button
											type="button"
											className="btn btn-xs btn-outline"
											onClick={onRequestNotificationPermission}
										>
											通知を許可
										</button>
									)}
									{notifyPermission === "denied" && (
										<span className="text-error text-xs">通知が拒否されています</span>
									)}
								</div>
							)}
						</div>
						<div
							className={`overflow-x-auto overflow-y-auto ${SCROLL_MAX_HEIGHT_CLASS}`}
						>
							<table className="table table-sm">
								<thead className="sticky top-0 z-10 bg-base-100">
									<tr>
										{sortableHeader("leaveByTime", "出発目安")}
										<th>乗車</th>
										{sortableHeader("departureTime", "発車")}
										{sortableHeader("arrivalTime", "到着")}
										<th>運賃</th>
										<th>路線</th>
										<th>行き先</th>
									</tr>
								</thead>
								<tbody>
									{allDepartures.map((dep) => {
										const routeKey = `${dep.routeId}-${dep.fromStopId}-${dep.toStopId}`;
										const isHovered = hoveredRouteKey === routeKey;
										const isPinned = pinnedRouteKey === routeKey;
										const agencyColor = getAgencyColor(dep.routeId);
										return (
											<tr
												key={`${dep.tripId}-${dep.departureTime}`}
												className={`${isPinned ? "bg-info/20" : isHovered ? "bg-info/10" : ""} ${dep.isDeparted ? "opacity-50" : ""} cursor-pointer`}
												tabIndex={0}
												onMouseEnter={() => onRouteHover?.(routeKey)}
												onMouseLeave={() => onRouteHover?.(null)}
												onFocus={() => onRouteHover?.(routeKey)}
												onBlur={() => onRouteHover?.(null)}
												onClick={() => onRoutePinToggle?.(routeKey)}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														onRoutePinToggle?.(routeKey);
													}
												}}
											>
												<td className={`font-mono ${sortKey === "leaveByTime" ? "bg-base-300/50" : ""}`}>
													{dep.leaveByTime ? formatTime(dep.leaveByTime) : "-"}
													{dep.isDeparted && (
														<span className="ml-1 badge badge-sm badge-ghost">
															出発済
														</span>
													)}
													{dep.isNextDay && !dep.isDeparted && (
														<span className="ml-1 badge badge-sm badge-outline">
															始発以降
														</span>
													)}
												</td>
												<td>{dep.fromStopName ?? "-"}</td>
												<td className={`font-mono ${sortKey === "departureTime" ? "bg-base-300/50" : ""}`}>
													{formatTime(dep.departureTime)}
												</td>
												<td className={`font-mono ${sortKey === "arrivalTime" ? "bg-base-300/50" : ""}`}>
													{formatTime(dep.arrivalTime)}
												</td>
												<td>
													{dep.fare
														? formatFare(dep.fare.price, dep.fare.currencyType)
														: "-"}
												</td>
												<td>
													<span className="inline-flex items-center gap-1">
														{agencyColor && (
															<span
																className="inline-block w-3 h-3 rounded-full flex-shrink-0"
																style={{
																	backgroundColor: agencyColor.color,
																}}
																title={agencyColor.agencyName}
																aria-label={agencyColor.agencyName}
																role="img"
															/>
														)}
														{dep.routeName}
													</span>
												</td>
												<td>{dep.headsign}</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
