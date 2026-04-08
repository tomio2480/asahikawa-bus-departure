import { DepartureBoard } from "./components/DepartureBoard";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { RouteRegistration } from "./components/RouteRegistration";
import { useDatabase } from "./hooks/useDatabase";
import { useRoutes } from "./hooks/useRoutes";

function App() {
	const { db, error: dbError, loading: dbLoading } = useDatabase();
	const {
		routes,
		loading: routesLoading,
		add,
		update,
		remove,
	} = useRoutes();

	const loading = dbLoading || routesLoading;

	return (
		<div className="min-h-screen bg-base-200">
			<header className="navbar bg-base-100">
				<h1 className="text-xl font-bold">旭川バス発車案内</h1>
			</header>
			<main className="container mx-auto p-4 space-y-6">
				{loading && <LoadingSpinner />}

				{dbError && (
					<div className="alert alert-error" role="alert">
						データの読み込みに失敗しました: {dbError.message}
					</div>
				)}

				{db && !loading && (
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
