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
