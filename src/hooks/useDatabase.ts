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

async function fetchGtfsData(
	baseUrl: string,
): Promise<{ current: GtfsData[]; prev: (GtfsData | null)[] }> {
	const current = await Promise.all(
		OPERATORS.map(async (op) => {
			const res = await fetch(`${baseUrl}data/${op}.json`);
			if (!res.ok) {
				throw new Error(`Failed to fetch ${op}.json: ${res.status}`);
			}
			return res.json() as Promise<GtfsData>;
		}),
	);
	const prev = await Promise.all(
		OPERATORS.map(async (op) => {
			try {
				const res = await fetch(`${baseUrl}data/${op}_prev.json`);
				if (!res.ok) return null;
				const contentType = res.headers.get("content-type") ?? "";
				if (!contentType.includes("json")) return null;
				return res.json() as Promise<GtfsData>;
			} catch {
				return null;
			}
		}),
	);
	return { current, prev };
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

				const { current, prev } = await fetchGtfsData(
					import.meta.env.BASE_URL,
				);
				if (cancelled) {
					database.close();
					database = null;
					return;
				}

				for (let i = 0; i < OPERATORS.length; i++) {
					loadGtfsData(database, current[i], OPERATORS[i]);
					const prevData = prev[i];
					if (prevData) {
						loadGtfsData(database, prevData, OPERATORS[i], "prev~");
					}
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
