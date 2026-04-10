import { useMemo, useState } from "react";
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
	/** 地図上でホバー中の経路キー（fromStopId-toStopId） */
	hoveredRouteKey?: string | null;
	/** 経路ホバー時に呼ばれるコールバック（null でホバー解除） */
	onRouteHover?: (key: string | null) => void;
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

/** 発車案内を降車バス停ごとにグルーピングして表示するコンポーネント */
export function DepartureBoard({
	groups,
	lastUpdated,
	error,
	hasRoutes,
	hoveredRouteKey,
	onRouteHover,
}: DepartureBoardProps) {
	const [selectedDestination, setSelectedDestination] = useState<string>("all");

	// 全グループの便を統合し、発車時刻順にソート
	const allDepartures = useMemo(() => {
		return groups
			.flatMap((group) =>
				group.departures.map((dep) => ({
					...dep,
					toStopName: group.toStopName,
					isNextDay: group.isNextDay,
				})),
			)
			.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
	}, [groups]);

	// 行先の選択肢
	const destinations = useMemo(() => {
		const seen = new Map<string, string>();
		for (const group of groups) {
			if (!seen.has(group.toStopId)) {
				seen.set(group.toStopId, group.toStopName);
			}
		}
		return seen;
	}, [groups]);

	// groups 更新後に選択中の行先が消えた場合は "all" にフォールバック
	const effectiveSelectedDestination =
		selectedDestination === "all" || destinations.has(selectedDestination)
			? selectedDestination
			: "all";

	// フィルタ適用
	const filteredDepartures = useMemo(() => {
		if (effectiveSelectedDestination === "all") return allDepartures;
		return allDepartures.filter(
			(dep) => dep.toStopId === effectiveSelectedDestination,
		);
	}, [allDepartures, effectiveSelectedDestination]);

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

	const allNextDay = groups.length > 0 && groups.every((g) => g.isNextDay);

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

			{(groups.length === 0 || allNextDay) && (
				<div className="card bg-base-100 shadow-sm">
					<div className="card-body">
						<p className="text-base-content/60">現在の発車予定はありません</p>
					</div>
				</div>
			)}

			{groups.length > 0 && (
				<div className="card bg-base-100 shadow-sm">
					<div className="card-body">
						<div className="flex items-center gap-3">
							<h3 className="card-title text-lg">発車案内</h3>
							{allNextDay && (
								<span className="badge badge-outline badge-sm">
									始発以降の便
								</span>
							)}
							{destinations.size > 1 && (
								<select
									aria-label="行き先で絞り込む"
									className="select select-sm select-bordered"
									value={effectiveSelectedDestination}
									onChange={(e) => setSelectedDestination(e.target.value)}
								>
									<option value="all">全ての行先</option>
									{[...destinations.entries()].map(([stopId, name]) => (
										<option key={stopId} value={stopId}>
											{name}
										</option>
									))}
								</select>
							)}
						</div>
						<div
							className={`overflow-x-auto overflow-y-auto ${SCROLL_MAX_HEIGHT_CLASS}`}
						>
							<table className="table table-sm">
								<thead className="sticky top-0 z-10 bg-base-100">
									<tr>
										<th>出発目安</th>
										<th>乗車</th>
										<th>発車</th>
										<th>到着</th>
										<th>運賃</th>
										<th>路線</th>
										<th>行き先</th>
									</tr>
								</thead>
								<tbody>
									{filteredDepartures.map((dep) => {
										const routeKey = `${dep.fromStopId}-${dep.toStopId}`;
										const isHovered = hoveredRouteKey === routeKey;
										const agencyColor = getAgencyColor(dep.routeId);
										return (
											<tr
												key={`${dep.tripId}-${dep.departureTime}`}
												className={`${isHovered ? "bg-info/10" : ""} ${dep.isDeparted ? "opacity-50" : ""}`}
												tabIndex={0}
												onMouseEnter={() => onRouteHover?.(routeKey)}
												onMouseLeave={() => onRouteHover?.(null)}
												onFocus={() => onRouteHover?.(routeKey)}
												onBlur={() => onRouteHover?.(null)}
											>
												<td className="font-mono">
													{dep.leaveByTime ? formatTime(dep.leaveByTime) : "-"}
													{dep.isDeparted && (
														<span className="ml-1 badge badge-sm badge-ghost">
															出発済
														</span>
													)}
												</td>
												<td>{dep.fromStopName ?? "-"}</td>
												<td className="font-mono">
													{formatTime(dep.departureTime)}
												</td>
												<td className="font-mono">
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
