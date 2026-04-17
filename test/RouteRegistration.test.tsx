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

		// 徒歩時間を入力（デフォルト値をクリアしてから入力）
		const walkInput = screen.getByLabelText("徒歩所要時間（分）");
		await userEvent.clear(walkInput);
		await userEvent.type(walkInput, "5");

		// 登録ボタンをクリック
		const submitButton = screen.getByRole("button", { name: "登録" });
		await userEvent.click(submitButton);

		expect(onAdd).toHaveBeenCalledWith({
			fromStopId: "test:S001",
			toStopId: "test:S002",
			walkMinutes: 5,
			notifyEnabled: false,
		});
	});

	it("徒歩所要時間のデフォルト値が10である", () => {
		renderComponent();
		const walkInput = screen.getByLabelText("徒歩所要時間（分）");
		expect(walkInput).toHaveValue(10);
	});

	it("徒歩所要時間を空にして登録するとデフォルト値10で登録される", async () => {
		const { onAdd } = renderComponent();

		const comboboxes = screen.getAllByRole("combobox");
		await userEvent.type(comboboxes[0], "旭川駅");
		await userEvent.click(screen.getByText("旭川駅前"));
		await userEvent.type(comboboxes[1], "市役所");
		await userEvent.click(screen.getByText("市役所前"));

		// 徒歩時間をクリア
		const walkInput = screen.getByLabelText("徒歩所要時間（分）");
		await userEvent.clear(walkInput);

		await userEvent.click(screen.getByRole("button", { name: "登録" }));

		expect(onAdd).toHaveBeenCalledWith({
			fromStopId: "test:S001",
			toStopId: "test:S002",
			walkMinutes: 10,
			notifyEnabled: false,
		});
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

	it("登録済み経路のトグルをクリックすると通知が ON になる", async () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
		];
		const onRequestPermission = vi.fn().mockResolvedValue("granted");
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
				onRequestNotificationPermission={onRequestPermission}
			/>,
		);

		const toggle = screen.getByRole("checkbox", { name: "通知の切り替え" });
		await userEvent.click(toggle);

		expect(onUpdate).toHaveBeenCalledWith({
			id: 1,
			fromStopId: "test:S001",
			toStopId: "test:S002",
			walkMinutes: 5,
			notifyEnabled: true,
		});
	});

	it("permission が denied でもトグルは機能しユーザーの意図を保存する", async () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
		];
		const onRequestPermission = vi.fn().mockResolvedValue("denied");
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
				onRequestNotificationPermission={onRequestPermission}
			/>,
		);

		const toggle = screen.getByRole("checkbox", { name: "通知の切り替え" });
		await userEvent.click(toggle);

		// permission が denied でも onUpdate は呼ばれる（意図を保存する）
		expect(onUpdate).toHaveBeenCalledWith({
			id: 1,
			fromStopId: "test:S001",
			toStopId: "test:S002",
			walkMinutes: 5,
			notifyEnabled: true,
		});
	});

	it("permission が denied のとき警告メッセージが表示される", () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
		];
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
				notifyPermission="denied"
			/>,
		);

		expect(
			screen.getByText(
				/ブラウザの通知が拒否されています/,
			),
		).toBeInTheDocument();
	});

	it("登録済み経路のトグルをクリックすると通知が OFF になる", async () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: true,
			},
		];
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

		const toggle = screen.getByRole("checkbox", { name: "通知の切り替え" });
		await userEvent.click(toggle);

		expect(onUpdate).toHaveBeenCalledWith({
			id: 1,
			fromStopId: "test:S001",
			toStopId: "test:S002",
			walkMinutes: 5,
			notifyEnabled: false,
		});
	});

	describe("通知タイミング UI", () => {
		const notifyEnabledRoutes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: true,
			},
		];

		it("hasNotifyEnabledRoutes=true のとき現在値が明示表示される", () => {
			render(
				<RouteRegistration
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={vi.fn().mockResolvedValue(undefined)}
					onDelete={vi.fn().mockResolvedValue(undefined)}
					hasNotifyEnabledRoutes={true}
					notifyBeforeMinutes={5}
				/>,
			);
			expect(screen.getByText(/現在、発車\s*5\s*分前に通知します/)).toBeInTheDocument();
		});

		it("hasNotifyEnabledRoutes=true のとき変更用の入力が表示される", () => {
			render(
				<RouteRegistration
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={vi.fn().mockResolvedValue(undefined)}
					onDelete={vi.fn().mockResolvedValue(undefined)}
					hasNotifyEnabledRoutes={true}
					notifyBeforeMinutes={5}
				/>,
			);
			expect(
				screen.getByRole("spinbutton", { name: "通知タイミング" }),
			).toBeInTheDocument();
		});

		it("変更用入力には単位「分前」が accessible description として関連付けられている", () => {
			render(
				<RouteRegistration
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={vi.fn().mockResolvedValue(undefined)}
					onDelete={vi.fn().mockResolvedValue(undefined)}
					hasNotifyEnabledRoutes={true}
					notifyBeforeMinutes={5}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			expect(input).toHaveAccessibleDescription("分前");
		});

		it("hasNotifyEnabledRoutes=false のとき通知タイミング UI は表示されない", () => {
			const routes: RegisteredRouteEntry[] = [
				{ id: 1, fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 5 },
			];
			render(
				<RouteRegistration
					db={db}
					routes={routes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={vi.fn().mockResolvedValue(undefined)}
					onDelete={vi.fn().mockResolvedValue(undefined)}
					hasNotifyEnabledRoutes={false}
					notifyBeforeMinutes={5}
				/>,
			);
			expect(
				screen.queryByRole("spinbutton", { name: "通知タイミング" }),
			).not.toBeInTheDocument();
			expect(screen.queryByText(/現在、発車/)).not.toBeInTheDocument();
		});

		it("notifyPermission が default のとき「通知を許可」ボタンが表示される", () => {
			render(
				<RouteRegistration
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={vi.fn().mockResolvedValue(undefined)}
					onDelete={vi.fn().mockResolvedValue(undefined)}
					hasNotifyEnabledRoutes={true}
					notifyBeforeMinutes={5}
					notifyPermission="default"
					onRequestNotificationPermission={vi.fn().mockResolvedValue("granted")}
				/>,
			);
			expect(
				screen.getByRole("button", { name: "通知を許可" }),
			).toBeInTheDocument();
		});

		it("blur で有効値が onNotifyBeforeMinutesChange に渡る", () => {
			const onChange = vi.fn();
			render(
				<RouteRegistration
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={vi.fn().mockResolvedValue(undefined)}
					onDelete={vi.fn().mockResolvedValue(undefined)}
					hasNotifyEnabledRoutes={true}
					notifyBeforeMinutes={5}
					onNotifyBeforeMinutesChange={onChange}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "15" } });
			fireEvent.blur(input);
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenCalledWith(15);
		});

		it("Enter キーで有効値が onNotifyBeforeMinutesChange に渡る", () => {
			const onChange = vi.fn();
			render(
				<RouteRegistration
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={vi.fn().mockResolvedValue(undefined)}
					onDelete={vi.fn().mockResolvedValue(undefined)}
					hasNotifyEnabledRoutes={true}
					notifyBeforeMinutes={5}
					onNotifyBeforeMinutesChange={onChange}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "20" } });
			fireEvent.keyDown(input, { key: "Enter" });
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenCalledWith(20);
		});

		it("onChange 単体では onNotifyBeforeMinutesChange が呼ばれない", () => {
			const onChange = vi.fn();
			render(
				<RouteRegistration
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={vi.fn().mockResolvedValue(undefined)}
					onDelete={vi.fn().mockResolvedValue(undefined)}
					hasNotifyEnabledRoutes={true}
					notifyBeforeMinutes={5}
					onNotifyBeforeMinutesChange={onChange}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "1" } });
			fireEvent.change(input, { target: { value: "15" } });
			expect(onChange).not.toHaveBeenCalled();
		});

		it("blur で 60 を超える値は反映されず表示が直前値に戻る", () => {
			const onChange = vi.fn();
			render(
				<RouteRegistration
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={vi.fn().mockResolvedValue(undefined)}
					onDelete={vi.fn().mockResolvedValue(undefined)}
					hasNotifyEnabledRoutes={true}
					notifyBeforeMinutes={5}
					onNotifyBeforeMinutesChange={onChange}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "100" } });
			fireEvent.blur(input);
			expect(onChange).not.toHaveBeenCalled();
			expect(input).toHaveValue(5);
		});

		it("blur で小数は反映されず表示が直前値に戻る", () => {
			const onChange = vi.fn();
			render(
				<RouteRegistration
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={vi.fn().mockResolvedValue(undefined)}
					onDelete={vi.fn().mockResolvedValue(undefined)}
					hasNotifyEnabledRoutes={true}
					notifyBeforeMinutes={5}
					onNotifyBeforeMinutesChange={onChange}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "5.5" } });
			fireEvent.blur(input);
			expect(onChange).not.toHaveBeenCalled();
			expect(input).toHaveValue(5);
		});

		it("blur で空値は反映されず表示が直前値に戻る", () => {
			const onChange = vi.fn();
			render(
				<RouteRegistration
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={vi.fn().mockResolvedValue(undefined)}
					onDelete={vi.fn().mockResolvedValue(undefined)}
					hasNotifyEnabledRoutes={true}
					notifyBeforeMinutes={5}
					onNotifyBeforeMinutesChange={onChange}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "" } });
			fireEvent.blur(input);
			expect(onChange).not.toHaveBeenCalled();
			expect(input).toHaveValue(5);
		});
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
