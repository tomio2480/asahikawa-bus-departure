import { useCallback, useMemo, useState } from "react";
import type { Database } from "sql.js";
import {
	NOTIFY_MAX_MINUTES,
	NOTIFY_MIN_MINUTES,
} from "../constants/notification";
import { useNotifyBeforeMinutesInput } from "../hooks/useNotifyBeforeMinutesInput";
import { useToast } from "../hooks/useToast";
import { isReachable } from "../lib/stop-reachability";
import {
	type ReachabilityFilter,
	type StopSearchResult,
	getSiblingStopIds,
	getStopName,
	searchStops,
} from "../lib/stop-search";
import type { RegisteredRouteEntry, RouteEntry } from "../types/route-entry";
import { StopSearch } from "./StopSearch";

type RouteRegistrationProps = {
	/** sql.js データベースインスタンス */
	db: Database;
	/** 登録済み経路一覧 */
	routes: RegisteredRouteEntry[];
	/** 経路追加コールバック */
	onAdd: (entry: Omit<RouteEntry, "id">) => Promise<number>;
	/** 経路更新コールバック */
	onUpdate: (entry: RegisteredRouteEntry) => Promise<void>;
	/** 経路削除コールバック */
	onDelete: (id: number) => Promise<void>;
	/** 通知パーミッション要求 */
	onRequestNotificationPermission?: () => Promise<NotificationPermission>;
	/** 現在の通知パーミッション（警告表示のために使用） */
	notifyPermission?: NotificationPermission | "unsupported";
	/** 通知が有効な経路が 1 件以上あるかどうか */
	hasNotifyEnabledRoutes?: boolean;
	/** 通知する出発目安の何分前（確定値／表示用、undefined のとき通知タイミング UI を非表示） */
	notifyBeforeMinutes?: number;
	/**
	 * 通知タイミングを永続化するハンドラ。undefined のときは通知タイミング UI を非表示にする。
	 * 入力値の一時保持・バリデーション・確定処理は本コンポーネント内部の
	 * useNotifyBeforeMinutesInput が担い、確定成功時のみ本ハンドラを呼び出す。
	 */
	setNotifyBeforeMinutes?: (value: number) => void;
};

type FormState = {
	fromStop: StopSearchResult | null;
	toStop: StopSearchResult | null;
	/**
	 * 乗車バス停の入力欄に現在入っている文字列。
	 *
	 * `fromStop` が null でも query が非空のときは「ユーザーは文字を
	 * 入力したが有効な候補を選択していない」状態であり、submit 時の
	 * エラー文言を「選択してください」ではなく「入力された ... は候補に
	 * ありません」に分岐させるために使う。StopSearch からは
	 * onQueryChange 経由で同期する。
	 */
	fromStopQuery: string;
	/** 降車バス停の入力欄に現在入っている文字列（用途は fromStopQuery と同じ）。 */
	toStopQuery: string;
	walkMinutes: string;
	notifyEnabled: boolean;
};

const initialFormState: FormState = {
	fromStop: null,
	toStop: null,
	fromStopQuery: "",
	toStopQuery: "",
	walkMinutes: "10",
	notifyEnabled: false,
};

/**
 * 乗車・降車に同一バス停が指定された場合のエラーメッセージ。
 * describeUnselectedStopError 内（手入力で相手と同名を指定した経路）と
 * handleSubmit の stop_id 比較（選択経由で同一 ID になる経路）の 2 箇所で
 * 使う。文言が片方だけ変わるとテストの完全一致 assert が破綻するため、
 * 単一の定数として一元化する（self-review Code-Quality S1 対応）。
 */
const SAME_STOP_ERROR_MESSAGE =
	"乗車バス停と降車バス停に同じバス停は指定できません。";

