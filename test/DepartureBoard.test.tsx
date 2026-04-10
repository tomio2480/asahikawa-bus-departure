import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DepartureBoard } from "../src/components/DepartureBoard";
import type { DepartureGroup } from "../src/hooks/useDepartures";

afterEach(() => {
	cleanup();
});

function makeGroup(overrides?: Partial<DepartureGroup>): DepartureGroup {
	return {
		toStopId: "test:S002",
		toStopName: "市役所前",
		departures: [
			{
				tripId: "T001",
				routeId: "R001",
				routeName: "1番",
				headsign: "市役所方面",
				departureTime: "08:00:00",
				arrivalTime: "08:30:00",
				fromStopId: "test:S001",
				toStopId: "test:S002",
				shapeId: null,
				fare: { fareId: "F001", price: 290, currencyType: "JPY" },
			},
			{
				tripId: "T002",
				routeId: "R001",
				routeName: "1番",
				headsign: "市役所方面",
				departureTime: "09:00:00",
				arrivalTime: "09:30:00",
				fromStopId: "test:S001",
				toStopId: "test:S002",
				shapeId: null,
				fare: { fareId: "F001", price: 290, currencyType: "JPY" },
			},
		],
		...overrides,
	};
}

describe("DepartureBoard コンポーネント", () => {
	it("経路未登録の場合はメッセージを表示する", () => {
		render(
			<DepartureBoard
				groups={[]}
				lastUpdated={null}
				error={null}
				hasRoutes={false}
			/>,
		);
		expect(screen.getByText(/経路が登録されていません/)).toBeInTheDocument();
	});

	it("行き先が表示される", () => {
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		const headsigns = screen.getAllByText("市役所方面");
		expect(headsigns.length).toBeGreaterThanOrEqual(1);
	});

	it("発車時刻と到着時刻が HH:MM 形式で表示される", () => {
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		expect(screen.getByText("08:00")).toBeInTheDocument();
		expect(screen.getByText("08:30")).toBeInTheDocument();
	});

	it("路線名と行き先が表示される", () => {
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		const routeNames = screen.getAllByText("1番");
		expect(routeNames.length).toBeGreaterThanOrEqual(1);
		const headsigns = screen.getAllByText("市役所方面");
		expect(headsigns.length).toBeGreaterThanOrEqual(1);
	});

	it("複数の行先がプルダウンの選択肢に表示される", () => {
		const groups = [
			makeGroup(),
			makeGroup({
				toStopId: "test:S003",
				toStopName: "旭川四条駅",
				departures: [
					{
						tripId: "T003",
						routeId: "R002",
						routeName: "2番",
						headsign: "四条方面",
						departureTime: "08:15:00",
						arrivalTime: "08:45:00",
						fromStopId: "test:S001",
						toStopId: "test:S003",
						shapeId: null,
						fare: null,
					},
				],
			}),
		];
		render(
			<DepartureBoard
				groups={groups}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		const select = screen.getByRole("combobox");
		expect(select).toBeInTheDocument();
		const options = screen.getAllByRole("option");
		expect(options.length).toBe(3); // 全ての行先 + 市役所前 + 旭川四条駅
	});

	it("プルダウン選択で行先がフィルタされる", () => {
		const groups = [
			makeGroup(),
			makeGroup({
				toStopId: "test:S003",
				toStopName: "旭川四条駅",
				departures: [
					{
						tripId: "T003",
						routeId: "R002",
						routeName: "2番",
						headsign: "四条方面",
						departureTime: "08:15:00",
						arrivalTime: "08:45:00",
						fromStopId: "test:S001",
						toStopId: "test:S003",
						shapeId: null,
						fare: null,
					},
				],
			}),
		];
		render(
			<DepartureBoard
				groups={groups}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);

		const select = screen.getByRole("combobox");
		fireEvent.change(select, { target: { value: "test:S003" } });

		expect(screen.getByText("四条方面")).toBeInTheDocument();
		expect(screen.queryByText("市役所方面")).not.toBeInTheDocument();
	});

	it("複数グループの便が発車時刻順に表示される", () => {
		const groups = [
			makeGroup(),
			makeGroup({
				toStopId: "test:S003",
				toStopName: "旭川四条駅",
				departures: [
					{
						tripId: "T003",
						routeId: "R002",
						routeName: "2番",
						headsign: "四条方面",
						departureTime: "08:15:00",
						arrivalTime: "08:45:00",
						fromStopId: "test:S001",
						toStopId: "test:S003",
						shapeId: null,
						fare: null,
					},
				],
			}),
		];
		render(
			<DepartureBoard
				groups={groups}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);

		const tbody = screen.getAllByRole("rowgroup")[1]; // tbody
		const rows = within(tbody).getAllByRole("row");
		const times = rows.map(
			(row) => within(row).getAllByText(/^\d{2}:\d{2}$/)[0].textContent,
		);
		// 08:00, 08:15, 09:00 の順に並ぶことを確認
		expect(times).toEqual(["08:00", "08:15", "09:00"]);
	});

	it("発車予定がない場合はメッセージを表示する", () => {
		render(
			<DepartureBoard
				groups={[]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		expect(screen.getByText("現在の発車予定はありません")).toBeInTheDocument();
	});

	it("最終更新時刻が表示される", () => {
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		expect(screen.getByText(/最終更新/)).toBeInTheDocument();
	});

	it("テーブルヘッダーが表示される", () => {
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		expect(screen.getByText("出発目安")).toBeInTheDocument();
		expect(screen.getByText("乗車")).toBeInTheDocument();
		expect(screen.getByText("発車")).toBeInTheDocument();
		expect(screen.getByText("到着")).toBeInTheDocument();
		expect(screen.getByText("運賃")).toBeInTheDocument();
		expect(screen.getByText("路線")).toBeInTheDocument();
		expect(screen.getByText("行き先")).toBeInTheDocument();
	});

	it("エラー発生時はエラーメッセージを表示する", () => {
		render(
			<DepartureBoard
				groups={[]}
				lastUpdated={null}
				error={new Error("DB query failed")}
				hasRoutes={true}
			/>,
		);
		expect(
			screen.getByText(/発車案内の取得に失敗しました/),
		).toBeInTheDocument();
	});

	it("運賃が表示される", () => {
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		const fares = screen.getAllByText("290円");
		expect(fares.length).toBeGreaterThanOrEqual(1);
	});

	it("運賃がない場合はハイフンを表示する", () => {
		const group = makeGroup({
			departures: [
				{
					tripId: "T003",
					routeId: "R002",
					routeName: "2番",
					headsign: "四条方面",
					departureTime: "08:15:00",
					arrivalTime: "08:45:00",
					fromStopId: "test:S001",
					toStopId: "test:S003",
					shapeId: null,
					fare: null,
				},
			],
		});
		render(
			<DepartureBoard
				groups={[group]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		const dashes = screen.getAllByText("-");
		expect(dashes.length).toBeGreaterThanOrEqual(1);
	});

	it("出発済みの便に「出発済」バッジが表示される", () => {
		const group = makeGroup({
			departures: [
				{
					tripId: "T001",
					routeId: "R001",
					routeName: "1番",
					headsign: "市役所方面",
					departureTime: "08:00:00",
					arrivalTime: "08:30:00",
					fromStopId: "test:S001",
					toStopId: "test:S002",
					shapeId: null,
					isDeparted: true,
					fare: null,
				},
			],
		});
		render(
			<DepartureBoard
				groups={[group]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		expect(screen.getByText("出発済")).toBeInTheDocument();
	});

	it("事業者カラーインジケーターが表示される", () => {
		const group = makeGroup({
			departures: [
				{
					tripId: "T001",
					routeId: "dohoku_bus:R001",
					routeName: "1番",
					headsign: "市役所方面",
					departureTime: "08:00:00",
					arrivalTime: "08:30:00",
					fromStopId: "test:S001",
					toStopId: "test:S002",
					shapeId: null,
					fare: null,
				},
			],
		});
		render(
			<DepartureBoard
				groups={[group]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		const indicator = screen.getByTitle("道北バス");
		expect(indicator).toBeInTheDocument();
	});

	it("翌日の便に「始発以降の便」ラベルが表示される", () => {
		const group = makeGroup({ isNextDay: true });
		render(
			<DepartureBoard
				groups={[group]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		expect(screen.getByText("始発以降の便")).toBeInTheDocument();
	});

	it("全グループが翌日便の場合「現在の発車予定はありません」も表示される", () => {
		const group = makeGroup({ isNextDay: true });
		render(
			<DepartureBoard
				groups={[group]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		expect(screen.getByText("現在の発車予定はありません")).toBeInTheDocument();
		expect(screen.getByText("始発以降の便")).toBeInTheDocument();
	});

	it("fromStopName が表示される", () => {
		const group = makeGroup({
			departures: [
				{
					tripId: "T001",
					routeId: "R001",
					routeName: "1番",
					headsign: "市役所方面",
					departureTime: "08:00:00",
					arrivalTime: "08:30:00",
					fromStopId: "test:S001",
					toStopId: "test:S002",
					shapeId: null,
					fromStopName: "旭川駅前",
					fare: null,
				},
			],
		});
		render(
			<DepartureBoard
				groups={[group]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		expect(screen.getByText("旭川駅前")).toBeInTheDocument();
	});

	it("Asaca 乗り継ぎ割引の注釈が表示される", () => {
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		expect(screen.getByText(/Asaca/)).toBeInTheDocument();
		expect(screen.getByText(/100円引き/)).toBeInTheDocument();
	});
});
