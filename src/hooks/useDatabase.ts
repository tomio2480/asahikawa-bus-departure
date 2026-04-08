import { useEffect, useState } from "react";
import initSqlJs from "sql.js";
import type { Database, SqlJsStatic } from "sql.js";
import { createSchema, loadGtfsData } from "../lib/gtfs-loader";
import type { GtfsData } from "../types/gtfs";

const OPERATORS = [
	"asahikawa_denkikido",
	"dohoku_bus",
	"furano_bus",
] as const;

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function getSqlJs(): Promise<SqlJsStatic> {
	if (!sqlJsPromise) {
		sqlJsPromise = initSqlJs({
			locateFile: (file) => `${import.meta.env.BASE_URL}${file}`,
		}).catch((e) => {
			sqlJsPromise = null;
			throw e;
		});
	}
	return sqlJsPromise;
}

async function fetchGtfsData(baseUrl: string): Promise<GtfsData[]> {
	const results = await Promise.all(
		OPERATORS.map(async (op) => {
			const res = await fetch(`${baseUrl}data/${op}.json`);
			if (!res.ok) {
				throw new Error(`Failed to fetch ${op}.json: ${res.status}`);
			}
			return res.json() as Promise<GtfsData>;
		}),
	);
	return results;
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

		(async () => {
			try {
				const SQL = await getSqlJs();
				if (cancelled) return;

				database = new SQL.Database();
				createSchema(database);

				const datasets = await fetchGtfsData(import.meta.env.BASE_URL);
				if (cancelled) {
					database.close();
					database = null;
					return;
				}

				for (let i = 0; i < OPERATORS.length; i++) {
					loadGtfsData(database, datasets[i], OPERATORS[i]);
				}

				setDb(database);
			} catch (e) {
				if (database) {
					database.close();
					database = null;
				}
				if (cancelled) return;
				setError(e instanceof Error ? e : new Error(String(e)));
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
			if (database) {
				database.close();
			}
		};
	}, []);

	return { db, error, loading };
}