/**
 * `StopSearchResult` の stop_name が query と NFKC 正規化で厳密一致するか判定する。
 *
 * `searchStops` は SQL `LIKE '%query%'` による部分一致で候補を広く取得する
 * ため、存在判定には使えない（例: 「富良野」と入力すると「上富良野」に
 * ヒットするが、ユーザー認識では「富良野というバス停は無い」）。
 * クラスタ統合によって stop_name が "短い名/長い名" の結合表現になる
 * ケースも考慮し、スラッシュで分割した各名称のいずれかが一致するかを確認する。
 */
function isExactStopNameMatch(
	result: StopSearchResult,
	query: string,
): boolean {
	const normalizedQuery = query.normalize("NFKC");
	return result.stop_name
		.split("/")
		.some((name) => name.normalize("NFKC") === normalizedQuery);
}

/**
 * 乗車または降車のバス停が未選択な状態で submit された際のエラー文言を決定する。
 *
 * `searchStops` は SQL `LIKE '%query%'` で部分一致する候補を返すため、
 * 「部分一致 hits が空か」と「厳密一致 hits が空か」を二段で判定する。
 *
 * 分岐の意図（ユーザー指摘対応）:
 * - query が空：従来通り「選択してください」
 * - 相手バス停と同名の手入力：「同じバス停は指定できません」
 *   （Cycle 10 追加。候補 UI は相手を除外するため「選択」経路では
 *   同名指定が発生しないが、キーボードで相手と全く同じ名称を手入力
 *   された場合、以降の reachabilityFilter 付き searchStops は自分
 *   自身を候補から除外するため「到達できません」分岐に誤誘導される。
 *   問題の本質＝同一バス停指定をそのまま伝えるため最優先で分岐する）
 * - 部分一致も 0 件：「存在しません」（誤記・地名の勘違い）
 * - 部分一致はあるが厳密一致 0 件：「一致するバス停が見つかりません」
 *   （例: 「富良野」で「上富良野」がヒットする状況。候補はあるがユーザーの
 *   認識どおり該当名称のバス停は存在しない旨を伝える）
 * - 厳密一致あり、相手バス停未選択：「候補から選択してください」
 * - 厳密一致あり、相手から乗り換えなしで到達できない：「到達できません」
 * - 厳密一致あり、到達可能でもあるが候補選択未実行：「候補から選択してください」
 */
