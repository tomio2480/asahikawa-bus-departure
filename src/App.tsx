import { useMemo } from "react";
import { DepartureBoard } from "./components/DepartureBoard";
import { ExpiryWarning } from "./components/ExpiryWarning";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { type MapRoute, MapView } from "./components/MapView";
import { RouteRegistration } from "./components/RouteRegistration";
import { RouteTransfer } from "./components/RouteTransfer";
import { useDatabase } from "./hooks/useDatabase";
import { useDepartures } from "./hooks/useDepartures";
import { useRoutes } from "./hooks/useRoutes";
import { getDataExpiry } from "./lib/data-expiry";

/** 現在日付を YYYYMMDD 形式で返す（JST） */
function getCurrentDateStr(): string {
	const now = new Date();
	const fmt = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Tokyo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	return fmt.format(now).replace(/-/g, "");
}

function App() {
	const { db, error: dbError, loading: dbLoading } = useDatabase();
	const {
		routes,
		loading: routesLoading,
		error: routesError,
		add,
		update,
		remove,
		reload,
	} = useRoutes();

	const {
		groups,
		lastUpdated,
		error: departuresError,
	} = useDepartures(db, routes);

	const loading = dbLoading || routesLoading;
	const error = dbError || routesError;

	const expiry = useMemo(() => (db ? getDataExpiry(db) : null), [db]);
	const currentDate = getCurrentDateStr();

	const mapRoutes = useMemo<MapRoute[]>(() => {
		const seen = new Set<string>();
		const result: MapRoute[] = [];
		for (const group of groups) {
			for (const dep of group.departures) {
				if (!seen.has(dep.tripId)) {
					seen.add(dep.tripId);
					result.push({
						tripId: dep.tripId,
						fromStopId: dep.fromStopId,
						toStopId: dep.toStopId,
					});
				}
			}
		}
		return result;
	}, [groups]);

	return (
		<div className="min-h-screen bg-base-200">
			<header className="navbar bg-base-100">
				<div className="flex-1">
					<h1 className="text-xl font-bold">旭川バス発車案内</h1>
				</div>
				<div className="flex-none">
					<RouteTransfer onImportComplete={reload} />
				</div>
			</header>
			<main className="container mx-auto p-4 space-y-6">
				{loading && !error && <LoadingSpinner />}

				{error && (
					<div className="alert alert-error" role="alert">
						データの読み込みに失敗しました: {error.message}
					</div>
				)}

				{db && !loading && !error && (
					<>
						<ExpiryWarning expiry={expiry} currentDate={currentDate} />
						<DepartureBoard
							groups={groups}
							lastUpdated={lastUpdated}
							error={departuresError}
							hasRoutes={routes.length > 0}
						/>
						{mapRoutes.length > 0 && (
							<div className="card bg-base-100 shadow-sm">
								<div className="card-body">
									<h2 className="card-title text-lg">経路マップ</h2>
									<MapView db={db} routes={mapRoutes} />
								</div>
							</div>
						)}
						<RouteRegistration
							db={db}
							routes={routes}
							onAdd={add}
							onUpdate={update}
							onDelete={remove}
						/>
					</>
				)}
			</main>
		</div>
	);
}

export default App;
