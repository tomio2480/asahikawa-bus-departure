import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import type { GtfsData } from "../src/types/gtfs";

const OPERATORS = [
	{ id: "asahikawa_denkikido", name: "旭川電気軌道" },
	{ id: "dohoku_bus", name: "道北バス" },
	{ id: "furano_bus", name: "ふらのバス" },
] as const;

const REQUIRED_FILES = [
	"agency.txt",
	"stops.txt",
	"routes.txt",
	"trips.txt",
	"stop_times.txt",
	"calendar.txt",
	"calendar_dates.txt",
	"fare_attributes.txt",
	"fare_rules.txt",
] as const;

const IGNORED_FILES = new Set([
	"feed_info.txt",
	"agency_jp.txt",
	"routes_jp.txt",
	"office_jp.txt",
	"translations.txt",
]);

function parseCsv(text: string): Record<string, string>[] {
	const result = Papa.parse<Record<string, string>>(text, {
		header: true,
		skipEmptyLines: true,
	});
	return result.data;
}

function validateCoordinate(lat: number, lon: number, stopId: string): void {
	if (Number.isNaN(lat) || Number.isNaN(lon)) {
		throw new Error(`Invalid coordinate (NaN) for stop ${stopId}`);
	}
	if (lat < 42.0 || lat > 45.0) {
		throw new Error(
			`Invalid latitude ${lat} for stop ${stopId} (expected 42.0-45.0 for Hokkaido)`,
		);
	}
	if (lon < 141.0 || lon > 146.0) {
		throw new Error(
			`Invalid longitude ${lon} for stop ${stopId} (expected 141.0-146.0 for Hokkaido)`,
		);
	}
}

function validateRequiredField(
	record: Record<string, string>,
	field: string,
	fileName: string,
	index: number,
): void {
	if (!record[field] || record[field].trim() === "") {
		throw new Error(
			`Missing required field "${field}" in ${fileName} at row ${index + 1}`,
		);
	}
}