function describeUnselectedStopError(params: {
	side: "from" | "to";
	query: string;
	db: Database;
	partnerFilter: ReachabilityFilter | undefined;
	/**
	 * 相手バス停の stop_name（選択済みの場合のみ非 undefined）。
	 * クラスタで結合された「短い名/長い名」形式もそのまま渡す前提で、
	 * 内部で "/" で分割して NFKC 正規化のうえ厳密一致を判定する。
	 */
	partnerStopName: string | undefined;
}): string {
	const { side, query, db, partnerFilter, partnerStopName } = params;
	const trimmed = query.trim();
	const sideLabel = side === "from" ? "乗車バス停" : "降車バス停";
	const partnerLabel = side === "from" ? "降車バス停" : "乗車バス停";

	if (trimmed === "") {
		return `${sideLabel}を選択してください。`;
	}

	// 相手バス停と同名を手入力しているケースは、以降の partialHits / exactHits /
	// reachableExactHits による分岐よりも優先して「同じバス停は指定できません」
	// に振り分ける。handleSubmit 本体の stop_id 比較と同じ禁止事項を、
	// 「候補未選択だが入力だけは完了している」状態でも同一文言で伝える。
	if (partnerStopName) {
		const normalizedQuery = trimmed.normalize("NFKC");
		const partnerMatches = partnerStopName
			.split("/")
			.some((name) => name.normalize("NFKC") === normalizedQuery);
		if (partnerMatches) {
			return SAME_STOP_ERROR_MESSAGE;
		}
	}

	// 部分一致すら無ければ「存在しません」。
	const partialHits = searchStops(db, trimmed);
	if (partialHits.length === 0) {
		return `入力された${sideLabel}「${query}」は存在しません。候補から選択してください。`;
	}

	// 部分一致はあるが stop_name 厳密一致が無ければ「該当するバス停はない」。
	// 候補リストに部分一致結果が並んでいる状態で「存在しません」と断定すると
	// 「候補に出ているのに？」という違和感を招くため、独立した文言に分岐する。
	const exactHits = partialHits.filter((h) => isExactStopNameMatch(h, trimmed));
	if (exactHits.length === 0) {
		return `入力された${sideLabel}「${query}」に一致するバス停が見つかりません。候補から選択してください。`;
	}

	// 相手バス停が未選択なら到達可能性は判定できない。厳密一致の存在は
	// 分かっているので「候補から選択してください」に誘導する。
	if (!partnerFilter) {
		return `入力された${sideLabel}「${query}」は候補から選択してください。`;
	}

	// 相手バス停が選択済みで、到達可能性フィルタ下でも厳密一致が残るかを判定。
	// partialHits と異なり reachabilityFilter を通した検索結果を再取得し、
	// 同じ厳密一致条件で再フィルタする。
	const reachableExactHits = searchStops(
		db,
		trimmed,
		undefined,
		partnerFilter,
	).filter((h) => isExactStopNameMatch(h, trimmed));
	if (reachableExactHits.length === 0) {
		// 「起点から終点へは乗り換えなしで到達できません」の語順で統一し、
		// from / to どちらから呼ばれても末尾が揃うよう助詞だけ切り替える。
		const directionalClause =
			side === "from" ? `から${partnerLabel}へは` : `へは${partnerLabel}から`;
		return `入力された${sideLabel}「${query}」${directionalClause}乗り換えなしで到達できません。別のバス停を選択してください。`;
	}

	// 厳密一致あり・到達可能でもあるが候補選択されていないケース。
	return `入力された${sideLabel}「${query}」は候補から選択してください。`;
}

type NotifySettingsProps = {
	/** 通知する出発目安の何分前（確定値） */
	notifyBeforeMinutes: number;
	/** 通知タイミングを永続化するハンドラ */
	setNotifyBeforeMinutes: (value: number) => void;
	/** フォーム送信中かどうか（設定ボタンの disabled 制御） */
	submitting: boolean;
	/** トグル処理中の経路 ID（設定ボタンの disabled 制御） */
	togglingRouteId: number | null;
	/** 通知パーミッション要求 */
	onRequestNotificationPermission?: () => Promise<NotificationPermission>;
	/** 現在の通知パーミッション */
	notifyPermission?: NotificationPermission | "unsupported";
};

/**
 * 通知タイミング設定 UI。
 *
 * showNotifySettings=true のときだけ親からマウントされる前提で、
 * notifyBeforeMinutes / setNotifyBeforeMinutes を非 optional で受け取る。
 * こうすることで内部フック useNotifyBeforeMinutesInput の useState 初期化子は
 * 必ず確定値で走り、親側での `?? フォールバック` と `NOOP_SET_MINUTES` を
 * 介した呼び出しによる「undefined→defined 遷移時にフォールバック値が
 * 入力欄に取り残される」罠（PR #95 CodeRabbit 指摘）を構造的に排除する。
 */
