import { useCallback, useMemo, useState } from "react";
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

/** 現在日付を YYYYMMDD 形式で返す（ローカル） */
function getCurrentDateStr(): string {
	return new Date().toLocaleDateString("sv-SE").replace(/-/g, "");
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
	const currentDate = useMemo(() => getCurrentDateStr(), []);

	const [hoveredRouteKey, setHoveredRouteKey] = useState<string | null>(null);
	const handleRouteHover = useCallback((key: string | null) => {
		setHoveredRouteKey(key);
	}, []);

	const mapRoutes = useMemo<MapRoute[]>(() => {
		const seen = new Set<string>();
		const result: MapRoute[] = [];
		for (const group of groups) {
			for (const dep of group.departures) {
				const key = `${dep.tripId}-${dep.fromStopId}-${dep.toStopId}`;
				if (!seen.has(key)) {
					seen.add(key);
					result.push({
						tripId: dep.tripId,
						shapeId: dep.shapeId ?? undefined,
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
							hoveredRouteKey={hoveredRouteKey}
							onRouteHover={handleRouteHover}
						/>
						{mapRoutes.length > 0 && (
							<div className="card bg-base-100 shadow-sm">
								<div className="card-body">
									<h2 className="card-title text-lg">経路マップ</h2>
									<MapView
										db={db}
										routes={mapRoutes}
										onRouteHover={handleRouteHover}
										hoveredRouteKey={hoveredRouteKey}
									/>
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
