import { cleanup, render, screen } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { createSchema, loadGtfsData } from "../src/lib/gtfs-loader";
import type { GtfsData } from "../src/types/gtfs";

const mockFitBounds = vi.fn();
const mockScrollWheelZoomEnable = vi.fn();
const mockScrollWheelZoomDisable = vi.fn();
const mockZoomIn = vi.fn();
const mockZoomOut = vi.fn();
const mockGetContainer = vi.fn(() => {
	const div = document.createElement("div");
	return div;
});
const mockMapInstance = {
	fitBounds: mockFitBounds,
	scrollWheelZoom: {
		enable: mockScrollWheelZoomEnable,
		disable: mockScrollWheelZoomDisable,
	},
	zoomIn: mockZoomIn,
	zoomOut: mockZoomOut,
	getContainer: mockGetContainer,
};

vi.mock("leaflet", () => ({
	default: {
		Icon: vi.fn(),
		latLngBounds: vi.fn(
			(positions: [number, number][]) => ({
				_positions: positions,
				isValid: () => positions.length > 0,
			}),
		),
	},
}));

vi.mock("leaflet/dist/images/marker-icon-2x.png", () => ({
	default: "marker-icon-2x.png",
}));
vi.mock("leaflet/dist/images/marker-icon.png", () => ({
	default: "marker-icon.png",
}));
vi.mock("leaflet/dist/images/marker-shadow.png", () => ({
	default: "marker-shadow.png",
}));

vi.mock("react-leaflet", () => ({
	Pane: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	MapContainer: ({
		children,
		...props
	}: {
		children: React.ReactNode;
		center: [number, number];
		zoom: number;
		scrollWheelZoom?: boolean | string;
	}) => (
		<div
			data-testid="map-container"
			data-center={JSON.stringify(props.center)}
			data-zoom={props.zoom}
			data-scroll-wheel-zoom={String(props.scrollWheelZoom ?? true)}
		>
			{children}
		</div>
	),
	TileLayer: ({ url }: { url: string }) => (
		<div data-testid="tile-layer" data-url={url} />
	),
	Marker: ({ position }: { position: [number, number]; icon?: unknown }) => (
		<div data-testid="marker" data-position={JSON.stringify(position)} />
	),
	Popup: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="popup">{children}</div>
	),
	Tooltip: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="tooltip">{children}</div>
	),
	Polyline: ({
		positions,
		pathOptions,
	}: {
		positions: [number, number][];
		pathOptions: { color: string; weight?: number; opacity?: number };
	}) => (
		<div
			data-testid="polyline"
			data-positions={JSON.stringify(positions)}
			data-color={pathOptions.color}
			data-weight={pathOptions.weight}
			data-opacity={pathOptions.opacity}
		/>
	),
	useMap: () => mockMapInstance,
}));

import { MapView } from "../src/components/MapView";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: Database;

const baseGtfs: GtfsData = {
	agency: [{ agency_id: "A1", agency_name: "Test Agency" }],
	stops: [
		{ stop_id: "S1", stop_name: "Stop A", stop_lat: 43.77, stop_lon: 142.36 },
		{ stop_id: "S2", stop_name: "Stop B", stop_lat: 43.78, stop_lon: 142.37 },
		{ stop_id: "S3", stop_name: "Stop C", stop_lat: 43.79, stop_lon: 142.38 },
	],
	routes: [{ route_id: "R1", agency_id: "A1" }],
	trips: [
		{ trip_id: "T1", route_id: "R1", service_id: "SV1", shape_id: "SH1" },
		{ trip_id: "T2", route_id: "R1", service_id: "SV1" },
	],
	stop_times: [
		{
			trip_id: "T1",
			arrival_time: "08:00:00",
			departure_time: "08:00:00",
			stop_id: "S1",
			stop_sequence: 1,
		},
		{
			trip_id: "T1",
			arrival_time: "08:10:00",
			departure_time: "08:10:00",
			stop_id: "S2",
			stop_sequence: 2,
		},
		{
			trip_id: "T1",
			arrival_time: "08:20:00",
			departure_time: "08:20:00",
			stop_id: "S3",
			stop_sequence: 3,
		},
		{
			trip_id: "T2",
			arrival_time: "09:00:00",
			departure_time: "09:00:00",
			stop_id: "S1",
			stop_sequence: 1,
		},
		{
			trip_id: "T2",
			arrival_time: "09:10:00",
			departure_time: "09:10:00",
			stop_id: "S3",
			stop_sequence: 2,
		},
	],
	calendar: [
		{
			service_id: "SV1",
			monday: 1,
			tuesday: 1,
			wednesday: 1,
			thursday: 1,
			friday: 1,
			saturday: 0,
			sunday: 0,
			start_date: "20260101",
			end_date: "20261231",
		},
	],
	calendar_dates: [],
	shapes: [
		{
			shape_id: "SH1",
			shape_pt_lat: 43.77,
			shape_pt_lon: 142.36,
			shape_pt_sequence: 1,
		},
		{
			shape_id: "SH1",
			shape_pt_lat: 43.775,
			shape_pt_lon: 142.365,
			shape_pt_sequence: 2,
		},
		{
			shape_id: "SH1",
			shape_pt_lat: 43.78,
			shape_pt_lon: 142.37,
			shape_pt_sequence: 3,
		},
	],
	fare_attributes: [],
	fare_rules: [],
};

beforeAll(async () => {
	SQL = await initSqlJs();
});

beforeEach(() => {
	db = new SQL.Database();
	createSchema(db);
	loadGtfsData(db, baseGtfs, "TEST");
});

afterEach(() => {
	cleanup();
	db.close();
});

