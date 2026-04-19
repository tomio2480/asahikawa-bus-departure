import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps, useState } from "react";
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

/**
 * Issue #99: StopSearch を完全制御コンポーネント化した後のテスト用ラッパー。
 *
 * 従来（内部 useState 版）のテストは query/onQueryChange を意識せずに
 * `<StopSearch ... />` を直接レンダリングしていた。新 API では親が
 * query を保持する契約になったため、テスト側も query state を保持する
 * 薄い wrapper を経由させる。初期値は selectedStop.stop_name から
 * 引き出し、旧挙動（選択済み stop を渡すと input に名称が表示される）を
 * そのまま再現する。
 *
 * **スコープの制約**（gemini-code-assist #102 レビュー対応）：
 * 本 wrapper は「初回マウント時のみ `selectedStop.stop_name` を query の
 * 初期値として取り込み、以降は query と selectedStop を同期しない」最小
 * 変換器として設計している。`useEffect` による props→state 同期は敢えて
 * 持たない（Issue #99 のリファクタ対象そのものであり、wrapper に戻すと
 * 本末転倒になるため）。
 *
 * したがって、初回マウント後に `selectedStop` prop を差し替えるような
 * テスト（`rerender` で `selectedStop` だけ変更するケース）には対応しない。
 * 将来そのようなテストが必要になった場合は、本 wrapper を拡張せず、
 * `StopSearch` を直接使用し、親テストコンポーネント側で `query` と
 * `selectedStop` をまとめて制御する形（新 API 本来の使い方）で対応する。
 */
type ControlledStopSearchProps = Omit<
	ComponentProps<typeof StopSearch>,
	"query" | "onQueryChange"
> & {
	initialQuery?: string;
};