function convertOperator(inputDir: string, operatorId: string): GtfsData {
	const readFile = (name: string): string => {
		const path = join(inputDir, name);
		if (!existsSync(path)) {
			if (name === "shapes.txt") return "";
			throw new Error(`Required file ${name} not found in ${inputDir}`);
		}
		return readFileSync(path, "utf-8");
	};

	const agencyRecords = parseCsv(readFile("agency.txt"));
	for (let i = 0; i < agencyRecords.length; i++) {
		validateRequiredField(agencyRecords[i], "agency_id", "agency.txt", i);
		validateRequiredField(agencyRecords[i], "agency_name", "agency.txt", i);
	}

	const stopsRecords = parseCsv(readFile("stops.txt"));
	for (let i = 0; i < stopsRecords.length; i++) {
		validateRequiredField(stopsRecords[i], "stop_id", "stops.txt", i);
		validateRequiredField(stopsRecords[i], "stop_name", "stops.txt", i);
		validateRequiredField(stopsRecords[i], "stop_lat", "stops.txt", i);
		validateRequiredField(stopsRecords[i], "stop_lon", "stops.txt", i);
		const lat = Number(stopsRecords[i].stop_lat);
		const lon = Number(stopsRecords[i].stop_lon);
		validateCoordinate(lat, lon, stopsRecords[i].stop_id);
	}

	const routesRecords = parseCsv(readFile("routes.txt"));
	for (let i = 0; i < routesRecords.length; i++) {
		validateRequiredField(routesRecords[i], "route_id", "routes.txt", i);
		validateRequiredField(routesRecords[i], "agency_id", "routes.txt", i);
	}

	const tripsRecords = parseCsv(readFile("trips.txt"));
	for (let i = 0; i < tripsRecords.length; i++) {
		validateRequiredField(tripsRecords[i], "trip_id", "trips.txt", i);
		validateRequiredField(tripsRecords[i], "route_id", "trips.txt", i);
		validateRequiredField(tripsRecords[i], "service_id", "trips.txt", i);
	}

	const stopTimesRecords = parseCsv(readFile("stop_times.txt"));
	for (let i = 0; i < stopTimesRecords.length; i++) {
		validateRequiredField(stopTimesRecords[i], "trip_id", "stop_times.txt", i);
		validateRequiredField(
			stopTimesRecords[i],
			"arrival_time",
			"stop_times.txt",
			i,
		);
		validateRequiredField(
			stopTimesRecords[i],
			"departure_time",
			"stop_times.txt",
			i,
		);
		validateRequiredField(stopTimesRecords[i], "stop_id", "stop_times.txt", i);
		validateRequiredField(
			stopTimesRecords[i],
			"stop_sequence",
			"stop_times.txt",
			i,
		);
	}

	const calendarRecords = parseCsv(readFile("calendar.txt"));
	for (let i = 0; i < calendarRecords.length; i++) {
		validateRequiredField(calendarRecords[i], "service_id", "calendar.txt", i);
	}

	const calendarDatesRecords = parseCsv(readFile("calendar_dates.txt"));
	for (let i = 0; i < calendarDatesRecords.length; i++) {
		validateRequiredField(
			calendarDatesRecords[i],
			"service_id",
			"calendar_dates.txt",
			i,
		);
		validateRequiredField(
			calendarDatesRecords[i],
			"date",
			"calendar_dates.txt",
			i,
		);
		validateRequiredField(
			calendarDatesRecords[i],
			"exception_type",
			"calendar_dates.txt",
			i,
		);
	}

	const fareAttrRecords = parseCsv(readFile("fare_attributes.txt"));
	const fareRulesRecords = parseCsv(readFile("fare_rules.txt"));

	const shapesText = readFile("shapes.txt");
	const shapesRecords = shapesText ? parseCsv(shapesText) : [];

	return {
		agency: agencyRecords.map((r) => ({
			agency_id: r.agency_id,
			agency_name: r.agency_name,
		})),
		stops: stopsRecords.map((r) => ({
			stop_id: r.stop_id,
			stop_name: r.stop_name,
			stop_lat: Number(r.stop_lat),
			stop_lon: Number(r.stop_lon),
			...(r.zone_id ? { zone_id: r.zone_id } : {}),
		})),
		routes: routesRecords.map((r) => ({
			route_id: r.route_id,
			agency_id: r.agency_id,
			...(r.route_short_name ? { route_short_name: r.route_short_name } : {}),
			...(r.route_long_name ? { route_long_name: r.route_long_name } : {}),
		})),
		trips: tripsRecords.map((r) => ({
			trip_id: r.trip_id,
			route_id: r.route_id,
			service_id: r.service_id,
			...(r.trip_headsign ? { trip_headsign: r.trip_headsign } : {}),
			...(r.shape_id ? { shape_id: r.shape_id } : {}),
		})),
		stop_times: stopTimesRecords.map((r) => ({
			trip_id: r.trip_id,
			arrival_time: r.arrival_time,
			departure_time: r.departure_time,
			stop_id: r.stop_id,
			stop_sequence: Number(r.stop_sequence),
		})),
		calendar: calendarRecords.map((r) => ({
			service_id: r.service_id,
			monday: Number(r.monday) as 0 | 1,
			tuesday: Number(r.tuesday) as 0 | 1,
			wednesday: Number(r.wednesday) as 0 | 1,
			thursday: Number(r.thursday) as 0 | 1,
			friday: Number(r.friday) as 0 | 1,
			saturday: Number(r.saturday) as 0 | 1,
			sunday: Number(r.sunday) as 0 | 1,
			start_date: r.start_date,
			end_date: r.end_date,
		})),
		calendar_dates: calendarDatesRecords.map((r) => ({
			service_id: r.service_id,
			date: r.date,
			exception_type: Number(r.exception_type) as 1 | 2,
		})),
		shapes: shapesRecords.map((r) => ({
			shape_id: r.shape_id,
			shape_pt_lat: Number(r.shape_pt_lat),
			shape_pt_lon: Number(r.shape_pt_lon),
			shape_pt_sequence: Number(r.shape_pt_sequence),
		})),
		fare_attributes: fareAttrRecords.map((r) => ({
			fare_id: r.fare_id,
			price: Number(r.price),
			currency_type: r.currency_type,
			payment_method: Number(r.payment_method) as 0 | 1,
			transfers: r.transfers === "" ? null : (Number(r.transfers) as 0 | 1 | 2),
		})),
		fare_rules: fareRulesRecords.map((r) => ({
			fare_id: r.fare_id,
			...(r.route_id ? { route_id: r.route_id } : {}),
			...(r.origin_id ? { origin_id: r.origin_id } : {}),
			...(r.destination_id ? { destination_id: r.destination_id } : {}),
		})),
	};
}

function main(): void {
	const inputBase = process.argv[2];
	const outputDir = process.argv[3] ?? "public/data";

	if (!inputBase) {
		console.error(
			"Usage: npx tsx scripts/convert-gtfs.ts <input-dir> [output-dir]",
		);
		console.error(
			"  <input-dir> should contain subdirectories for each operator",
		);
		process.exit(1);
	}

	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	for (const operator of OPERATORS) {
		const operatorDir = join(inputBase, operator.id);
		if (!existsSync(operatorDir)) {
			console.warn(
				`Skipping ${operator.name}: directory ${operatorDir} not found`,
			);
			continue;
		}

		console.log(`Converting ${operator.name} (${operator.id})...`);
		const data = convertOperator(operatorDir, operator.id);

		const outputPath = join(outputDir, `${operator.id}.json`);
		writeFileSync(outputPath, JSON.stringify(data), "utf-8");

		const stats = {
			agency: data.agency.length,
			stops: data.stops.length,
			routes: data.routes.length,
			trips: data.trips.length,
			stop_times: data.stop_times.length,
			calendar: data.calendar.length,
			calendar_dates: data.calendar_dates.length,
			shapes: data.shapes.length,
			fare_attributes: data.fare_attributes.length,
			fare_rules: data.fare_rules.length,
		};
		console.log(`  Output: ${outputPath}`);
		console.log("  Records:", stats);
	}

	console.log("Done.");
}

export {
	parseCsv,
	validateCoordinate,
	convertOperator,
	OPERATORS,
	REQUIRED_FILES,
	IGNORED_FILES,
};

const isDirectExecution =
	process.argv[1] &&
	(process.argv[1].endsWith("convert-gtfs.ts") ||
		process.argv[1].endsWith("convert-gtfs"));

if (isDirectExecution) {
	main();
}