describe("MapView", () => {
	it("地図コンテナが表示される", () => {
		render(
			<MapView
				db={db}
				routes={[
					{
						tripId: "TEST:T1",
						routeId: "TEST:R1",
						shapeId: "TEST:SH1",
						fromStopId: "TEST:S1",
						toStopId: "TEST:S3",
					},
				]}
			/>,
		);
		expect(screen.getByTestId("map-container")).toBeInTheDocument();
	});

	it("停留所にマーカーが配置される", () => {
		render(
			<MapView
				db={db}
				routes={[
					{
						tripId: "TEST:T1",
						routeId: "TEST:R1",
						shapeId: "TEST:SH1",
						fromStopId: "TEST:S1",
						toStopId: "TEST:S3",
					},
				]}
			/>,
		);
		const markers = screen.getAllByTestId("marker");
		expect(markers.length).toBeGreaterThanOrEqual(2);
	});

	it("shapes がある場合は全経路とハイライト区間の 2 本のポリラインが描画される", () => {
		render(
			<MapView
				db={db}
				routes={[
					{
						tripId: "TEST:T1",
						routeId: "TEST:R1",
						shapeId: "TEST:SH1",
						fromStopId: "TEST:S1",
						toStopId: "TEST:S3",
					},
				]}
			/>,
		);
		const polylines = screen.getAllByTestId("polyline");
		expect(polylines).toHaveLength(2);

		// 全経路ポリライン: shape の全 3 点
		const basePositions = JSON.parse(polylines[0].dataset.positions ?? "[]");
		expect(basePositions).toHaveLength(3);

		// ハイライト区間: S1(43.77)～S3(43.79) に最も近い shape 点
		const hlPositions = JSON.parse(polylines[1].dataset.positions ?? "[]");
		expect(hlPositions.length).toBeGreaterThanOrEqual(1);
	});

	it("shapes がない場合はバス停座標で 2 本のポリラインが描画される", () => {
		render(
			<MapView
				db={db}
				routes={[
					{
						tripId: "TEST:T2",
						routeId: "TEST:R2",
						fromStopId: "TEST:S1",
						toStopId: "TEST:S3",
					},
				]}
			/>,
		);
		const polylines = screen.getAllByTestId("polyline");
		expect(polylines).toHaveLength(2);
	});

	it("全経路は薄い灰色、ハイライト区間は青色である", () => {
		render(
			<MapView
				db={db}
				routes={[
					{
						tripId: "TEST:T1",
						routeId: "TEST:R1",
						shapeId: "TEST:SH1",
						fromStopId: "TEST:S1",
						toStopId: "TEST:S3",
					},
				]}
			/>,
		);
		const polylines = screen.getAllByTestId("polyline");
		expect(polylines[0].dataset.color).toBe("#b0c4de");
		expect(polylines[1].dataset.color).toBe("#B0C1E2");
	});

	it("ルートが空の場合でも地図は表示される", () => {
		render(<MapView db={db} routes={[]} />);
		expect(screen.getByTestId("map-container")).toBeInTheDocument();
		expect(screen.queryByTestId("polyline")).toBeNull();
	});

	describe("auto-fit bounds", () => {
		it("ルートがある場合は fitBounds が呼ばれる", () => {
			mockFitBounds.mockClear();
			render(
				<MapView
					db={db}
					routes={[
						{
							tripId: "TEST:T1",
							routeId: "TEST:R1",
							shapeId: "TEST:SH1",
							fromStopId: "TEST:S1",
							toStopId: "TEST:S3",
						},
					]}
				/>,
			);
			expect(mockFitBounds).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ padding: [30, 30] }),
			);
		});

		it("ルートが空の場合は fitBounds が呼ばれない", () => {
			mockFitBounds.mockClear();
			render(<MapView db={db} routes={[]} />);
			expect(mockFitBounds).not.toHaveBeenCalled();
		});
	});

	describe("sepia tile filter", () => {
		it("ライトテーマでは暖色セピアフィルタが適用される", () => {
			document.documentElement.setAttribute("data-theme", "light");
			render(
				<MapView
					db={db}
					routes={[
						{
							tripId: "TEST:T1",
							routeId: "TEST:R1",
							shapeId: "TEST:SH1",
							fromStopId: "TEST:S1",
							toStopId: "TEST:S3",
						},
					]}
				/>,
			);
			const style = document.querySelector(
				"[data-testid='map-tile-filter']",
			);
			expect(style).toBeInTheDocument();
			expect(style?.textContent).toContain("sepia(1)");
			expect(style?.textContent).toContain("saturate(0.4)");
			expect(style?.textContent).toContain("brightness(1");
		});

		it("ダークテーマではダークセピアフィルタが適用される", () => {
			document.documentElement.setAttribute("data-theme", "dark");
			render(
				<MapView
					db={db}
					routes={[
						{
							tripId: "TEST:T1",
							routeId: "TEST:R1",
							shapeId: "TEST:SH1",
							fromStopId: "TEST:S1",
							toStopId: "TEST:S3",
						},
					]}
				/>,
			);
			const style = document.querySelector(
				"[data-testid='map-tile-filter']",
			);
			expect(style).toBeInTheDocument();
			expect(style?.textContent).toContain("sepia(1)");
			expect(style?.textContent).toContain("brightness(0.55)");
		});
	});

	describe("scroll behavior", () => {
		it("scrollWheelZoom が false に設定される", () => {
			render(
				<MapView
					db={db}
					routes={[
						{
							tripId: "TEST:T1",
							routeId: "TEST:R1",
							shapeId: "TEST:SH1",
							fromStopId: "TEST:S1",
							toStopId: "TEST:S3",
						},
					]}
				/>,
			);
			const container = screen.getByTestId("map-container");
			expect(container.dataset.scrollWheelZoom).toBe("false");
		});
	});
});
