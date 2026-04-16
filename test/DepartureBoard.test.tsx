import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

	it("複数の行先がタグとして表示される", () => {
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
		const tag1 = screen.getByRole("button", { name: "市役所前" });
		const tag2 = screen.getByRole("button", { name: "旭川四条駅" });
		expect(tag1).toBeInTheDocument();
		expect(tag2).toBeInTheDocument();
		// 未選択状態では aria-pressed が false
		expect(tag1).toHaveAttribute("aria-pressed", "false");
		expect(tag2).toHaveAttribute("aria-pressed", "false");
	});

	it("selectedDestinations で行先がフィルタされる", () => {
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
				selectedDestinations={new Set(["test:S003"])}
			/>,
		);

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
			(row) => within(row).getAllByRole("cell")[2].textContent, // 発車カラム（3番目）
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
		const headers = screen.getAllByRole("columnheader");
		const headerTexts = headers.map((h) => h.textContent?.replace(/ [▲▼]/, ""));
		expect(headerTexts).toEqual([
			"出発目安",
			"乗車",
			"発車",
			"到着",
			"運賃",
			"路線",
			"行き先",
		]);
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

	it("兄弟停留所 ID が異なってもフィルタで正しく絞り込める", () => {
		const groups: DepartureGroup[] = [
			{
				toStopId: "registered:S002",
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
						toStopId: "sibling:S002_1",
						shapeId: null,
						fare: null,
					},
				],
			},
			{
				toStopId: "registered:S003",
				toStopName: "旭川四条駅",
				departures: [
					{
						tripId: "T002",
						routeId: "R002",
						routeName: "2番",
						headsign: "四条方面",
						departureTime: "08:15:00",
						arrivalTime: "08:45:00",
						fromStopId: "test:S001",
						toStopId: "sibling:S003_1",
						shapeId: null,
						fare: null,
					},
				],
			},
		];
		render(
			<DepartureBoard
				groups={groups}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
				selectedDestinations={new Set(["registered:S003"])}
			/>,
		);

		expect(screen.getByText("四条方面")).toBeInTheDocument();
		expect(screen.queryByText("市役所方面")).not.toBeInTheDocument();
	});

	it("onDestinationToggle がタグクリックで呼ばれる", () => {
		const onToggle = vi.fn();
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
				onDestinationToggle={onToggle}
			/>,
		);

		const tag = screen.getByRole("button", { name: "旭川四条駅" });
		fireEvent.click(tag);

		expect(onToggle).toHaveBeenCalledWith("test:S003");
	});

	it("複数の行き先を選択するとそれらのみ表示される", () => {
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
			makeGroup({
				toStopId: "test:S004",
				toStopName: "旭川空港",
				departures: [
					{
						tripId: "T004",
						routeId: "R003",
						routeName: "77番",
						headsign: "空港方面",
						departureTime: "08:30:00",
						arrivalTime: "09:00:00",
						fromStopId: "test:S001",
						toStopId: "test:S004",
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
				selectedDestinations={new Set(["test:S002", "test:S003"])}
			/>,
		);

		expect(screen.getAllByText("市役所方面").length).toBeGreaterThan(0);
		expect(screen.getAllByText("四条方面").length).toBeGreaterThan(0);
		expect(screen.queryByText("空港方面")).not.toBeInTheDocument();
	});

	it("何も選択していない場合は全行き先が表示される", () => {
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
				selectedDestinations={new Set()}
			/>,
		);

		expect(screen.getAllByText("市役所方面").length).toBeGreaterThan(0);
		expect(screen.getAllByText("四条方面").length).toBeGreaterThan(0);
	});

	it("ホバー時に onRouteHover が routeId を含むキーで呼ばれる", async () => {
		const onHover = vi.fn();
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
				onRouteHover={onHover}
			/>,
		);
		const rows = screen.getAllByRole("row");
		// thead の行を除いた最初のデータ行
		const dataRow = rows[1];
		fireEvent.mouseEnter(dataRow);
		// routeId-fromStopId-toStopId 形式であること
		expect(onHover).toHaveBeenCalledWith("R001-test:S001-test:S002");
	});

	it("異なる routeId の便は別のルートキーを持つ", async () => {
		const onHover = vi.fn();
		const groups: DepartureGroup[] = [
			{
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
						fare: null,
					},
					{
						tripId: "T002",
						routeId: "R002",
						routeName: "2番",
						headsign: "市役所方面",
						departureTime: "08:15:00",
						arrivalTime: "08:45:00",
						fromStopId: "test:S001",
						toStopId: "test:S002",
						shapeId: null,
						fare: null,
					},
				],
			},
		];
		render(
			<DepartureBoard
				groups={groups}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
				onRouteHover={onHover}
			/>,
		);
		const rows = screen.getAllByRole("row");
		fireEvent.mouseEnter(rows[1]); // R001 の行
		expect(onHover).toHaveBeenCalledWith("R001-test:S001-test:S002");
		fireEvent.mouseEnter(rows[2]); // R002 の行
		expect(onHover).toHaveBeenCalledWith("R002-test:S001-test:S002");
	});

	it("クリックで onRoutePinToggle が呼ばれる", () => {
		const onPin = vi.fn();
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
				onRoutePinToggle={onPin}
			/>,
		);
		const rows = screen.getAllByRole("row");
		fireEvent.click(rows[1]);
		expect(onPin).toHaveBeenCalledWith("R001-test:S001-test:S002");
	});

	it("Enter キーで onRoutePinToggle が呼ばれる", () => {
		const onPin = vi.fn();
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
				onRoutePinToggle={onPin}
			/>,
		);
		const rows = screen.getAllByRole("row");
		fireEvent.keyDown(rows[1], { key: "Enter" });
		expect(onPin).toHaveBeenCalledWith("R001-test:S001-test:S002");
	});

	it("Space キーで onRoutePinToggle が呼ばれる", () => {
		const onPin = vi.fn();
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
				onRoutePinToggle={onPin}
			/>,
		);
		const rows = screen.getAllByRole("row");
		fireEvent.keyDown(rows[1], { key: " " });
		expect(onPin).toHaveBeenCalledWith("R001-test:S001-test:S002");
	});

	it("pinnedRouteKey に一致する行に固定スタイルが適用される", () => {
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
				pinnedRouteKey="R001-test:S001-test:S002"
			/>,
		);
		const rows = screen.getAllByRole("row");
		expect(rows[1].className).toContain("bg-info/20");
	});

	it("hoveredRouteKey に一致する行にホバースタイルが適用される", () => {
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
				hoveredRouteKey="R001-test:S001-test:S002"
			/>,
		);
		const rows = screen.getAllByRole("row");
		expect(rows[1].className).toContain("bg-info/10");
	});

	it("固定とホバーが同時にある場合、固定スタイルが優先される", () => {
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
				pinnedRouteKey="R001-test:S001-test:S002"
				hoveredRouteKey="R001-test:S001-test:S002"
			/>,
		);
		const rows = screen.getAllByRole("row");
		expect(rows[1].className).toContain("bg-info/20");
		expect(rows[1].className).not.toContain("bg-info/10");
	});

	it("発車ヘッダークリックでソート方向が切り替わり行順序が反転する", () => {
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		const headers = screen.getAllByRole("columnheader");
		const departureHeader = headers[2]; // 出発目安, 乗車, 発車
		// 初期状態: 昇順
		expect(departureHeader.textContent).toContain("▲");
		const tbody = screen.getAllByRole("rowgroup")[1];
		const rowsBefore = within(tbody).getAllByRole("row");
		const timesBefore = rowsBefore.map(
			(row) => within(row).getAllByRole("cell")[2].textContent,
		);
		expect(timesBefore).toEqual(["08:00", "09:00"]);
		// クリックで降順に
		fireEvent.click(departureHeader);
		expect(departureHeader.textContent).toContain("▼");
		const rowsAfter = within(tbody).getAllByRole("row");
		const timesAfter = rowsAfter.map(
			(row) => within(row).getAllByRole("cell")[2].textContent,
		);
		expect(timesAfter).toEqual(["09:00", "08:00"]);
	});

	it("出発目安ヘッダークリックでソートキーが切り替わる", () => {
		render(
			<DepartureBoard
				groups={[makeGroup()]}
				lastUpdated={new Date()}
				error={null}
				hasRoutes={true}
			/>,
		);
		const headers = screen.getAllByRole("columnheader");
		const leaveByHeader = headers[0]; // 出発目安
		const departureHeader = headers[2]; // 発車
		// 初期状態: 発車に▲
		expect(departureHeader.textContent).toContain("▲");
		expect(leaveByHeader.textContent).not.toContain("▲");
		// 出発目安をクリック
		fireEvent.click(leaveByHeader);
		expect(leaveByHeader.textContent).toContain("▲");
		expect(departureHeader.textContent).not.toContain("▲");
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
