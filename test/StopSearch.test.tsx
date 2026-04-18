import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import initSqlJs from "sql.js";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { StopSearch } from "../src/components/StopSearch";
import { createSchema, loadGtfsData } from "../src/lib/gtfs-loader";
import type { StopSearchResult } from "../src/lib/stop-search";
import type { GtfsData } from "../src/types/gtfs";

const testStops: GtfsData["stops"] = [
	{
		stop_id: "S001",
		stop_name: "旭川駅前",
		stop_lat: 43.7631,
		stop_lon: 142.3582,
	},
	{
		stop_id: "S002",
		stop_name: "市役所前",
		stop_lat: 43.7701,
		stop_lon: 142.3651,
	},
	{
		stop_id: "S003",
		stop_name: "旭川四条駅",
		stop_lat: 43.7551,
		stop_lon: 142.3612,
	},
];

const emptyGtfsBase: GtfsData = {
	agency: [{ agency_id: "A001", agency_name: "テストバス" }],
	stops: [],
	routes: [],
	trips: [],
	stop_times: [],
	calendar: [],
	calendar_dates: [],
	shapes: [],
	fare_attributes: [],
	fare_rules: [],
};

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: InstanceType<(typeof SQL)["Database"]>;

beforeAll(async () => {
	SQL = await initSqlJs();
});

beforeEach(() => {
	db = new SQL.Database();
	createSchema(db);
	loadGtfsData(db, { ...emptyGtfsBase, stops: testStops }, "test");
});

afterEach(() => {
	cleanup();
	db.close();
});

