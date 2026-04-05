import type { GtfsData } from "../../src/types/gtfs";

export const sampleGtfsData: GtfsData = {
	agency: [{ agency_id: "A001", agency_name: "テストバス" }],
	stops: [
		{
			stop_id: "S001",
			stop_name: "旭川駅前",
			stop_lat: 43.7631,
			stop_lon: 142.3582,
			zone_id: "Z001",
		},
		{
			stop_id: "S002",
			stop_name: "市役所前",
			stop_lat: 43.7701,
			stop_lon: 142.3651,
			zone_id: "Z002",
		},
	],
	routes: [
		{
			route_id: "R001",
			agency_id: "A001",
			route_short_name: "1",
			route_long_name: "旭川駅前〜市役所前",
		},
	],
	trips: [
		{
			trip_id: "T001",
			route_id: "R001",
			service_id: "weekday",
			trip_headsign: "市役所前",
		},
	],
	stop_times: [
		{
			trip_id: "T001",
			arrival_time: "08:00:00",
			departure_time: "08:00:00",
			stop_id: "S001",
			stop_sequence: 1,
		},
		{
			trip_id: "T001",
			arrival_time: "08:15:00",
			departure_time: "08:15:00",
			stop_id: "S002",
			stop_sequence: 2,
		},
	],
	calendar: [
		{
			service_id: "weekday",
			monday: 1,
			tuesday: 1,
			wednesday: 1,
			thursday: 1,
			friday: 1,
			saturday: 0,
			sunday: 0,
			start_date: "20260401",
			end_date: "20280407",
		},
	],
	calendar_dates: [
		{ service_id: "weekday", date: "20260505", exception_type: 2 },
	],
};
