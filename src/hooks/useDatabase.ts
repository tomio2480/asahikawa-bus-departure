import { useEffect, useState } from "react";
import initSqlJs from "sql.js";
import type { Database, SqlJsStatic } from "sql.js";
import { createSchema } from "../lib/gtfs-loader";

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function getSqlJs(): Promise<SqlJsStatic> {
	if (!sqlJsPromise) {
		sqlJsPromise = initSqlJs({
			locateFile: (file) => `/${file}`,
		}).catch((e) => {
			sqlJsPromise = null;
			throw e;
		});
	}
	return sqlJsPromise;
}

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
		let database: Database | null = null;

		getSqlJs()
			.then((SQL) => {
				if (cancelled) return;
				database = new SQL.Database();
				createSchema(database);
				setDb(database);
				setLoading(false);
			})
			.catch((e) => {
				if (database) {
					database.close();
					database = null;
				}
				if (cancelled) return;
				setError(e instanceof Error ? e : new Error(String(e)));
				setLoading(false);
			});

		return () => {
			cancelled = true;
			if (database) {
				database.close();
			}
		};
	}, []);

	return { db, error, loading };
}
