export type Agency = {
	agency_id: string;
	agency_name: string;
};

export type Stop = {
	stop_id: string;
	stop_name: string;
	stop_lat: number;
	stop_lon: number;
	zone_id?: string;
};

export type Route = {
	route_id: string;
	agency_id: string;
	route_short_name?: string;
	route_long_name?: string;
};

export type Trip = {
	trip_id: string;
	route_id: string;
	service_id: string;
	trip_headsign?: string;
	shape_id?: string;
};

export type StopTime = {
	trip_id: string;
	arrival_time: string;
	departure_time: string;
	stop_id: string;
	stop_sequence: number;
};

export type Calendar = {
	service_id: string;
	monday: number;
	tuesday: number;
	wednesday: number;
	thursday: number;
	friday: number;
	saturday: number;
	sunday: number;
	start_date: string;
	end_date: string;
};

export type CalendarDate = {
	service_id: string;
	date: string;
	exception_type: number;
};

export type GtfsData = {
	agency: Agency[];
	stops: Stop[];
	routes: Route[];
	trips: Trip[];
	stop_times: StopTime[];
	calendar: Calendar[];
	calendar_dates: CalendarDate[];
};
