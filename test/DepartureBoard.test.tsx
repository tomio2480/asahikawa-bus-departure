import { cleanup, render, screen } from "@testing-library/react";
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

	it("降車バス停名がグループ見出しとして表示される", () => {
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		expect(screen.getByText("市役所前")).toBeInTheDocument();
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

	it("複数の降車バス停がそれぞれグルーピングされる", () => {
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
		expect(screen.getByText("市役所前")).toBeInTheDocument();
		expect(screen.getByText("旭川四条駅")).toBeInTheDocument();
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
		expect(screen.getByText("発車")).toBeInTheDocument();
		expect(screen.getByText("到着")).toBeInTheDocument();
		expect(screen.getByText("路線")).toBeInTheDocument();
		expect(screen.getByText("行き先")).toBeInTheDocument();
		expect(screen.getByText("運賃")).toBeInTheDocument();
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
		expect(screen.getByText("-")).toBeInTheDocument();
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
