import { useCallback, useMemo, useState } from "react";
import { DepartureBoard } from "./components/DepartureBoard";
import { ExpiryWarning } from "./components/ExpiryWarning";
import { Footer } from "./components/Footer";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { type MapRoute, MapView } from "./components/MapView";
import { RouteRegistration } from "./components/RouteRegistration";
import { RouteTransfer } from "./components/RouteTransfer";
import { useDatabase } from "./hooks/useDatabase";
import { useDepartures } from "./hooks/useDepartures";
import { useRoutes } from "./hooks/useRoutes";
import { type ThemePreference, useTheme } from "./hooks/useTheme";
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

	const [pinnedRouteKey, setPinnedRouteKey] = useState<string | null>(null);
	const handleRoutePinToggle = useCallback((key: string) => {
		setPinnedRouteKey((prev) => (prev === key ? null : key));
	}, []);


	const [selectedDestination, setSelectedDestination] = useState("all");
	const effectiveDestination = useMemo(() => {
		if (selectedDestination === "all") return "all";
		return groups.some((g) => g.toStopId === selectedDestination)
			? selectedDestination
			: "all";
	}, [selectedDestination, groups]);

	const mapRoutes = useMemo<MapRoute[]>(() => {
		const seen = new Set<string>();
		const result: MapRoute[] = [];
		const filteredGroups =
			effectiveDestination === "all"
				? groups
				: groups.filter((g) => g.toStopId === effectiveDestination);
		for (const group of filteredGroups) {
			for (const dep of group.departures) {
				const key = `${dep.tripId}-${dep.fromStopId}-${dep.toStopId}`;
				if (!seen.has(key)) {
					seen.add(key);
					result.push({
						tripId: dep.tripId,
						routeId: dep.routeId,
						shapeId: dep.shapeId ?? undefined,
						fromStopId: dep.fromStopId,
						toStopId: dep.toStopId,
					});
				}
			}
		}
		return result;
	}, [groups, effectiveDestination]);

	const { preference, changeTheme } = useTheme();

	return (
		<div className="flex flex-col min-h-screen bg-base-200">
			<header className="navbar bg-base-100">
				<div className="flex-1">
					<h1 className="text-xl font-bold">旭川バス発車案内</h1>
				</div>
				<div className="flex-none">
					<div className="flex items-center gap-1 sm:gap-2">
						<RouteTransfer onImportComplete={reload} />
						<select
							aria-label="テーマ切り替え"
							className="select select-sm select-bordered"
							value={preference}
							onChange={(e) =>
								changeTheme(e.target.value as ThemePreference)
							}
						>
							<option value="system">デバイス設定</option>
							<option value="light">ライト</option>
							<option value="dark">ダーク</option>
						</select>
					</div>
				</div>
			</header>
			<main className="container mx-auto p-4 space-y-6 flex-1">
				{loading && !error && <LoadingSpinner />}

				{error && (
					<div className="alert alert-error" role="alert">
						データの読み込みに失敗しました: {error.message}
					</div>
				)}

				{db && !loading && !error && (
					<>
						<ExpiryWarning expiry={expiry} currentDate={currentDate} />
						{mapRoutes.length > 0 && (
							<div className="card bg-base-100 shadow-sm">
								<div className="card-body">
									<h2 className="card-title text-lg">経路マップ</h2>
									<MapView
										db={db}
										routes={mapRoutes}
										onRouteHover={handleRouteHover}
										hoveredRouteKey={hoveredRouteKey}
										pinnedRouteKey={pinnedRouteKey}
										onRoutePinToggle={handleRoutePinToggle}
									/>
								</div>
							</div>
						)}
						<DepartureBoard
							groups={groups}
							lastUpdated={lastUpdated}
							error={departuresError}
							hasRoutes={routes.length > 0}
							hoveredRouteKey={hoveredRouteKey}
							onRouteHover={handleRouteHover}
							pinnedRouteKey={pinnedRouteKey}
							onRoutePinToggle={handleRoutePinToggle}
							selectedDestination={effectiveDestination}
							onDestinationChange={setSelectedDestination}
						/>
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
			<Footer />
		</div>
	);
}

export default App;