function NotifySettings({
	notifyBeforeMinutes,
	setNotifyBeforeMinutes,
	submitting,
	togglingRouteId,
	onRequestNotificationPermission,
	notifyPermission,
}: NotifySettingsProps) {
	const {
		inputValue,
		setInputValue,
		canCommit,
		commit: internalCommit,
	} = useNotifyBeforeMinutesInput(notifyBeforeMinutes, setNotifyBeforeMinutes);
	const { showToast } = useToast();

	/**
	 * 通知分前入力の確定処理。Enter キー押下 / 設定ボタンクリック時に呼び出され、
	 * 内部フックの commit に委譲する。設定ボタン側の disabled 条件と対称に
	 * busy / validity を明示ガードし、Enter 経路でも誤トースト表示を防ぐ。
	 */
	const commitNotifyInput = () => {
		if (submitting || togglingRouteId !== null) return;
		if (!canCommit) return;
		const result = internalCommit();
		if (result.ok) {
			showToast(
				`出発の ${result.committedMinutes} 分前に通知するように設定しました`,
				{ variant: "success" },
			);
			return;
		}
		const detail =
			result.error instanceof Error
				? result.error.message
				: String(result.error);
		showToast(`通知タイミングを設定できませんでした: ${detail}`, {
			variant: "error",
		});
	};

	return (
		<div className="space-y-2 text-sm">
			<p className="font-semibold text-base-content">
				{`現在、出発 ${notifyBeforeMinutes} 分前に通知します`}
			</p>
			<div className="flex items-center gap-2">
				<label
					htmlFor="notify-before-minutes"
					className="text-base-content/70 cursor-pointer"
				>
					通知タイミング
				</label>
				<input
					id="notify-before-minutes"
					type="number"
					className="input input-bordered input-xs w-14"
					min={NOTIFY_MIN_MINUTES}
					max={NOTIFY_MAX_MINUTES}
					step="1"
					aria-describedby="notify-before-minutes-unit"
					value={inputValue}
					onChange={(e) => {
						// 確定は Enter キー / 設定ボタンで行う（入力中の逐次 persist を防ぐ）。
						// blur による自動確定は廃止（意図しない確定を避けるため）。
						setInputValue(e.target.value);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							commitNotifyInput();
						}
					}}
				/>
				<span id="notify-before-minutes-unit" className="text-base-content/70">
					分前
				</span>
				<button
					type="button"
					className="btn btn-xs btn-primary"
					onClick={commitNotifyInput}
					disabled={!canCommit || submitting || togglingRouteId !== null}
					aria-label="通知タイミングを設定"
				>
					設定
				</button>
				{notifyPermission === "default" && onRequestNotificationPermission && (
					<button
						type="button"
						className="btn btn-xs btn-outline"
						onClick={onRequestNotificationPermission}
					>
						通知を許可
					</button>
				)}
			</div>
		</div>
	);
}