function ControlledStopSearch({
	initialQuery,
	selectedStop,
	...rest
}: ControlledStopSearchProps) {
	const [query, setQuery] = useState(
		initialQuery ?? selectedStop?.stop_name ?? "",
	);
	return (
		<StopSearch
			{...rest}
			selectedStop={selectedStop}
			query={query}
			onQueryChange={setQuery}
		/>
	);
}

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
		render(
			<ControlledStopSearch db={db} label="乗車バス停" onSelect={onSelect} />,
		);
		expect(screen.getByText("乗車バス停")).toBeInTheDocument();
	});

	it("プレースホルダーが表示される", () => {
		const onSelect = vi.fn();
		render(
			<ControlledStopSearch db={db} label="乗車バス停" onSelect={onSelect} />,
		);
		expect(screen.getByPlaceholderText("バス停名を入力")).toBeInTheDocument();
	});

	it("カスタムプレースホルダーを設定できる", () => {
		const onSelect = vi.fn();
		render(
			<ControlledStopSearch
				db={db}
				label="乗車バス停"
				onSelect={onSelect}
				placeholder="検索..."
			/>,
		);
		expect(screen.getByPlaceholderText("検索...")).toBeInTheDocument();
	});

	it("query prop が input の value として反映される（fully controlled API）", () => {
		// Issue #99: StopSearch は props→state 同期 useEffect を排した
		// 完全制御コンポーネントとする。親が保持する query state がそのまま
		// input の value になり、内部 useState を介さないことを保証する。
		const onSelect = vi.fn();
		const onQueryChange = vi.fn();
		render(
			<StopSearch
				db={db}
				label="乗車バス停"
				onSelect={onSelect}
				query="旭川駅"
				onQueryChange={onQueryChange}
			/>,
		);
		const input = screen.getByRole("combobox") as HTMLInputElement;
		expect(input.value).toBe("旭川駅");
	});

	it("query prop の変更が input の value に即時反映される（fully controlled API）", () => {
		// Issue #99: 親が query を書き換えた場合（handleEdit / resetForm の
		// 親側 setFormState 経由）、次の render で input.value が新しい値に
		// 反映される。内部 state を介さないため、同期 useEffect も
		// suppress フラグも不要になる。
		const onSelect = vi.fn();
		const onQueryChange = vi.fn();
		const { rerender } = render(
			<StopSearch
				db={db}
				label="乗車バス停"
				onSelect={onSelect}
				query=""
				onQueryChange={onQueryChange}
			/>,
		);
		const input = screen.getByRole("combobox") as HTMLInputElement;
		expect(input.value).toBe("");

		rerender(
			<StopSearch
				db={db}
				label="乗車バス停"
				onSelect={onSelect}
				query="市役所前"
				onQueryChange={onQueryChange}
			/>,
		);
		expect(input.value).toBe("市役所前");
	});

	it("テキスト入力で検索結果が表示される", async () => {
		const onSelect = vi.fn();
		render(
			<ControlledStopSearch db={db} label="乗車バス停" onSelect={onSelect} />,
		);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "旭川");

		expect(screen.getByRole("listbox")).toBeInTheDocument();
		expect(screen.getByText("旭川駅前")).toBeInTheDocument();
		expect(screen.getByText("旭川四条駅")).toBeInTheDocument();
	});

	it("該当なしの場合はドロップダウンが表示されない", async () => {
		const onSelect = vi.fn();
		render(
			<ControlledStopSearch db={db} label="乗車バス停" onSelect={onSelect} />,
		);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "札幌");

		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	it("検索結果をクリックして選択できる", async () => {
		const onSelect = vi.fn();
		render(
			<ControlledStopSearch db={db} label="乗車バス停" onSelect={onSelect} />,
		);

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
		render(
			<ControlledStopSearch db={db} label="乗車バス停" onSelect={onSelect} />,
		);

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
		render(
			<ControlledStopSearch db={db} label="乗車バス停" onSelect={onSelect} />,
		);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "旭川");
		await userEvent.keyboard("{ArrowDown}");
		await userEvent.keyboard("{Enter}");

		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	it("Escape キーでドロップダウンが閉じる", async () => {
		const onSelect = vi.fn();
		render(
			<ControlledStopSearch db={db} label="乗車バス停" onSelect={onSelect} />,
		);

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
			<ControlledStopSearch
				db={db}
				label="乗車バス停"
				onSelect={onSelect}
				selectedStop={selected}
			/>,
		);

		const input = screen.getByRole("combobox");
		expect(input).toHaveValue("旭川駅前");
	});

	// 親（RouteRegistration）の form state と子（StopSearch）の query state が
	// 乖離すると、ユーザーが候補から選ばずに入力を書き換えても form state は
	// 最初に選択した stop のまま残り、submit 時に実在性・到達可能性の再検証が
	// 走らず誤った経路が登録される（RouteRegistration 側で観測されたバグ）。
	// 選択状態は「入力値が選択済みの stop_name と一致している」場合にのみ
	// 維持される契約とし、乖離したら onSelect(null) で親に通知する。
	it("selectedStop が渡された状態で入力値を変更すると onSelect(null) が呼ばれる", async () => {
		const onSelect = vi.fn();
		const selected: StopSearchResult = {
			stop_id: "test:S001",
			stop_name: "旭川駅前",
			clusterStopIds: ["test:S001"],
		};
		render(
			<ControlledStopSearch
				db={db}
				label="乗車バス停"
				onSelect={onSelect}
				selectedStop={selected}
			/>,
		);

		const input = screen.getByRole("combobox");
		// selectedStop.stop_name と異なる文字列に書き換える（末尾に文字追加）
		await userEvent.type(input, "aaa");

		expect(onSelect).toHaveBeenCalledWith(null);
	});

	// selectedStop を渡して初期マウントした直後、ControlledStopSearch wrapper の
	// useState 初期化子が selectedStop.stop_name を query に取り込んだ状態で
	// onSelect(null) が誤発火しないことを確認する。ここで null が通知されると
	// 親の form state を破壊するループになるため、マウント直後の防御的テスト
	// として残す。
	it("selectedStop 初期マウント時に onSelect(null) は呼ばれない", () => {
		const onSelect = vi.fn();
		const selected: StopSearchResult = {
			stop_id: "test:S001",
			stop_name: "旭川駅前",
			clusterStopIds: ["test:S001"],
		};
		render(
			<ControlledStopSearch
				db={db}
				label="乗車バス停"
				onSelect={onSelect}
				selectedStop={selected}
			/>,
		);

		expect(onSelect).not.toHaveBeenCalled();
	});

	it("入力を空にするとドロップダウンが閉じる", async () => {
		const onSelect = vi.fn();
		render(
			<ControlledStopSearch db={db} label="乗車バス停" onSelect={onSelect} />,
		);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "旭川");
		expect(screen.getByRole("listbox")).toBeInTheDocument();

		await userEvent.clear(input);
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	it("aria-expanded が正しく設定される", async () => {
		const onSelect = vi.fn();
		render(
			<ControlledStopSearch db={db} label="乗車バス停" onSelect={onSelect} />,
		);

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
		render(
			<ControlledStopSearch db={db} label="乗車バス停" onSelect={onSelect} />,
		);

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
				<ControlledStopSearch db={db} label="乗車バス停" onSelect={onSelect} />
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
		render(
			<ControlledStopSearch db={db} label="降車バス停" onSelect={onSelect} />,
		);

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
			<ControlledStopSearch
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
			<ControlledStopSearch
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
			<ControlledStopSearch db={db} label="降車バス停" onSelect={onSelect} />,
		);

		const input = screen.getByRole("combobox");
		await userEvent.type(input, "停");
		expect(screen.getByText("D停")).toBeInTheDocument();

		// フィルタを追加して再描画 → D は除外されるべき
		rerender(
			<ControlledStopSearch
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
