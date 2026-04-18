import {
	cleanup,
	fireEvent,
	render as rtlRender,
	screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useState } from "react";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
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
import { ToastContainer } from "../src/components/Toast";
import { ToastProvider } from "../src/hooks/useToast";
import { createSchema, loadGtfsData } from "../src/lib/gtfs-loader";
import type { GtfsData } from "../src/types/gtfs";
import type { RegisteredRouteEntry } from "../src/types/route-entry";

/**
 * ToastProvider + ToastContainer を含めてレンダリングするヘルパ。
 * RouteRegistration は useToast を使うため ToastProvider 下での描画が必須。
 */
function render(ui: ReactElement) {
	return rtlRender(
		<ToastProvider>
			<ToastContainer />
			{ui}
		</ToastProvider>,
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

/**
 * Issue #90: 共通テストデータの全バス停間で直通便が成立するよう、
 * 往復の trip と stop_times を用意する。これにより乗降の順序を問わず
 * 既存の「from → to を選んで登録」テストが到達可能性ガードを通過する。
 */
const testRoutes: GtfsData["routes"] = [
	{ route_id: "R001", agency_id: "A001", route_short_name: "1" },
];

const testCalendar: GtfsData["calendar"] = [
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

const testTrips: GtfsData["trips"] = [
	{ trip_id: "T001", route_id: "R001", service_id: "weekday" },
	{ trip_id: "T002", route_id: "R001", service_id: "weekday" },
];

const testStopTimes: GtfsData["stop_times"] = [
	// T001: 旭川駅前 → 市役所前 → 旭川四条駅
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
	// T002: 逆向き（旭川四条駅 → 市役所前 → 旭川駅前）
	{
		trip_id: "T002",
		arrival_time: "09:00:00",
		departure_time: "09:00:00",
		stop_id: "S003",
		stop_sequence: 1,
	},
	{
		trip_id: "T002",
		arrival_time: "09:05:00",
		departure_time: "09:05:00",
		stop_id: "S002",
		stop_sequence: 2,
	},
	{
		trip_id: "T002",
		arrival_time: "09:10:00",
		departure_time: "09:10:00",
		stop_id: "S001",
		stop_sequence: 3,
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
	loadGtfsData(
		db,
		{
			...emptyGtfsBase,
			stops: testStops,
			routes: testRoutes,
			calendar: testCalendar,
			trips: testTrips,
			stop_times: testStopTimes,
		},
		"test",
	);
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

/**
 * 通知タイミング UI の対話系テスト向けハーネス。
 * 内部で minutes を state として保持し、setNotifyBeforeMinutes に
 * onCommitSpy を挟むことで commit 成功時の spy 検証・throw による
 * rollback 検証を可能にする。
 *
 * 本物の useNotificationSettings と異なり localStorage には触れず、
 * インメモリ状態のみで動作する。RouteRegistration 内部の
 * useNotifyBeforeMinutesInput がそのまま動くため、入力中の文字列
 * state や canCommit 判定は本物と同一の実装で検証される。
 */
function NotifyHarness(props: {
	db: Database;
	routes: RegisteredRouteEntry[];
	onAdd: (
		entry: Omit<import("../src/types/route-entry").RouteEntry, "id">,
	) => Promise<number>;
	onUpdate: (entry: RegisteredRouteEntry) => Promise<void>;
	onDelete: (id: number) => Promise<void>;
	onRequestNotificationPermission?: () => Promise<NotificationPermission>;
	notifyPermission?: NotificationPermission | "unsupported";
	hasNotifyEnabledRoutes?: boolean;
	initialMinutes?: number;
	/** commit 成功時に minutes 引数で呼ばれる。throw すると rollback される */
	onCommitSpy?: (minutes: number) => void;
}) {
	const { initialMinutes = 5, onCommitSpy, ...componentProps } = props;
	const [minutes, setMinutes] = useState(initialMinutes);

	const setNotifyBeforeMinutes = (value: number) => {
		// onCommitSpy が throw すれば setMinutes に到達せず、
		// RouteRegistration 内部の useNotifyBeforeMinutesInput が
		// 入力値を元の minutes にロールバックする。
		onCommitSpy?.(value);
		setMinutes(value);
	};

	return (
		<RouteRegistration
			{...componentProps}
			notifyBeforeMinutes={minutes}
			setNotifyBeforeMinutes={setNotifyBeforeMinutes}
		/>
	);
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

	// Issue #90 派生：到達可能性フィルタにより「実在するのに候補に出ない」が
	// 起こり得るため，ユーザーに理由を事前告知する補足文言を検証する。
	// 文言は errorMessage（要望 2）と用語を揃え，「乗り換えなしで到達」の
	// キーワードを共通化して UX の一貫性を担保する。
	it("入力欄の近くに到達可能性の補足文言が表示される", () => {
		renderComponent();
		expect(
			screen.getByText(
				/実在するバス停が選択候補にでない場合.*乗り換えなしで到達できない組み合わせ/,
			),
		).toBeInTheDocument();
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
		// Issue #90: 降車ドロップダウンは乗車と同じバス停を除外するため、
		// 通常フローでは同一バス停を選択できない。編集経路で同一バス停の
		// エントリを読み込み、フォーム上で同じバス停同士になった状態を
		// 再現して submit ガードを検証する。
		const sameFromToRoute: RegisteredRouteEntry = {
			id: 1,
			fromStopId: "test:S001",
			toStopId: "test:S001",
			walkMinutes: 5,
		};
		renderComponent([sameFromToRoute]);

		await userEvent.click(screen.getByRole("button", { name: "編集" }));
		await userEvent.click(screen.getByRole("button", { name: "更新" }));

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

	it("トグル ON 成功時に「通知を ON にしました」トーストが表示される", async () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
		];
		render(
			<RouteRegistration
				db={db}
				routes={routes}
				onAdd={vi.fn().mockResolvedValue(1)}
				onUpdate={vi.fn().mockResolvedValue(undefined)}
				onDelete={vi.fn().mockResolvedValue(undefined)}
			/>,
		);

		await userEvent.click(
			screen.getByRole("checkbox", { name: "通知の切り替え" }),
		);

		expect(await screen.findByText(/通知を ON にしました/)).toBeInTheDocument();
	});

	it("トグル OFF 成功時に「通知を OFF にしました」トーストが表示される", async () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: true,
			},
		];
		render(
			<RouteRegistration
				db={db}
				routes={routes}
				onAdd={vi.fn().mockResolvedValue(1)}
				onUpdate={vi.fn().mockResolvedValue(undefined)}
				onDelete={vi.fn().mockResolvedValue(undefined)}
			/>,
		);

		await userEvent.click(
			screen.getByRole("checkbox", { name: "通知の切り替え" }),
		);

		expect(
			await screen.findByText(/通知を OFF にしました/),
		).toBeInTheDocument();
	});

	it("トグル処理中は同一経路の編集ボタンが disabled になる（race 防止）", async () => {
		// 同一経路のトグル onUpdate と編集フォーム submit の onUpdate が race して
		// stale な notifyEnabled で上書きされる可能性があるため、トグル処理中は
		// 編集ボタンも無効化する。
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
		];
		let resolveUpdate: () => void = () => {};
		const onUpdate = vi.fn(
			() =>
				new Promise<void>((r) => {
					resolveUpdate = r;
				}),
		);
		render(
			<RouteRegistration
				db={db}
				routes={routes}
				onAdd={vi.fn().mockResolvedValue(1)}
				onUpdate={onUpdate}
				onDelete={vi.fn().mockResolvedValue(undefined)}
			/>,
		);

		const editButton = screen.getByRole("button", { name: "編集" });
		expect(editButton).not.toBeDisabled();

		await userEvent.click(
			screen.getByRole("checkbox", { name: "通知の切り替え" }),
		);
		expect(editButton).toBeDisabled();

		resolveUpdate();
	});

	it("トグル処理中は同一経路の削除ボタンが disabled になる（race 防止）", async () => {
		// 同一経路のトグル onUpdate と onDelete が concurrent 発火する race を防ぐ。
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
		];
		let resolveUpdate: () => void = () => {};
		const onUpdate = vi.fn(
			() =>
				new Promise<void>((r) => {
					resolveUpdate = r;
				}),
		);
		render(
			<RouteRegistration
				db={db}
				routes={routes}
				onAdd={vi.fn().mockResolvedValue(1)}
				onUpdate={onUpdate}
				onDelete={vi.fn().mockResolvedValue(undefined)}
			/>,
		);

		const deleteButton = screen.getByRole("button", { name: "削除" });
		expect(deleteButton).not.toBeDisabled();

		await userEvent.click(
			screen.getByRole("checkbox", { name: "通知の切り替え" }),
		);
		expect(deleteButton).toBeDisabled();

		resolveUpdate();
	});

	it("トグル処理中はキャンセルボタンも disabled になる（編集モード中）", async () => {
		// 編集モード中にトグル処理が走ると、キャンセル操作で編集を抜けられると
		// トグル対象の state が途中で失われる。状態の一貫性のため無効化する。
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
		];
		let resolveUpdate: () => void = () => {};
		const onUpdate = vi.fn(
			() =>
				new Promise<void>((r) => {
					resolveUpdate = r;
				}),
		);
		render(
			<RouteRegistration
				db={db}
				routes={routes}
				onAdd={vi.fn().mockResolvedValue(1)}
				onUpdate={onUpdate}
				onDelete={vi.fn().mockResolvedValue(undefined)}
			/>,
		);

		// 編集モードへ遷移
		await userEvent.click(screen.getByRole("button", { name: "編集" }));
		const cancelButton = screen.getByRole("button", { name: "キャンセル" });
		expect(cancelButton).not.toBeDisabled();

		await userEvent.click(
			screen.getByRole("checkbox", { name: "通知の切り替え" }),
		);
		expect(cancelButton).toBeDisabled();

		resolveUpdate();
	});

	it("フォーム送信中（submitting=true 相当）は通知トグルも disabled になる", async () => {
		// フォーム送信（登録/更新/削除）と通知トグルの onUpdate が同時進行すると
		// 編集モード中の同一経路で race が発生し得るため、submitting 中はトグルも
		// 排他的に無効化する。
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
		];
		// 削除ボタンを押して onDelete を保留させると submitting=true の状態を作れる
		let resolveDelete: () => void = () => {};
		const onDelete = vi.fn(
			() =>
				new Promise<void>((r) => {
					resolveDelete = r;
				}),
		);
		render(
			<RouteRegistration
				db={db}
				routes={routes}
				onAdd={vi.fn().mockResolvedValue(1)}
				onUpdate={vi.fn().mockResolvedValue(undefined)}
				onDelete={onDelete}
			/>,
		);

		const toggle = screen.getByRole("checkbox", { name: "通知の切り替え" });
		expect(toggle).not.toBeDisabled();

		// 削除をクリック（onDelete は保留 → submitting=true のまま）
		await userEvent.click(screen.getByRole("button", { name: "削除" }));

		// submitting 中はトグルも disabled になる
		expect(toggle).toBeDisabled();

		resolveDelete();
	});

	it("トグル処理中は他の経路のトグルも disabled になる（重複サブミッション防止）", async () => {
		// 経路 A 処理中に経路 B をクリックすると togglingRouteId が B で上書きされ
		// A のトグルが処理中に再有効化される問題を防ぐため、処理中は全トグルを
		// 排他無効化する。
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
			{
				id: 2,
				fromStopId: "test:S002",
				toStopId: "test:S003",
				walkMinutes: 7,
				notifyEnabled: false,
			},
		];
		let resolveUpdate: () => void = () => {};
		const onUpdate = vi.fn(
			() =>
				new Promise<void>((r) => {
					resolveUpdate = r;
				}),
		);
		render(
			<RouteRegistration
				db={db}
				routes={routes}
				onAdd={vi.fn().mockResolvedValue(1)}
				onUpdate={onUpdate}
				onDelete={vi.fn().mockResolvedValue(undefined)}
			/>,
		);

		const toggles = screen.getAllByRole("checkbox", {
			name: "通知の切り替え",
		});
		expect(toggles).toHaveLength(2);

		// 経路 A のトグルをクリック（onUpdate は保留）
		await userEvent.click(toggles[0]);

		// 経路 A だけでなく経路 B のトグルも disabled になっている
		expect(toggles[0]).toBeDisabled();
		expect(toggles[1]).toBeDisabled();

		resolveUpdate();
	});

	it("トグル処理中でも経路登録ボタンの表示（テキスト・disabled）は変わらない", async () => {
		// 通知の ON/OFF をするたびに登録ボタンが「保存中...」になったり disabled になったり
		// 揺れる問題を回避する。トグル操作はフォーム送信と独立した状態で管理すべき。
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
		];
		// onUpdate を保留させてトグル処理中の状態を観測する
		let resolveUpdate: () => void = () => {};
		const onUpdate = vi.fn(
			() =>
				new Promise<void>((r) => {
					resolveUpdate = r;
				}),
		);
		render(
			<RouteRegistration
				db={db}
				routes={routes}
				onAdd={vi.fn().mockResolvedValue(1)}
				onUpdate={onUpdate}
				onDelete={vi.fn().mockResolvedValue(undefined)}
			/>,
		);

		const submitButton = screen.getByRole("button", { name: "登録" });
		await userEvent.click(
			screen.getByRole("checkbox", { name: "通知の切り替え" }),
		);

		// トグル処理が保留中でも登録ボタンは「登録」のままで enabled
		expect(submitButton).toHaveTextContent("登録");
		expect(submitButton).not.toBeDisabled();

		resolveUpdate();
	});

	it("トグル ON 成功時のトーストに乗車バス停名・降車バス停名が含まれる", async () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
		];
		render(
			<RouteRegistration
				db={db}
				routes={routes}
				onAdd={vi.fn().mockResolvedValue(1)}
				onUpdate={vi.fn().mockResolvedValue(undefined)}
				onDelete={vi.fn().mockResolvedValue(undefined)}
			/>,
		);

		await userEvent.click(
			screen.getByRole("checkbox", { name: "通知の切り替え" }),
		);

		// どの経路のトグルを切り替えたのか明示するため、乗車/降車のバス停名を文言に含める
		expect(
			await screen.findByText(
				/旭川駅前[\s\S]*市役所前[\s\S]*通知を\s*ON\s*にしました/,
			),
		).toBeInTheDocument();
	});

	it("トグル OFF 成功時のトーストに乗車バス停名・降車バス停名が含まれる", async () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: true,
			},
		];
		render(
			<RouteRegistration
				db={db}
				routes={routes}
				onAdd={vi.fn().mockResolvedValue(1)}
				onUpdate={vi.fn().mockResolvedValue(undefined)}
				onDelete={vi.fn().mockResolvedValue(undefined)}
			/>,
		);

		await userEvent.click(
			screen.getByRole("checkbox", { name: "通知の切り替え" }),
		);

		expect(
			await screen.findByText(
				/旭川駅前[\s\S]*市役所前[\s\S]*通知を\s*OFF\s*にしました/,
			),
		).toBeInTheDocument();
	});

	it("トグル操作で onUpdate が reject したときエラートーストが表示される", async () => {
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
		];
		const onUpdate = vi
			.fn()
			.mockRejectedValue(new Error("IndexedDB 書き込みに失敗"));
		render(
			<RouteRegistration
				db={db}
				routes={routes}
				onAdd={vi.fn().mockResolvedValue(1)}
				onUpdate={onUpdate}
				onDelete={vi.fn().mockResolvedValue(undefined)}
			/>,
		);

		await userEvent.click(
			screen.getByRole("checkbox", { name: "通知の切り替え" }),
		);

		expect(
			await screen.findByText(/IndexedDB 書き込みに失敗/),
		).toBeInTheDocument();
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
			screen.getByText(/ブラウザの通知が拒否されています/),
		).toBeInTheDocument();
		// 本 PR で「発車」→「出発」に用語統一したため、警告文言も整合していることを確認する
		expect(
			screen.getByText(/出発前の通知は送信されません/),
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

	it("トグル操作中に onRequestNotificationPermission が reject した場合、エラーメッセージが表示され onUpdate は呼ばれない", async () => {
		// permission 要求が reject した場合のエラーハンドリング検証。
		// 以前は await が try/catch 外だったため rejection が未処理になり、
		// ユーザーへのフィードバックも無かった。try 内に移動したことで捕捉される。
		const routes: RegisteredRouteEntry[] = [
			{
				id: 1,
				fromStopId: "test:S001",
				toStopId: "test:S002",
				walkMinutes: 5,
				notifyEnabled: false,
			},
		];
		const onRequestPermission = vi
			.fn()
			.mockRejectedValue(new Error("permission 要求に失敗しました"));
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

		// エラートーストが表示される（rejection が catch で捕捉された証左）。
		// トースト文言にはどの経路で失敗したか明示するためバス停名と原因が含まれる。
		expect(
			await screen.findByText(
				/旭川駅前[\s\S]*市役所前[\s\S]*permission 要求に失敗しました/,
			),
		).toBeInTheDocument();
		// permission 要求段階で失敗したため onUpdate は呼ばれない
		expect(onUpdate).not.toHaveBeenCalled();
	});

	it("フォーム登録時、permission が denied を返してもユーザー意図 (notifyEnabled=true) が保存される", async () => {
		// 登録済みトグルは denied でも意図保存する一方、フォーム側も挙動を揃えるべき。
		// permission はリクエストするが、結果で notifyEnabled を上書きしない。
		const onRequestPermission = vi.fn().mockResolvedValue("denied");
		const onAdd = vi.fn().mockResolvedValue(1);
		const onUpdate = vi.fn().mockResolvedValue(undefined);
		const onDelete = vi.fn().mockResolvedValue(undefined);

		render(
			<RouteRegistration
				db={db}
				routes={[]}
				onAdd={onAdd}
				onUpdate={onUpdate}
				onDelete={onDelete}
				onRequestNotificationPermission={onRequestPermission}
			/>,
		);

		const comboboxes = screen.getAllByRole("combobox");
		await userEvent.type(comboboxes[0], "旭川駅");
		await userEvent.click(screen.getByText("旭川駅前"));
		await userEvent.type(comboboxes[1], "市役所");
		await userEvent.click(screen.getByText("市役所前"));

		// 通知トグルを ON にする
		const notifyToggle = screen.getByRole("checkbox", { name: "通知" });
		await userEvent.click(notifyToggle);

		await userEvent.click(screen.getByRole("button", { name: "登録" }));

		expect(onRequestPermission).toHaveBeenCalledOnce();
		expect(onAdd).toHaveBeenCalledWith({
			fromStopId: "test:S001",
			toStopId: "test:S002",
			walkMinutes: 10,
			notifyEnabled: true,
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

		/** 共通の必須コールバック。テスト側で上書きしたい場合のみ渡す */
		const baseHandlers = () => ({
			onAdd: vi.fn().mockResolvedValue(1),
			onUpdate: vi.fn().mockResolvedValue(undefined),
			onDelete: vi.fn().mockResolvedValue(undefined),
		});

		it("hasNotifyEnabledRoutes=true のとき現在値が明示表示される", () => {
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
				/>,
			);
			expect(
				screen.getByText(/現在、出発\s*5\s*分前に通知します/),
			).toBeInTheDocument();
		});

		it("hasNotifyEnabledRoutes=true のとき変更用の入力が表示される", () => {
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
				/>,
			);
			expect(
				screen.getByRole("spinbutton", { name: "通知タイミング" }),
			).toBeInTheDocument();
		});

		it("変更用入力には単位「分前」が accessible description として関連付けられている", () => {
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			expect(input).toHaveAccessibleDescription("分前");
		});

		it("hasNotifyEnabledRoutes=false のとき通知タイミング UI は表示されない", () => {
			const routes: RegisteredRouteEntry[] = [
				{
					id: 1,
					fromStopId: "test:S001",
					toStopId: "test:S002",
					walkMinutes: 5,
				},
			];
			render(
				<NotifyHarness
					db={db}
					routes={routes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={false}
					initialMinutes={5}
				/>,
			);
			expect(
				screen.queryByRole("spinbutton", { name: "通知タイミング" }),
			).not.toBeInTheDocument();
			expect(screen.queryByText(/現在、出発/)).not.toBeInTheDocument();
		});

		it("notifyPermission が default のとき「通知を許可」ボタンが表示される", () => {
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
					notifyPermission="default"
					onRequestNotificationPermission={vi.fn().mockResolvedValue("granted")}
				/>,
			);
			expect(
				screen.getByRole("button", { name: "通知を許可" }),
			).toBeInTheDocument();
		});

		it("設定ボタンが表示される", () => {
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
				/>,
			);
			expect(
				screen.getByRole("button", { name: "通知タイミングを設定" }),
			).toBeInTheDocument();
		});

		it("値を変更して設定ボタンを押すと commit が呼ばれ確定値が更新される", async () => {
			const onCommitSpy = vi.fn();
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
					onCommitSpy={onCommitSpy}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "15" } });
			await userEvent.click(
				screen.getByRole("button", { name: "通知タイミングを設定" }),
			);
			expect(onCommitSpy).toHaveBeenCalledTimes(1);
			expect(onCommitSpy).toHaveBeenCalledWith(15);
			// 確定後は確定値表示も更新される
			expect(
				screen.getByText(/現在、出発\s*15\s*分前に通知します/),
			).toBeInTheDocument();
		});

		it("設定ボタン押下で成功トーストが表示される", async () => {
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "15" } });
			await userEvent.click(
				screen.getByRole("button", { name: "通知タイミングを設定" }),
			);
			expect(
				await screen.findByText(
					/出発の\s*15\s*分前に通知するように設定しました/,
				),
			).toBeInTheDocument();
		});

		it("Enter キー押下でも commit が呼ばれ成功トーストが表示される", async () => {
			const onCommitSpy = vi.fn();
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
					onCommitSpy={onCommitSpy}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "20" } });
			fireEvent.keyDown(input, { key: "Enter" });
			expect(onCommitSpy).toHaveBeenCalledTimes(1);
			expect(onCommitSpy).toHaveBeenCalledWith(20);
			expect(
				await screen.findByText(
					/出発の\s*20\s*分前に通知するように設定しました/,
				),
			).toBeInTheDocument();
		});

		it("setNotifyBeforeMinutes が未指定の場合は通知タイミング UI が表示されない", () => {
			// 親が永続化ハンドラを渡していないとき（例えば feature flag OFF 等）に
			// 通知タイミング入力 UI を描画してしまうと、入力はできるが保存されない
			// という矛盾した挙動になり、確定後に「設定しました」トーストが出ても
			// 実際には何も永続化されていないという誤情報をユーザーに伝えてしまう。
			// そのため setNotifyBeforeMinutes 未指定時は UI 自体を非表示にする。
			render(
				<RouteRegistration
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					notifyBeforeMinutes={5}
					// setNotifyBeforeMinutes を意図的に渡さない
				/>,
			);
			expect(
				screen.queryByRole("spinbutton", { name: "通知タイミング" }),
			).not.toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "通知タイミングを設定" }),
			).not.toBeInTheDocument();
			expect(screen.queryByText(/現在、出発/)).not.toBeInTheDocument();
		});

		it("blur では commit が呼ばれない（確定は Enter / 設定ボタンのみ）", () => {
			const onCommitSpy = vi.fn();
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
					onCommitSpy={onCommitSpy}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "15" } });
			fireEvent.blur(input);
			expect(onCommitSpy).not.toHaveBeenCalled();
		});

		it("入力を変更しただけでは commit は呼ばれない", () => {
			const onCommitSpy = vi.fn();
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
					onCommitSpy={onCommitSpy}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "1" } });
			fireEvent.change(input, { target: { value: "15" } });
			expect(onCommitSpy).not.toHaveBeenCalled();
		});

		it("現在値と同じ値では設定ボタンが無効化される", () => {
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
				/>,
			);
			// 初期値が 5 で入力値も 5 のまま
			expect(
				screen.getByRole("button", { name: "通知タイミングを設定" }),
			).toBeDisabled();
		});

		it("範囲外の値（60 超）では設定ボタンが無効化される", () => {
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "100" } });
			expect(
				screen.getByRole("button", { name: "通知タイミングを設定" }),
			).toBeDisabled();
		});

		it("小数値では設定ボタンが無効化される", () => {
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "5.5" } });
			expect(
				screen.getByRole("button", { name: "通知タイミングを設定" }),
			).toBeDisabled();
		});

		it("空値では設定ボタンが無効化される", () => {
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "" } });
			expect(
				screen.getByRole("button", { name: "通知タイミングを設定" }),
			).toBeDisabled();
		});

		it("canCommit=false の状態で Enter キーを押してもエラートーストが表示されない", async () => {
			// 設定ボタンは disabled でガードされているが、Enter キー経路は
			// 無条件で commitNotifyInput を呼ぶため、ガードが漏れると
			// 親フックから invalid-or-unchanged エラーが返り、ユーザーに
			// 不適切なエラートーストが表示されてしまう（PR #92 レビュー指摘）。
			const onCommitSpy = vi.fn();
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
					onCommitSpy={onCommitSpy}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			// 初期値 5 のまま何も変更せず Enter キーを押す（canCommit=false）
			fireEvent.keyDown(input, { key: "Enter" });
			// コンポーネント側の canCommit ガードにより commit 呼び出し自体が抑止され、
			// エラー / 成功どちらのトーストも出てはならない。
			expect(
				screen.queryByText(/通知タイミングを設定できませんでした/),
			).not.toBeInTheDocument();
			expect(
				screen.queryByText(/出発の.*分前に通知するように設定しました/),
			).not.toBeInTheDocument();
			// 親フックの commit 自体が呼ばれないことも明示的に検証する
			expect(onCommitSpy).not.toHaveBeenCalled();
		});

		it("無効値の状態で Enter キーを押してもエラートーストが表示されない", () => {
			// 範囲外等の無効値入力で Enter キーを押した場合も、エラートーストを
			// 出さない（バリデーション表示は別責務で、ここでは無反応でよい）。
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "100" } });
			fireEvent.keyDown(input, { key: "Enter" });
			expect(
				screen.queryByText(/通知タイミングを設定できませんでした/),
			).not.toBeInTheDocument();
		});

		it("commit が throw した場合はエラートーストが表示される", async () => {
			const onCommitSpy = vi.fn().mockImplementation(() => {
				throw new Error("localStorage 書き込みに失敗しました");
			});
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
					onCommitSpy={onCommitSpy}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "15" } });
			await userEvent.click(
				screen.getByRole("button", { name: "通知タイミングを設定" }),
			);
			// エラートースト文言は実装依存だが「設定できませんでした」は確実に含める
			expect(
				await screen.findByText(/通知タイミング.*設定できませんでした/),
			).toBeInTheDocument();
		});

		it("フォーム送信中（submitting=true 相当）は設定ボタンが disabled になる", async () => {
			// 通知タイミング確定と他の非同期処理（フォーム送信・トグル）が同時進行すると
			// UI フィードバックに齟齬が出るため、submitting 中は設定ボタンも無効化する。
			let resolveDelete: () => void = () => {};
			const onDelete = vi.fn(
				() =>
					new Promise<void>((r) => {
						resolveDelete = r;
					}),
			);
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={vi.fn().mockResolvedValue(undefined)}
					onDelete={onDelete}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
				/>,
			);
			// 入力値を変更して canCommitNotifyInput=true にしておく
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "15" } });
			const setButton = screen.getByRole("button", {
				name: "通知タイミングを設定",
			});
			expect(setButton).not.toBeDisabled();

			// 削除をクリックして submitting=true の状態を作る
			await userEvent.click(screen.getByRole("button", { name: "削除" }));
			expect(setButton).toBeDisabled();

			resolveDelete();
		});

		it("submitting=true 中は Enter キーを押しても commit が呼ばれない", async () => {
			// 設定ボタンは disabled でガードされているが、Enter キー経路も
			// ボタンと同じ busy 条件でガードされないと「busy 中は全確定経路を塞ぐ」
			// という UI invariant が崩れる（PR #92 CodeRabbit 指摘）。
			let resolveDelete: () => void = () => {};
			const onDelete = vi.fn(
				() =>
					new Promise<void>((r) => {
						resolveDelete = r;
					}),
			);
			const onCommitSpy = vi.fn();
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={vi.fn().mockResolvedValue(undefined)}
					onDelete={onDelete}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
					onCommitSpy={onCommitSpy}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "15" } });

			// 削除をクリックして submitting=true を作る
			await userEvent.click(screen.getByRole("button", { name: "削除" }));

			// busy 中に Enter を押しても commit は呼ばれない
			fireEvent.keyDown(input, { key: "Enter" });
			expect(onCommitSpy).not.toHaveBeenCalled();
			// トーストも出ない
			expect(
				screen.queryByText(/出発の.*分前に通知するように設定しました/),
			).not.toBeInTheDocument();

			resolveDelete();
		});

		it("togglingRouteId !== null 中は Enter キーを押しても commit が呼ばれない", async () => {
			let resolveUpdate: () => void = () => {};
			const onUpdate = vi.fn(
				() =>
					new Promise<void>((r) => {
						resolveUpdate = r;
					}),
			);
			const onCommitSpy = vi.fn();
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={onUpdate}
					onDelete={vi.fn().mockResolvedValue(undefined)}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
					onCommitSpy={onCommitSpy}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "15" } });

			// トグルをクリックして togglingRouteId !== null を作る
			await userEvent.click(
				screen.getByRole("checkbox", { name: "通知の切り替え" }),
			);

			// busy 中に Enter を押しても commit は呼ばれない
			fireEvent.keyDown(input, { key: "Enter" });
			expect(onCommitSpy).not.toHaveBeenCalled();
			expect(
				screen.queryByText(/出発の.*分前に通知するように設定しました/),
			).not.toBeInTheDocument();

			resolveUpdate();
		});

		it("トグル処理中（togglingRouteId !== null）は設定ボタンが disabled になる", async () => {
			let resolveUpdate: () => void = () => {};
			const onUpdate = vi.fn(
				() =>
					new Promise<void>((r) => {
						resolveUpdate = r;
					}),
			);
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					onAdd={vi.fn().mockResolvedValue(1)}
					onUpdate={onUpdate}
					onDelete={vi.fn().mockResolvedValue(undefined)}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "15" } });
			const setButton = screen.getByRole("button", {
				name: "通知タイミングを設定",
			});
			expect(setButton).not.toBeDisabled();

			// トグルをクリックして togglingRouteId !== null の状態を作る
			await userEvent.click(
				screen.getByRole("checkbox", { name: "通知の切り替え" }),
			);
			expect(setButton).toBeDisabled();

			resolveUpdate();
		});

		it("commit が失敗したとき入力欄の表示が元の値に戻る", async () => {
			// 設定確定に失敗したのに入力欄だけ新しい値のまま残ると、
			// 保存されている値と画面表示が乖離してユーザーの誤解を招く。
			// 失敗時は確定直前の値へロールバックする（親フックの責務）。
			const onCommitSpy = vi.fn().mockImplementation(() => {
				throw new Error("localStorage 書き込みに失敗しました");
			});
			render(
				<NotifyHarness
					db={db}
					routes={notifyEnabledRoutes}
					{...baseHandlers()}
					hasNotifyEnabledRoutes={true}
					initialMinutes={5}
					onCommitSpy={onCommitSpy}
				/>,
			);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			fireEvent.change(input, { target: { value: "15" } });
			expect(input).toHaveValue(15);
			await userEvent.click(
				screen.getByRole("button", { name: "通知タイミングを設定" }),
			);
			// エラートーストが出た上で、入力値は元の 5 にロールバックされている
			expect(
				await screen.findByText(/通知タイミング.*設定できませんでした/),
			).toBeInTheDocument();
			expect(input).toHaveValue(5);
		});

		it("初回マウント時に notifyBeforeMinutes=undefined でも、後から確定値が流入したときに入力欄が確定値に一致する", () => {
			// CodeRabbit 指摘（#95）のシナリオ:
			// useNotifyBeforeMinutesInput は useState 初期化子でマウント時の minutes を
			// 一度だけ捕捉する。RouteRegistration が `?? NOTIFY_DEFAULT_MINUTES` で
			// フォールバックしたまま無条件にフックを呼ぶ構造だと、初回 undefined で
			// 初期化されたフック内の inputValue がフォールバック値 5 のまま残り、
			// 後から確定値 8 が流入して UI が表示されたときに表示ラベルは 8 なのに
			// 入力欄は 5 のままという不整合が生じる。
			// 通知 UI を別コンポーネントに切り出し showNotifySettings=true のときだけ
			// マウントする構造にすれば、フックの初期化子は確定値で走るため入力欄も
			// 表示も 8 に一致する。
			function UndefinedToDefinedChanger() {
				const [minutes, setMinutes] = useState<number | undefined>(undefined);
				const setNotifyBeforeMinutes =
					minutes === undefined
						? undefined
						: (value: number) => setMinutes(value);
				return (
					<>
						<button
							type="button"
							onClick={() => setMinutes(8)}
							data-testid="force-define-minutes"
						>
							確定値を 8 にセット
						</button>
						<RouteRegistration
							db={db}
							routes={notifyEnabledRoutes}
							{...baseHandlers()}
							hasNotifyEnabledRoutes={true}
							notifyBeforeMinutes={minutes}
							setNotifyBeforeMinutes={setNotifyBeforeMinutes}
						/>
					</>
				);
			}
			render(<UndefinedToDefinedChanger />);

			// 初回は通知タイミング UI 非表示（notifyBeforeMinutes=undefined）
			expect(
				screen.queryByRole("spinbutton", { name: "通知タイミング" }),
			).not.toBeInTheDocument();

			// 親が確定値 8 と永続化ハンドラを後から渡す
			fireEvent.click(screen.getByTestId("force-define-minutes"));

			// UI が表示され、確定値表示も入力欄も 8 に一致する
			expect(
				screen.getByText(/現在、出発\s*8\s*分前に通知します/),
			).toBeInTheDocument();
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });
			expect(input).toHaveValue(8);
		});

		it("外部から notifyBeforeMinutes が更新されても入力中の値が破壊されない（Issue #89）", () => {
			// 従来 RouteRegistration は notifyBeforeMinutes の変化を useEffect で
			// 内部 state に同期していたため、ユーザーが編集中に親の確定値が
			// 変わると入力途中の値が上書きされるアンチパターンが存在した。
			// Issue #93 以降は内部フック useNotifyBeforeMinutesInput の useState
			// 初期化子がマウント時にのみ minutes を参照するため、外部から
			// notifyBeforeMinutes が変わっても編集中の入力値は保持される。
			function ExternalMinutesChanger() {
				const [externalMinutes, setExternalMinutes] = useState(5);
				return (
					<>
						<button
							type="button"
							onClick={() => setExternalMinutes(30)}
							data-testid="force-change-external"
						>
							外部から minutes を 30 に変更
						</button>
						<RouteRegistration
							db={db}
							routes={notifyEnabledRoutes}
							{...baseHandlers()}
							hasNotifyEnabledRoutes={true}
							notifyBeforeMinutes={externalMinutes}
							setNotifyBeforeMinutes={setExternalMinutes}
						/>
					</>
				);
			}
			render(<ExternalMinutesChanger />);
			const input = screen.getByRole("spinbutton", { name: "通知タイミング" });

			// ユーザーが編集中（確定前）
			fireEvent.change(input, { target: { value: "12" } });
			expect(input).toHaveValue(12);

			// 外部（親の別経路）から notifyBeforeMinutes が 30 へ変わる
			fireEvent.click(screen.getByTestId("force-change-external"));

			// 確定値表示は 30 に追従するが、入力中の値 12 は壊されない
			expect(
				screen.getByText(/現在、出発\s*30\s*分前に通知します/),
			).toBeInTheDocument();
			expect(input).toHaveValue(12);
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

/**
 * Issue #90: 乗降車バス停の候補を直通便で絞り込む統合テスト。
 *
 * 専用の GTFS データを構築し、T001: A→B→C の直通便のみが存在する状況で、
 * - 乗車バス停選択後の降車バス停候補が絞り込まれること
 * - 直通便が無い組み合わせで submit してもガードが働くこと
 * を確認する。
 */
describe("RouteRegistration（到達可能性フィルタ）", () => {
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

	it("乗車バス停選択後、降車バス停の候補は直通便で到達可能な停留所のみ表示される", async () => {
		const onAdd = vi.fn().mockResolvedValue(1);
		const onUpdate = vi.fn().mockResolvedValue(undefined);
		const onDelete = vi.fn().mockResolvedValue(undefined);

		render(
			<RouteRegistration
				db={db}
				routes={[]}
				onAdd={onAdd}
				onUpdate={onUpdate}
				onDelete={onDelete}
			/>,
		);

		// 乗車バス停で A を選択
		const fromInput = screen.getByRole("combobox", { name: "乗車バス停" });
		await userEvent.type(fromInput, "A停");
		await userEvent.click(screen.getByText("A停"));

		// 降車バス停のドロップダウンを開く
		const toInput = screen.getByRole("combobox", { name: "降車バス停" });
		await userEvent.type(toInput, "停");

		// A 発の直通便で到達できる B, C のみが候補になり、D と A 自身は除外される
		expect(screen.getByText("B停")).toBeInTheDocument();
		expect(screen.getByText("C停")).toBeInTheDocument();
		// A は乗車バス停の入力欄に残っているため、getAllByText で降車ドロップダウン側に
		// A が現れていないことを確認する（listbox 内に A が無いことを検証）
		const listbox = screen.getByRole("listbox");
		expect(listbox).not.toHaveTextContent("A停");
		expect(listbox).not.toHaveTextContent("D停");
	});

	it("降車バス停選択後、乗車バス停の候補は直通便で到達可能な停留所のみ表示される", async () => {
		const onAdd = vi.fn().mockResolvedValue(1);
		const onUpdate = vi.fn().mockResolvedValue(undefined);
		const onDelete = vi.fn().mockResolvedValue(undefined);

		render(
			<RouteRegistration
				db={db}
				routes={[]}
				onAdd={onAdd}
				onUpdate={onUpdate}
				onDelete={onDelete}
			/>,
		);

		// 降車バス停で C を選択
		const toInput = screen.getByRole("combobox", { name: "降車バス停" });
		await userEvent.type(toInput, "C停");
		await userEvent.click(screen.getByText("C停"));

		// 乗車バス停のドロップダウンを開く
		const fromInput = screen.getByRole("combobox", { name: "乗車バス停" });
		await userEvent.type(fromInput, "停");

		// C に直通で到達できる A, B のみが候補になる
		expect(screen.getByText("A停")).toBeInTheDocument();
		expect(screen.getByText("B停")).toBeInTheDocument();
		const listbox = screen.getByRole("listbox");
		expect(listbox).not.toHaveTextContent("C停");
		expect(listbox).not.toHaveTextContent("D停");
	});

	it("直通便の無い組み合わせで submit するとエラーメッセージが表示され onAdd は呼ばれない", async () => {
		const onAdd = vi.fn().mockResolvedValue(1);
		const onUpdate = vi.fn().mockResolvedValue(undefined);
		const onDelete = vi.fn().mockResolvedValue(undefined);

		// 編集経由で A → D（直通便なし）を事前に入れる。
		// 編集モードで form state にセットされたあと、そのまま「更新」を押して
		// submit ガードが働くかを検証する。
		const unreachableRoute: RegisteredRouteEntry = {
			id: 1,
			fromStopId: "test:S001",
			toStopId: "test:S004",
			walkMinutes: 10,
		};

		render(
			<RouteRegistration
				db={db}
				routes={[unreachableRoute]}
				onAdd={onAdd}
				onUpdate={onUpdate}
				onDelete={onDelete}
			/>,
		);

		// 編集ボタンを押して form に A → D を載せる
		await userEvent.click(screen.getByRole("button", { name: "編集" }));

		// 「更新」ボタンを押す → submit ガードでエラーが表示される
		await userEvent.click(screen.getByRole("button", { name: "更新" }));

		// UX 文言の意図しない退化を検出できるよう、実装側の実文言
		// 「選択したバス停間に直通便がありません。別の組み合わせを選んでください」の
		// 冒頭フレーズにマッチさせる（coderabbitai #96 nitpick）。
		expect(screen.getByRole("alert")).toHaveTextContent(
			/選択したバス停間に直通便がありません/,
		);
		expect(onUpdate).not.toHaveBeenCalled();
	});
});