describe("StopSearch コンポーネント", () => {
	it("ラベルが表示される", () => {
		const onSelect = vi.fn();
		render(<StopSearch db={db} label="乗車バス停" onSelect={onSelect} />);
		expect(screen.getByText("乗車バス停")).toBeInTheDocument();
	});

	it("プレースホルダーが表示される", () => {
		const onSelect = vi.fn();
		render(<StopSearch db={db} label="乗車バス停" onSelect={onSelect} />);
		expect(screen.getByPlaceholderText("バス停名を入力")).toBeInTheDocument();
	});

	it("カスタムプレースホルダーを設定できる", () => {
		const onSelect = vi.fn();
		render(
			<StopSearch
				db={db}
				label="乗車バス停"
				onSelect={onSelect}
				placeholder="検索..."
			/>,
		);
		expect(screen.getByPlaceholderText("検索...")).toBeInTheDocument();
	});

	it("テキスト入力で検索結果が表示される", async () => {
		const onSelect = vi.fn();
		render(<StopSearch db={db} label="乗車バス停" onSelect={onSelect} />);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "旭川");

		expect(screen.getByRole("listbox")).toBeInTheDocument();
		expect(screen.getByText("旭川駅前")).toBeInTheDocument();
		expect(screen.getByText("旭川四条駅")).toBeInTheDocument();
	});

	it("該当なしの場合はドロップダウンが表示されない", async () => {
		const onSelect = vi.fn();
		render(<StopSearch db={db} label="乗車バス停" onSelect={onSelect} />);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "札幌");

		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	it("検索結果をクリックして選択できる", async () => {
		const onSelect = vi.fn();
		render(<StopSearch db={db} label="乗車バス停" onSelect={onSelect} />);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "市役所");

		const option = screen.getByText("市役所前");
		await userEvent.click(option);

		expect(onSelect).toHaveBeenCalledWith({
			stop_id: "test:S002",
			stop_name: "市役所前",
			clusterStopIds: ["test:S002"],
		});
		expect(input).toHaveValue("市役所前");
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	it("ArrowDown/ArrowUp でフォーカスを移動できる", async () => {
		const onSelect = vi.fn();
		render(<StopSearch db={db} label="乗車バス停" onSelect={onSelect} />);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "旭川");

		await userEvent.keyboard("{ArrowDown}");
		const options = screen.getAllByRole("option");
		expect(options[0]).toHaveAttribute("aria-selected", "true");

		await userEvent.keyboard("{ArrowDown}");
		expect(options[1]).toHaveAttribute("aria-selected", "true");
		expect(options[0]).toHaveAttribute("aria-selected", "false");
	});

	it("Enter キーで選択できる", async () => {
		const onSelect = vi.fn();
		render(<StopSearch db={db} label="乗車バス停" onSelect={onSelect} />);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "旭川");
		await userEvent.keyboard("{ArrowDown}");
		await userEvent.keyboard("{Enter}");

		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	it("Escape キーでドロップダウンが閉じる", async () => {
		const onSelect = vi.fn();
		render(<StopSearch db={db} label="乗車バス停" onSelect={onSelect} />);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "旭川");
		expect(screen.getByRole("listbox")).toBeInTheDocument();

		await userEvent.keyboard("{Escape}");
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	it("selectedStop が渡された場合に初期値として表示される", () => {
		const onSelect = vi.fn();
		const selected: StopSearchResult = {
			stop_id: "test:S001",
			stop_name: "旭川駅前",
			clusterStopIds: ["test:S001"],
		};
		render(
			<StopSearch
				db={db}
				label="乗車バス停"
				onSelect={onSelect}
				selectedStop={selected}
			/>,
		);

		const input = screen.getByRole("combobox");
		expect(input).toHaveValue("旭川駅前");
	});

	it("入力を空にするとドロップダウンが閉じる", async () => {
		const onSelect = vi.fn();
		render(<StopSearch db={db} label="乗車バス停" onSelect={onSelect} />);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "旭川");
		expect(screen.getByRole("listbox")).toBeInTheDocument();

		await userEvent.clear(input);
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	it("aria-expanded が正しく設定される", async () => {
		const onSelect = vi.fn();
		render(<StopSearch db={db} label="乗車バス停" onSelect={onSelect} />);

		const input = screen.getByRole("combobox");
		expect(input).toHaveAttribute("aria-expanded", "false");

		await userEvent.type(input, "旭川");
		expect(input).toHaveAttribute("aria-expanded", "true");
	});

	it("候補が 0 件のクエリでは aria-expanded が false のままになる", async () => {
		// CodeRabbit 指摘: listbox が描画されないのに aria-expanded="true" は
		// WAI-ARIA combobox パターンに違反する。描画条件と aria-expanded は
		// 「候補が 1 件以上かつユーザーが閉じていない」の派生値で一元化する。
		const onSelect = vi.fn();
		render(<StopSearch db={db} label="乗車バス停" onSelect={onSelect} />);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "該当しない文字列xyz");

		// listbox が描画されていない
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		// aria-expanded は実在する listbox の状態を反映する必要がある
		expect(input).toHaveAttribute("aria-expanded", "false");
	});

	it("ドロップダウン外クリックで閉じる", async () => {
		const onSelect = vi.fn();
		render(
			<div>
				<StopSearch db={db} label="乗車バス停" onSelect={onSelect} />
				<button type="button">外側ボタン</button>
			</div>,
		);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "旭川");
		expect(screen.getByRole("listbox")).toBeInTheDocument();

		fireEvent.mouseDown(screen.getByText("外側ボタン"));
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});
});

describe("StopSearch（到達可能性フィルタ）", () => {
	// Issue #90: 乗降車バス停の組み合わせで直通便が無いものを
	// ドロップダウンから除外するために reachabilityFilter props を受け取る。
	const stops: GtfsData["stops"] = [
		{ stop_id: "S001", stop_name: "A停", stop_lat: 43.76, stop_lon: 142.35 },
		{ stop_id: "S002", stop_name: "B停", stop_lat: 43.77, stop_lon: 142.36 },
		{ stop_id: "S003", stop_name: "C停", stop_lat: 43.78, stop_lon: 142.37 },
		{ stop_id: "S004", stop_name: "D停", stop_lat: 43.79, stop_lon: 142.38 },
	];

	const routes: GtfsData["routes"] = [
		{ route_id: "R001", agency_id: "A001", route_short_name: "1" },
	];

	const calendar: GtfsData["calendar"] = [
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
	];

	const trips: GtfsData["trips"] = [
		{ trip_id: "T001", route_id: "R001", service_id: "weekday" },
	];

	// T001: A → B → C の直通便のみ。D は孤立。
	const stopTimes: GtfsData["stop_times"] = [
		{
			trip_id: "T001",
			arrival_time: "08:00:00",
			departure_time: "08:00:00",
			stop_id: "S001",
			stop_sequence: 1,
		},
		{
			trip_id: "T001",
			arrival_time: "08:05:00",
			departure_time: "08:05:00",
			stop_id: "S002",
			stop_sequence: 2,
		},
		{
			trip_id: "T001",
			arrival_time: "08:10:00",
			departure_time: "08:10:00",
			stop_id: "S003",
			stop_sequence: 3,
		},
	];

	beforeEach(() => {
		// 外側 beforeEach で生成された db を上書きする前に明示的に解放する
		// （sql.js の WASM インスタンスはリーク防止のため close が必要）
		db.close();
		db = new SQL.Database();
		createSchema(db);
		loadGtfsData(
			db,
			{
				...emptyGtfsBase,
				stops,
				routes,
				calendar,
				trips,
				stop_times: stopTimes,
			},
			"test",
		);
	});

	it("reachabilityFilter 未指定時は全候補を表示する", async () => {
		const onSelect = vi.fn();
		render(<StopSearch db={db} label="降車バス停" onSelect={onSelect} />);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "停");
		expect(screen.getByText("A停")).toBeInTheDocument();
		expect(screen.getByText("B停")).toBeInTheDocument();
		expect(screen.getByText("C停")).toBeInTheDocument();
		expect(screen.getByText("D停")).toBeInTheDocument();
	});

	it("reachableFromOrigin 指定時は origin から直通で到達可能な候補のみ表示する", async () => {
		const onSelect = vi.fn();
		render(
			<StopSearch
				db={db}
				label="降車バス停"
				onSelect={onSelect}
				reachabilityFilter={{ reachableFromOrigin: ["test:S001"] }}
			/>,
		);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "停");
		// A→B→C の直通便があるため B, C はヒット、孤立した D と origin の A は除外
		expect(screen.getByText("B停")).toBeInTheDocument();
		expect(screen.getByText("C停")).toBeInTheDocument();
		expect(screen.queryByText("A停")).not.toBeInTheDocument();
		expect(screen.queryByText("D停")).not.toBeInTheDocument();
	});

	it("reachableToDestination 指定時は destination に直通で到達できる候補のみ表示する", async () => {
		const onSelect = vi.fn();
		render(
			<StopSearch
				db={db}
				label="乗車バス停"
				onSelect={onSelect}
				reachabilityFilter={{ reachableToDestination: ["test:S003"] }}
			/>,
		);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "停");
		// C に直通で到達できるのは A, B のみ
		expect(screen.getByText("A停")).toBeInTheDocument();
		expect(screen.getByText("B停")).toBeInTheDocument();
		expect(screen.queryByText("C停")).not.toBeInTheDocument();
		expect(screen.queryByText("D停")).not.toBeInTheDocument();
	});

	it("reachabilityFilter の変更時にドロップダウン表示が追従する", async () => {
		const onSelect = vi.fn();
		const { rerender } = render(
			<StopSearch db={db} label="降車バス停" onSelect={onSelect} />,
		);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "停");
		expect(screen.getByText("D停")).toBeInTheDocument();

		// フィルタを追加して再描画 → D は除外されるべき
		rerender(
			<StopSearch
				db={db}
				label="降車バス停"
				onSelect={onSelect}
				reachabilityFilter={{ reachableFromOrigin: ["test:S001"] }}
			/>,
		);
		// 既に開いているドロップダウンがフィルタ変更に応じて更新される
		expect(screen.queryByText("D停")).not.toBeInTheDocument();
		expect(screen.getByText("B停")).toBeInTheDocument();
	});
});
