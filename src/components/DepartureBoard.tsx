import type { Database } from "sql.js";
import { useDepartures } from "../hooks/useDepartures";
import type { RegisteredRouteEntry } from "../types/route-entry";

type DepartureBoardProps = {
	/** sql.js データベースインスタンス */
	db: Database;
	/** 登録済み経路一覧 */
	routes: RegisteredRouteEntry[];
};

/** HH:MM:SS または H:MM:SS 形式の時刻を HH:MM に短縮する */
function formatTime(time: string): string {
	return time.split(":").slice(0, 2).join(":");
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

/** 発車案内を降車バス停ごとにグルーピングして表示するコンポーネント */
export function DepartureBoard({ db, routes }: DepartureBoardProps) {
	const { groups, lastUpdated } = useDepartures(db, routes);

	if (routes.length === 0) {
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

	return (
		<div className="space-y-4">
			{lastUpdated && (
				<div className="text-sm text-base-content/60">
					最終更新: {formatUpdatedTime(lastUpdated)}
				</div>
			)}

			{groups.length === 0 ? (
				<div className="card bg-base-100 shadow-sm">
					<div className="card-body">
						<p className="text-base-content/60">現在の発車予定はありません</p>
					</div>
				</div>
			) : (
				groups.map((group) => (
					<div key={group.toStopId} className="card bg-base-100 shadow-sm">
						<div className="card-body">
							<h3 className="card-title text-lg">{group.toStopName}</h3>
							<div className="overflow-x-auto">
								<table className="table table-sm">
									<thead>
										<tr>
											<th>発車</th>
											<th>到着</th>
											<th>路線</th>
											<th>行き先</th>
										</tr>
									</thead>
									<tbody>
										{group.departures.map((dep) => (
											<tr key={`${dep.tripId}-${dep.departureTime}`}>
												<td className="font-mono">
													{formatTime(dep.departureTime)}
												</td>
												<td className="font-mono">
													{formatTime(dep.arrivalTime)}
												</td>
												<td>{dep.routeName}</td>
												<td>{dep.headsign}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					</div>
				))
			)}
		</div>
	);
}
