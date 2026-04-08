import { DepartureBoard } from "./components/DepartureBoard";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { RouteRegistration } from "./components/RouteRegistration";
import { RouteTransfer } from "./components/RouteTransfer";
import { useDatabase } from "./hooks/useDatabase";
import { useRoutes } from "./hooks/useRoutes";

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

	const loading = dbLoading || routesLoading;
	const error = dbError || routesError;

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
						<DepartureBoard db={db} routes={routes} />
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
