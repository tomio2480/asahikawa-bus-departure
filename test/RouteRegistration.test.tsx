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
import { RouteRegistration } from "../src/components/RouteRegistration";
import { createSchema, loadGtfsData } from "../src/lib/gtfs-loader";
import type { GtfsData } from "../src/types/gtfs";
import type { RegisteredRouteEntry } from "../src/types/route-entry";

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

function renderComponent(routes: RegisteredRouteEntry[] = []) {
	const onAdd = vi.fn().mockResolvedValue(1);
	const onUpdate = vi.fn().mockResolvedValue(undefined);
	const onDelete = vi.fn().mockResolvedValue(undefined);

	render(
		<RouteRegistration
			db={db}
			routes={routes}
			onAdd={onAdd}
			onUpdate={onUpdate}
			onDelete={onDelete}
		/>,
	);

	return { onAdd, onUpdate, onDelete };
}

describe("RouteRegistration コンポーネント", () => {
	it("登録フォームが表示される", () => {
		renderComponent();
		expect(screen.getByText("経路を登録")).toBeInTheDocument();
		expect(screen.getByText("乗車バス停")).toBeInTheDocument();
		expect(screen.getByText("降車バス停")).toBeInTheDocument();
		expect(screen.getByText("徒歩所要時間（分）")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "登録" })).toBeInTheDocument();
	});

	it("経路一覧が空の場合は一覧テーブルが表示されない", () => {
		renderComponent([]);
		expect(screen.queryByText("登録済み経路")).not.toBeInTheDocument();
	});

	it("登録済み経路が一覧にバス停名で表示される", () => {
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 5 },
		];
		renderComponent(routes);
		expect(screen.getByText("登録済み経路")).toBeInTheDocument();
		expect(screen.getByText("旭川駅前")).toBeInTheDocument();
		expect(screen.getByText("市役所前")).toBeInTheDocument();
		expect(screen.getByText("5")).toBeInTheDocument();
	});

	it("乗車バス停未選択で登録するとエラーメッセージが表示される", async () => {
		renderComponent();

		const submitButton = screen.getByRole("button", { name: "登録" });
		await userEvent.click(submitButton);

		expect(
			screen.getByText("乗車バス停を選択してください"),
		).toBeInTheDocument();
	});

	it("バス停を選択して登録できる", async () => {
		const { onAdd } = renderComponent();

		// 乗車バス停を選択
		const comboboxes = screen.getAllByRole("combobox");
		await userEvent.type(comboboxes[0], "旭川駅");
		const fromOption = screen.getByText("旭川駅前");
		await userEvent.click(fromOption);

		// 降車バス停を選択
		await userEvent.type(comboboxes[1], "市役所");
		const toOption = screen.getByText("市役所前");
		await userEvent.click(toOption);

		// 徒歩時間を入力
		const walkInput = screen.getByLabelText("徒歩所要時間（分）");
		await userEvent.type(walkInput, "5");

		// 登録ボタンをクリック
		const submitButton = screen.getByRole("button", { name: "登録" });
		await userEvent.click(submitButton);

		expect(onAdd).toHaveBeenCalledWith({
			fromStopId: "test:S001",
			toStopId: "test:S002",
			walkMinutes: 5,
		});
	});

	it("徒歩所要時間が未入力で登録するとエラーになる", async () => {
		renderComponent();

		// バス停を選択
		const comboboxes = screen.getAllByRole("combobox");
		await userEvent.type(comboboxes[0], "旭川駅");
		await userEvent.click(screen.getByText("旭川駅前"));
		await userEvent.type(comboboxes[1], "市役所");
		await userEvent.click(screen.getByText("市役所前"));

		// 徒歩時間は入力しない
		await userEvent.click(screen.getByRole("button", { name: "登録" }));

		expect(
			screen.getByText("徒歩所要時間を入力してください"),
		).toBeInTheDocument();
	});

	it("編集ボタンで編集モードに切り替わる", async () => {
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 5 },
		];
		renderComponent(routes);

		await userEvent.click(screen.getByRole("button", { name: "編集" }));

		expect(screen.getByText("経路を編集")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "更新" })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "キャンセル" }),
		).toBeInTheDocument();
	});

	it("キャンセルボタンで編集モードを解除できる", async () => {
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 5 },
		];
		renderComponent(routes);

		await userEvent.click(screen.getByRole("button", { name: "編集" }));
		expect(screen.getByText("経路を編集")).toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
		expect(screen.getByText("経路を登録")).toBeInTheDocument();
	});

	it("削除ボタンで onDelete が呼ばれる", async () => {
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 5 },
		];
		const { onDelete } = renderComponent(routes);

		await userEvent.click(screen.getByRole("button", { name: "削除" }));
		expect(onDelete).toHaveBeenCalledWith(1);
	});

	it("同一バス停を選択して登録するとエラーメッセージが表示される", async () => {
		renderComponent();

		const comboboxes = screen.getAllByRole("combobox");
		await userEvent.type(comboboxes[0], "旭川駅");
		await userEvent.click(screen.getByText("旭川駅前"));
		await userEvent.type(comboboxes[1], "旭川駅");
		await userEvent.click(screen.getByText("旭川駅前"));

		const walkInput = screen.getByLabelText("徒歩所要時間（分）");
		await userEvent.type(walkInput, "5");

		await userEvent.click(screen.getByRole("button", { name: "登録" }));

		expect(
			screen.getByText(
				"乗車バス停と降車バス停には異なるバス停を選択してください",
			),
		).toBeInTheDocument();
	});

	it("負の徒歩所要時間で登録するとエラーになる", async () => {
		renderComponent();

		const comboboxes = screen.getAllByRole("combobox");
		await userEvent.type(comboboxes[0], "旭川駅");
		await userEvent.click(screen.getByText("旭川駅前"));
		await userEvent.type(comboboxes[1], "市役所");
		await userEvent.click(screen.getByText("市役所前"));

		// type="number" + min="0" の制約下では userEvent.type で "-" が入力できないため
		// fireEvent.change で直接値を設定する
		const walkInput = screen.getByLabelText("徒歩所要時間（分）");
		fireEvent.change(walkInput, { target: { value: "-3" } });

		await userEvent.click(screen.getByRole("button", { name: "登録" }));

		expect(
			screen.getByText("徒歩所要時間は0以上で入力してください"),
		).toBeInTheDocument();
	});

	it("複数の経路が一覧に表示される", () => {
		const routes: RegisteredRouteEntry[] = [
			{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 5 },
			{
				id: 2,
				fromStopId: "test:S002",
				toStopId: "test:S003",
				walkMinutes: 10,
			},
		];
		renderComponent(routes);

		const rows = screen.getAllByRole("row");
		// ヘッダ行 + データ行 2 件
		expect(rows).toHaveLength(3);
	});
});
