import { useEffect, useState } from "react";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { createSchema } from "../lib/gtfs-loader";

export function useDatabase(): {
	db: Database | null;
	error: Error | null;
	loading: boolean;
} {
	const [db, setDb] = useState<Database | null>(null);
	const [error, setError] = useState<Error | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;

		initSqlJs({
			locateFile: (file) => `/${file}`,
		})
			.then((SQL) => {
				if (cancelled) return;
				const database = new SQL.Database();
				createSchema(database);
				setDb(database);
				setLoading(false);
			})
			.catch((e) => {
				if (cancelled) return;
				setError(e instanceof Error ? e : new Error(String(e)));
				setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	return { db, error, loading };
}