/** 経路登録・編集・削除を行うコンポーネント */
export function RouteRegistration({
	db,
	routes,
	onAdd,
	onUpdate,
	onDelete,
	onRequestNotificationPermission,
	notifyPermission,
	hasNotifyEnabledRoutes,
	notifyBeforeMinutes,
	setNotifyBeforeMinutes,
}: RouteRegistrationProps) {
	// Issue #93: 通知タイミング入力フックは RouteRegistration 内部に配置し
	// AppContent 全体の再レンダを避ける。さらに PR #95 CodeRabbit 指摘対応で、
	// notifyBeforeMinutes / setNotifyBeforeMinutes が両方揃ったときだけ
	// 子コンポーネント NotifySettings をマウントし、その内部でフックを呼ぶ。
	// これにより useState 初期化子は必ず確定値で走り、フォールバック値が
	// 入力欄に残り続けるトラップを型レベルで排除できる。
	const stopNameMap = useMemo(() => {
		const ids = new Set<string>();
		for (const route of routes) {
			ids.add(route.fromStopId);
			ids.add(route.toStopId);
		}
		const map = new Map<string, string>();
		for (const id of ids) {
			try {
				map.set(id, getStopName(db, id));
			} catch {
				map.set(id, id);
			}
		}
		return map;
	}, [db, routes]);

	const [form, setForm] = useState<FormState>(initialFormState);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// Issue #90: 選択済みの相手バス停から、StopSearch に渡す到達可能性フィルタを
	// 構築する。兄弟バス停（同名近距離・上下線など）まで展開した stop_id 群を
	// 与えることで、事業者違い・方向違いでも直通便が存在すれば候補として残す。
	const fromStopSiblings = useMemo(
		() => (form.fromStop ? getSiblingStopIds(db, form.fromStop.stop_id) : null),
		[db, form.fromStop],
	);
	const toStopSiblings = useMemo(
		() => (form.toStop ? getSiblingStopIds(db, form.toStop.stop_id) : null),
		[db, form.toStop],
	);
	const toStopFilter = useMemo(
		() =>
			fromStopSiblings ? { reachableFromOrigin: fromStopSiblings } : undefined,
		[fromStopSiblings],
	);
	const fromStopFilter = useMemo(
		() =>
			toStopSiblings ? { reachableToDestination: toStopSiblings } : undefined,
		[toStopSiblings],
	);
	// トグル処理中の経路 ID。submitting と分離することで、フォーム側の
	// 「登録」ボタンが通知 ON/OFF のたびに「保存中...」へ切り替わるなどの
	// 表示揺れを防ぐ。トグル処理は複数同時実行させないため null | number で十分。
	const [togglingRouteId, setTogglingRouteId] = useState<number | null>(null);

	const { showToast } = useToast();

	const resetForm = useCallback(() => {
		setForm(initialFormState);
		setEditingId(null);
		setErrorMessage(null);
	}, []);

	/**
	 * フォーム state を更新すると同時に表示中のエラー文言をクリアする。
	 *
	 * エラー表示後にユーザーが入力を書き直してもメッセージが残り続けると、
	 * 「まだ問題が解消していない」と誤解させる（ユーザー指摘）。form state
	 * を変更する全操作（バス停選択・入力・徒歩時間・通知トグル）で errorMessage
	 * を null に戻し、ユーザーに「入力が受理された」というフィードバックを返す。
	 * 送信失敗時は handleSubmit が再度 setErrorMessage を呼ぶため、
	 * クリア → 次 submit で再表示、のサイクルで整合する。
	 */
	const updateForm = useCallback((updater: (prev: FormState) => FormState) => {
		setForm(updater);
		setErrorMessage(null);
	}, []);

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			setErrorMessage(null);

			// 乗車・降車の未選択エラーは両側で独立に評価し、問題があれば両方を
			// 同じ alert にまとめて表示する（ユーザー指摘: 片方ずつ出すと
			// 「乗車を直してから再送信するとまだ降車も問題だった」という
			// 二度手間になる）。外側の if で「少なくとも一方が未選択」を
			// 判定に入れることで、以降のコードでは form.fromStop / form.toStop が
			// ともに non-null であることを TypeScript の narrowing が認識する。
			if (!form.fromStop || !form.toStop) {
				const fromError = !form.fromStop
					? describeUnselectedStopError({
							side: "from",
							query: form.fromStopQuery,
							db,
							partnerFilter: fromStopFilter,
							partnerStopName: form.toStop?.stop_name,
						})
					: null;
				const toError = !form.toStop
					? describeUnselectedStopError({
							side: "to",
							query: form.toStopQuery,
							db,
							partnerFilter: toStopFilter,
							partnerStopName: form.fromStop?.stop_name,
						})
					: null;
				setErrorMessage([fromError, toError].filter(Boolean).join("\n"));
				return;
			}
			if (form.fromStop.stop_id === form.toStop.stop_id) {
				// ユーザー指摘: 禁止事項として「同じバス停は指定できません」の
				// 否定形のほうが「異なるバス停を選択してください」の間接表現
				// よりも即座に問題を把握できる。文言だけの変更で挙動は不変。
				setErrorMessage(SAME_STOP_ERROR_MESSAGE);
				return;
			}

			// Issue #90: 直通便で到達不能な組み合わせを弾く。
			// 兄弟バス停（上下線・事業者違い）まで展開して判定することで、
			// 選択肢として見えている「同一物理停留所」からの直通便を網羅する。
			// 兄弟展開結果は親側で useMemo 済みのため、送信時は再計算せず
			// メモ化値を再利用する（gemini-code-assist #96 指摘）。
			// `??` を使うのは `string[] | null` に対して空配列を falsy 扱いしない
			// ためで、理屈上フォールバックへは到達しないが型安全のガードとして置く。
			const fromIds =
				fromStopSiblings ?? getSiblingStopIds(db, form.fromStop.stop_id);
			const toIds =
				toStopSiblings ?? getSiblingStopIds(db, form.toStop.stop_id);
			if (!isReachable(db, fromIds, toIds)) {
				// 文言はユーザー向けに「直通便」等の運行用語を避け、
				// 注意書き（到達可能性フィルタの予告）と用語を揃えて
				// 「乗り換えなしで到達」で統一する（coderabbitai #95 の
				// 「ユーザー向け文言の揺れを避ける」指摘を踏襲）。
				setErrorMessage(
					"乗り換えなしで到達できる便が見つかりませんでした。別の組み合わせを選んでください。",
				);
				return;
			}

			const DEFAULT_WALK_MINUTES = 10;
			const walkMinutes =
				form.walkMinutes === ""
					? DEFAULT_WALK_MINUTES
					: Number(form.walkMinutes);
			if (!Number.isFinite(walkMinutes)) {
				setErrorMessage("徒歩所要時間を入力してください");
				return;
			}
			if (walkMinutes < 0) {
				setErrorMessage("徒歩所要時間は0以上で入力してください");
				return;
			}

			// permission が denied でもユーザーの意図は保存し、発火側 (useNotification) で抑止する。
			// permission 要求は副作用としてのみ呼び、結果で notifyEnabled を上書きしない
			// （登録済み経路トグルと同じポリシー）。
			const notifyEnabled = form.notifyEnabled;
			if (notifyEnabled && onRequestNotificationPermission) {
				await onRequestNotificationPermission();
			}

			setSubmitting(true);
			try {
				const entry: Omit<RouteEntry, "id"> = {
					fromStopId: form.fromStop.stop_id,
					toStopId: form.toStop.stop_id,
					walkMinutes,
					notifyEnabled,
				};
				// 成功トーストで「どの経路が登録されたか」を示す。既存の通知トグル
				// トースト（`... の通知を ON にしました`）と様式を揃え、
				// 文言退化を避けるため resetForm 前に stop_name を読み出しておく。
				const routeLabel = `${form.fromStop.stop_name} → ${form.toStop.stop_name}`;
				if (editingId != null) {
					await onUpdate({ ...entry, id: editingId });
					showToast(`${routeLabel} を更新しました`, { variant: "success" });
				} else {
					await onAdd(entry);
					showToast(`${routeLabel} を登録しました`, { variant: "success" });
				}
				resetForm();
			} catch (err) {
				setErrorMessage(
					err instanceof Error ? err.message : "保存に失敗しました",
				);
			} finally {
				setSubmitting(false);
			}
		},
		[
			db,
			form,
			fromStopSiblings,
			toStopSiblings,
			fromStopFilter,
			toStopFilter,
			editingId,
			onAdd,
			onUpdate,
			resetForm,
			onRequestNotificationPermission,
			showToast,
		],
	);

	const handleEdit = useCallback(
		(route: RegisteredRouteEntry) => {
			const fromName = stopNameMap.get(route.fromStopId) ?? route.fromStopId;
			const toName = stopNameMap.get(route.toStopId) ?? route.toStopId;
			setForm({
				fromStop: {
					stop_id: route.fromStopId,
					stop_name: fromName,
					clusterStopIds: [route.fromStopId],
				},
				toStop: {
					stop_id: route.toStopId,
					stop_name: toName,
					clusterStopIds: [route.toStopId],
				},
				// 編集開始時は入力欄にも stop_name が入るため、query も同じ値で
				// 初期化する（StopSearch からの onQueryChange 同期を待つ間の
				// 整合性を保つ）。
				fromStopQuery: fromName,
				toStopQuery: toName,
				walkMinutes: String(route.walkMinutes),
				notifyEnabled: route.notifyEnabled === true,
			});
			setEditingId(route.id);
			setErrorMessage(null);
		},
		[stopNameMap],
	);

	const handleDelete = useCallback(
		async (id: number) => {
			setSubmitting(true);
			try {
				await onDelete(id);
				if (editingId === id) {
					resetForm();
				}
			} catch (err) {
				setErrorMessage(
					err instanceof Error ? err.message : "削除に失敗しました",
				);
			} finally {
				setSubmitting(false);
			}
		},
		[onDelete, editingId, resetForm],
	);

	return (
		<div className="space-y-6">
			<form
				onSubmit={handleSubmit}
				className="card bg-base-100 shadow-sm"
				noValidate
			>
				<div className="card-body">
					<h2 className="card-title">
						{editingId != null ? "経路を編集" : "経路を登録"}
					</h2>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<StopSearch
							db={db}
							label="乗車バス停"
							onSelect={(stop) =>
								updateForm((prev) => ({ ...prev, fromStop: stop }))
							}
							onQueryChange={(q) =>
								updateForm((prev) => ({ ...prev, fromStopQuery: q }))
							}
							selectedStop={form.fromStop}
							reachabilityFilter={fromStopFilter}
						/>
						<StopSearch
							db={db}
							label="降車バス停"
							onSelect={(stop) =>
								updateForm((prev) => ({ ...prev, toStop: stop }))
							}
							onQueryChange={(q) =>
								updateForm((prev) => ({ ...prev, toStopQuery: q }))
							}
							selectedStop={form.toStop}
							reachabilityFilter={toStopFilter}
						/>
					</div>
					{/*
					 * Issue #90 派生：到達可能性フィルタ（#96）により、片方のバス停を
					 * 選択すると乗り換えなしで到達できない候補は自動的に除外される。
					 * 「実在する地名を入力しても候補に出てこない」現象をユーザーが
					 * 故障と誤認しないよう、submit 時のエラーメッセージと同じ
					 * 「乗り換えなしで到達できない」というキーワードで予告する。
					 */}
					<p className="text-xs text-base-content/60">
						実在するバス停が選択候補にでない場合、乗り換えなしで到達できない組み合わせのため、候補に出てこない可能性があります。
					</p>
					<div className="form-control w-full max-w-xs">
						<label className="label" htmlFor="walk-minutes">
							<span className="label-text">徒歩所要時間（分）</span>
						</label>
						<input
							id="walk-minutes"
							type="number"
							className="input input-bordered w-full max-w-xs"
							min="0"
							step="1"
							value={form.walkMinutes}
							onChange={(e) =>
								updateForm((prev) => ({
									...prev,
									walkMinutes: e.target.value,
								}))
							}
							placeholder="10"
						/>
					</div>
					<div className="form-control">
						<label className="label cursor-pointer gap-2 justify-start">
							<input
								type="checkbox"
								className="toggle toggle-primary toggle-sm"
								checked={form.notifyEnabled}
								onChange={(e) =>
									updateForm((prev) => ({
										...prev,
										notifyEnabled: e.target.checked,
									}))
								}
							/>
							<span className="label-text">通知</span>
						</label>
					</div>
					{errorMessage && (
						// 乗車・降車両側のエラーを 1 つの alert にまとめて表示するため、
						// 改行文字を視覚的改行として反映する。role="alert" を 1 つに
						// 保つことでスクリーンリーダーの読み上げ順も一貫させる。
						<div
							className="text-error text-sm whitespace-pre-line"
							role="alert"
						>
							{errorMessage}
						</div>
					)}
					<div className="card-actions justify-end">
						{editingId != null && (
							<button
								type="button"
								className="btn btn-ghost"
								onClick={resetForm}
								disabled={submitting || togglingRouteId !== null}
							>
								キャンセル
							</button>
						)}
						<button
							type="submit"
							className="btn btn-primary"
							disabled={submitting}
						>
							{submitting ? "保存中..." : editingId != null ? "更新" : "登録"}
						</button>
					</div>
				</div>
			</form>

			{routes.length > 0 && (
				<div className="card bg-base-100 shadow-sm">
					<div className="card-body">
						<h2 className="card-title">登録済み経路</h2>
						{notifyPermission === "denied" && (
							<div className="alert alert-warning py-2 text-sm" role="alert">
								ブラウザの通知が拒否されています。通知 ON
								の経路でも出発前の通知は送信されません。ブラウザ設定で許可に変更してください。
							</div>
						)}
						{hasNotifyEnabledRoutes === true &&
							notifyBeforeMinutes !== undefined &&
							setNotifyBeforeMinutes !== undefined && (
								<NotifySettings
									notifyBeforeMinutes={notifyBeforeMinutes}
									setNotifyBeforeMinutes={setNotifyBeforeMinutes}
									submitting={submitting}
									togglingRouteId={togglingRouteId}
									onRequestNotificationPermission={
										onRequestNotificationPermission
									}
									notifyPermission={notifyPermission}
								/>
							)}
						<div className="overflow-x-auto">
							<table className="table">
								<thead>
									<tr>
										<th>乗車バス停</th>
										<th>降車バス停</th>
										<th>徒歩（分）</th>
										<th>通知</th>
										<th>操作</th>
									</tr>
								</thead>
								<tbody>
									{routes.map((route) => (
										<tr key={route.id}>
											<td>
												{stopNameMap.get(route.fromStopId) ?? route.fromStopId}
											</td>
											<td>
												{stopNameMap.get(route.toStopId) ?? route.toStopId}
											</td>
											<td>{route.walkMinutes}</td>
											<td>
												<input
													type="checkbox"
													className="toggle toggle-primary toggle-xs"
													checked={route.notifyEnabled === true}
													onChange={async () => {
														// submitting（フォーム送信用）とは別状態で管理し、
														// 登録/更新ボタンの表示（テキスト・disabled）が通知 ON/OFF で
														// 乱れないようにする。
														setTogglingRouteId(route.id);
														// 「どの経路を切り替えたか」を明示するためバス停名を文言に含める。
														// 失敗時のトーストでも同じ文脈を提示できるよう先に組み立てる。
														const fromName =
															stopNameMap.get(route.fromStopId) ??
															route.fromStopId;
														const toName =
															stopNameMap.get(route.toStopId) ?? route.toStopId;
														const routeLabel = `${fromName} → ${toName}`;
														try {
															// permission が "default" のときに許可プロンプトを促す。
															// "denied" のときはユーザーの意図だけ保存し、発火側 (useNotification) で抑止する。
															// permission 要求の rejection もこの try/catch で捕捉するため
															// ここに入れている（以前は try 外で rejection が未処理になっていた）。
															if (
																!route.notifyEnabled &&
																onRequestNotificationPermission
															) {
																await onRequestNotificationPermission();
															}
															const nextEnabled = !route.notifyEnabled;
															await onUpdate({
																...route,
																notifyEnabled: nextEnabled,
															});
															showToast(
																nextEnabled
																	? `${routeLabel} の通知を ON にしました`
																	: `${routeLabel} の通知を OFF にしました`,
																{ variant: "success" },
															);
														} catch (err) {
															const detail =
																err instanceof Error
																	? err.message
																	: "通知設定の更新に失敗しました";
															showToast(
																`${routeLabel} の通知設定に失敗しました: ${detail}`,
																{
																	variant: "error",
																},
															);
														} finally {
															setTogglingRouteId(null);
														}
													}}
													disabled={submitting || togglingRouteId !== null}
													aria-label="通知の切り替え"
												/>
											</td>
											<td className="space-x-2">
												<button
													type="button"
													className="btn btn-ghost btn-xs"
													onClick={() => handleEdit(route)}
													disabled={submitting || togglingRouteId !== null}
												>
													編集
												</button>
												<button
													type="button"
													className="btn btn-ghost btn-xs text-error"
													onClick={() => handleDelete(route.id)}
													disabled={submitting || togglingRouteId !== null}
												>
													削除
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
