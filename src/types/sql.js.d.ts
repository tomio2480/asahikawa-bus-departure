declare module "sql.js" {
	export interface QueryExecResult {
		columns: string[];
		values: unknown[][];
	}

	export interface Statement {
		bind(values?: unknown[]): boolean;
		step(): boolean;
		getAsObject(): Record<string, unknown>;
		run(values?: unknown[]): void;
		free(): void;
	}

	export interface Database {
		run(sql: string, params?: unknown[]): Database;
		exec(sql: string, params?: unknown[]): QueryExecResult[];
		prepare(sql: string): Statement;
		close(): void;
	}

	export interface SqlJsStatic {
		Database: new (data?: ArrayLike<number>) => Database;
	}

	export interface InitSqlJsOptions {
		locateFile?: (file: string) => string;
	}

	export default function initSqlJs(
		options?: InitSqlJsOptions,
	): Promise<SqlJsStatic>;
}
