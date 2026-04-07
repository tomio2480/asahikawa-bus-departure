import { readFileSync } from "node:fs";
import Papa from "papaparse";

const REQUIRED_COLUMNS = [
	"shape_id",
	"shape_pt_lat",
	"shape_pt_lon",
	"shape_pt_sequence",
] as const;

const HOKKAIDO_LAT_MIN = 41.3;
const HOKKAIDO_LAT_MAX = 45.6;
const HOKKAIDO_LON_MIN = 139.3;
const HOKKAIDO_LON_MAX = 149.0;

function validateShapesCsv(csv: string): void {
	if (csv.trim() === "") {
		throw new Error("shapes.txt is empty");
	}

	const result = Papa.parse<Record<string, string>>(csv, {
		header: true,
		skipEmptyLines: true,
	});

	if (result.errors.length > 0) {
		const firstError = result.errors[0];
		throw new Error(
			`CSV parse error at row ${firstError.row}: ${firstError.message}`,
		);
	}

	const headers = result.meta.fields ?? [];
	for (const col of REQUIRED_COLUMNS) {
		if (!headers.includes(col)) {
			throw new Error(`Missing required column: ${col}`);
		}
	}

	if (result.data.length === 0) {
		throw new Error("shapes.txt has no data rows");
	}

	for (let i = 0; i < result.data.length; i++) {
		const row = result.data[i];
		const rowNum = i + 1;

		if (!row.shape_id || row.shape_id.trim() === "") {
			throw new Error(`Missing shape_id at row ${rowNum}`);
		}

		const latRaw = row.shape_pt_lat;
		if (latRaw == null || latRaw.trim() === "") {
			throw new Error(
				`Invalid latitude "${row.shape_pt_lat}" at row ${rowNum}`,
			);
		}
		const lat = Number(latRaw);
		if (Number.isNaN(lat)) {
			throw new Error(
				`Invalid latitude "${row.shape_pt_lat}" at row ${rowNum}`,
			);
		}
		if (lat < HOKKAIDO_LAT_MIN || lat > HOKKAIDO_LAT_MAX) {
			throw new Error(
				`latitude ${lat} out of range (${HOKKAIDO_LAT_MIN}-${HOKKAIDO_LAT_MAX}) at row ${rowNum}`,
			);
		}

		const lonRaw = row.shape_pt_lon;
		if (lonRaw == null || lonRaw.trim() === "") {
			throw new Error(
				`Invalid longitude "${row.shape_pt_lon}" at row ${rowNum}`,
			);
		}
		const lon = Number(lonRaw);
		if (Number.isNaN(lon)) {
			throw new Error(
				`Invalid longitude "${row.shape_pt_lon}" at row ${rowNum}`,
			);
		}
		if (lon < HOKKAIDO_LON_MIN || lon > HOKKAIDO_LON_MAX) {
			throw new Error(
				`longitude ${lon} out of range (${HOKKAIDO_LON_MIN}-${HOKKAIDO_LON_MAX}) at row ${rowNum}`,
			);
		}

		const seqRaw = row.shape_pt_sequence;
		if (seqRaw == null || seqRaw.trim() === "") {
			throw new Error(
				`Invalid shape_pt_sequence "${row.shape_pt_sequence}" at row ${rowNum}`,
			);
		}
		const seq = Number(seqRaw);
		if (!Number.isInteger(seq) || seq < 0) {
			throw new Error(
				`Invalid shape_pt_sequence "${row.shape_pt_sequence}" at row ${rowNum}`,
			);
		}
	}
}

export { validateShapesCsv };

const isDirectExecution =
	process.argv[1] &&
	(process.argv[1].endsWith("validate-shapes.ts") ||
		process.argv[1].endsWith("validate-shapes"));

if (isDirectExecution) {
	const filePath = process.argv[2];
	if (!filePath) {
		console.error("Usage: npx tsx scripts/validate-shapes.ts <shapes.txt>");
		process.exit(1);
	}
	try {
		const csv = readFileSync(filePath, "utf-8");
		validateShapesCsv(csv);
		console.log(`Validation passed: ${filePath}`);
	} catch (e) {
		console.error(`Validation failed: ${e instanceof Error ? e.message : e}`);
		process.exit(1);
	}
}
