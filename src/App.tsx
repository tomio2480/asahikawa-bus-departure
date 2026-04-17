import { useCallback, useMemo, useState } from "react";
import { DepartureBoard } from "./components/DepartureBoard";
import { ExpiryWarning } from "./components/ExpiryWarning";
import { DataAttribution, Footer } from "./components/Footer";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { type MapRoute, MapView } from "./components/MapView";
import { RouteRegistration } from "./components/RouteRegistration";
import { RouteTransfer } from "./components/RouteTransfer";
import { useDatabase } from "./hooks/useDatabase";
import { useDepartures } from "./hooks/useDepartures";
import { useNotification } from "./hooks/useNotification";
import { useNotificationSettings } from "./hooks/useNotificationSettings";
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


	const [selectedDestinations, setSelectedDestinations] = useState<
		Set<string>
	>(new Set());
	const effectiveDestinations = useMemo(() => {
		if (selectedDestinations.size === 0) return new Set<string>();
		const valid = new Set<string>();
		for (const id of selectedDestinations) {
			if (groups.some((g) => g.toStopId === id)) {
				valid.add(id);
			}
		}
		return valid;
	}, [selectedDestinations, groups]);

	const handleDestinationToggle = useCallback((id: string) => {
		setSelectedDestinations((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	const mapRoutes = useMemo<MapRoute[]>(() => {
		const seen = new Set<string>();
		const result: MapRoute[] = [];
		const filteredGroups =
			effectiveDestinations.size === 0
				? groups
				: groups.filter((g) => effectiveDestinations.has(g.toStopId));
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
	}, [groups, effectiveDestinations]);

	const { preference, changeTheme } = useTheme();

	const {
		minutes: notifyBeforeMinutes,
		setMinutes: setNotifyBeforeMinutes,
	} = useNotificationSettings();

	const allDeparturesForNotification = useMemo(
		() =>
			groups.flatMap((g) =>
				g.departures.map((d) => ({
					...d,
					toStopName: g.toStopName,
					isNextDay: g.isNextDay,
				})),
			),
		[groups],
	);

	const hasNotifyEnabledRoutes = routes.some((r) => r.notifyEnabled);

	const { permission: notifyPermission, requestPermission } = useNotification({
		departures: allDeparturesForNotification,
		routes,
		notifyBeforeMinutes,
		enabled: hasNotifyEnabledRoutes,
	});

	return (
		<div className="flex flex-col min-h-screen bg-base-200">
			<header className="navbar bg-base-100 flex-wrap gap-y-1">
				<div className="flex-1 min-w-0">
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
						<DataAttribution />
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
							selectedDestinations={effectiveDestinations}
							onDestinationToggle={handleDestinationToggle}
						/>
						<RouteRegistration
							db={db}
							routes={routes}
							onAdd={add}
							onUpdate={update}
							onDelete={remove}
							onRequestNotificationPermission={requestPermission}
							notifyPermission={notifyPermission}
							hasNotifyEnabledRoutes={hasNotifyEnabledRoutes}
							notifyBeforeMinutes={notifyBeforeMinutes}
							onNotifyBeforeMinutesChange={setNotifyBeforeMinutes}
						/>
					</>
				)}
			</main>
			<Footer />
		</div>
	);
}

export default App;
