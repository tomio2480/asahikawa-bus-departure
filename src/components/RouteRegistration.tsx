import { useCallback, useEffect, useMemo, useState } from "react";
import type { Database } from "sql.js";
import { useToast } from "../hooks/useToast";
import { type StopSearchResult, getStopName } from "../lib/stop-search";
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
	/** 通知する出発目安の何分前（undefined のとき通知タイミング UI を非表示） */
	notifyBeforeMinutes?: number;
	/** 通知タイミング変更コールバック */
	onNotifyBeforeMinutesChange?: (minutes: number) => void;
};

type FormState = {
	fromStop: StopSearchResult | null;
	toStop: StopSearchResult | null;
	walkMinutes: string;
	notifyEnabled: boolean;
};

const initialFormState: FormState = {
	fromStop: null,
	toStop: null,
	walkMinutes: "10",
	notifyEnabled: false,
};

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
	onNotifyBeforeMinutesChange,
}: RouteRegistrationProps) {
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
	// トグル処理中の経路 ID。submitting と分離することで、フォーム側の
	// 「登録」ボタンが通知 ON/OFF のたびに「保存中...」へ切り替わるなどの
	// 表示揺れを防ぐ。トグル処理は複数同時実行させないため null | number で十分。
	const [togglingRouteId, setTogglingRouteId] = useState<number | null>(null);

	const { showToast } = useToast();

	// 通知分前入力のローカル表示値（一時クリアを許容するため string で管理）
	const [notifyInputValue, setNotifyInputValue] = useState(() =>
		notifyBeforeMinutes !== undefined ? String(notifyBeforeMinutes) : "",
	);
	// 外部から prop が変更された場合（localStorage 初期読込等）に同期する
	useEffect(() => {
		if (notifyBeforeMinutes !== undefined) {
			setNotifyInputValue(String(notifyBeforeMinutes));
		}
	}, [notifyBeforeMinutes]);

	/**
	 * 現在の入力値が有効（整数かつ 1〜60）かどうか。
	 * UI 属性 min="1" max="60" step="1" と意図を揃える。
	 */
	const notifyInputParsed = Number(notifyInputValue);
	const isNotifyInputValid =
		notifyInputValue.trim() !== "" &&
		Number.isInteger(notifyInputParsed) &&
		notifyInputParsed >= 1 &&
		notifyInputParsed <= 60;
	const isNotifyInputChanged =
		notifyBeforeMinutes === undefined ||
		notifyInputParsed !== notifyBeforeMinutes;
	const canCommitNotifyInput = isNotifyInputValid && isNotifyInputChanged;

	/**
	 * 通知分前入力の確定処理。
	 * Enter キー押下 / 設定ボタンクリック時に呼び出され、onNotifyBeforeMinutesChange
	 * に伝播する。呼び出し元が throw した場合はエラートーストで通知する。
	 */
	const commitNotifyInput = () => {
		if (!canCommitNotifyInput) return;
		try {
			onNotifyBeforeMinutesChange?.(notifyInputParsed);
			showToast(`通知タイミングを ${notifyInputParsed} 分前に設定しました`, {
				variant: "success",
			});
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			showToast(`通知タイミングを設定できませんでした: ${detail}`, {
				variant: "error",
			});
			// 確定に失敗したのに入力欄だけ新しい値のまま残ると、保存済みの値と
			// 画面表示が乖離してユーザーの誤解を招く。props の現在値へロールバック
			// して、表示と永続化値の整合を保つ。
			if (notifyBeforeMinutes !== undefined) {
				setNotifyInputValue(String(notifyBeforeMinutes));
			}
		}
	};

	const resetForm = useCallback(() => {
		setForm(initialFormState);
		setEditingId(null);
		setErrorMessage(null);
	}, []);

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			setErrorMessage(null);

			if (!form.fromStop) {
				setErrorMessage("乗車バス停を選択してください");
				return;
			}
			if (!form.toStop) {
				setErrorMessage("降車バス停を選択してください");
				return;
			}
			if (form.fromStop.stop_id === form.toStop.stop_id) {
				setErrorMessage(
					"乗車バス停と降車バス停には異なるバス停を選択してください",
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
				if (editingId != null) {
					await onUpdate({ ...entry, id: editingId });
				} else {
					await onAdd(entry);
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
			form,
			editingId,
			onAdd,
			onUpdate,
			resetForm,
			onRequestNotificationPermission,
		],
	);

	const handleEdit = useCallback(
		(route: RegisteredRouteEntry) => {
			setForm({
				fromStop: {
					stop_id: route.fromStopId,
					stop_name: stopNameMap.get(route.fromStopId) ?? route.fromStopId,
					clusterStopIds: [route.fromStopId],
				},
				toStop: {
					stop_id: route.toStopId,
					stop_name: stopNameMap.get(route.toStopId) ?? route.toStopId,
					clusterStopIds: [route.toStopId],
				},
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
								setForm((prev) => ({ ...prev, fromStop: stop }))
							}
							selectedStop={form.fromStop}
						/>
						<StopSearch
							db={db}
							label="降車バス停"
							onSelect={(stop) =>
								setForm((prev) => ({ ...prev, toStop: stop }))
							}
							selectedStop={form.toStop}
						/>
					</div>
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
								setForm((prev) => ({
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
									setForm((prev) => ({
										...prev,
										notifyEnabled: e.target.checked,
									}))
								}
							/>
							<span className="label-text">通知</span>
						</label>
					</div>
					{errorMessage && (
						<div className="text-error text-sm" role="alert">
							{errorMessage}
						</div>
					)}
					<div className="card-actions justify-end">
						{editingId != null && (
							<button
								type="button"
								className="btn btn-ghost"
								onClick={resetForm}
								disabled={submitting}
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
						{hasNotifyEnabledRoutes && notifyBeforeMinutes !== undefined && (
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
										min="1"
										max="60"
										step="1"
										aria-describedby="notify-before-minutes-unit"
										value={notifyInputValue}
										onChange={(e) => {
											// 確定は Enter キー / 設定ボタンで行う（入力中の逐次 persist を防ぐ）。
											// blur による自動確定は廃止（意図しない確定を避けるため）。
											setNotifyInputValue(e.target.value);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												commitNotifyInput();
											}
										}}
									/>
									<span
										id="notify-before-minutes-unit"
										className="text-base-content/70"
									>
										分前
									</span>
									<button
										type="button"
										className="btn btn-xs btn-primary"
										onClick={commitNotifyInput}
										disabled={
											!canCommitNotifyInput ||
											submitting ||
											togglingRouteId !== null
										}
										aria-label="通知タイミングを設定"
									>
										設定
									</button>
									{notifyPermission === "default" &&
										onRequestNotificationPermission && (
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
													disabled={submitting}
												>
													編集
												</button>
												<button
													type="button"
													className="btn btn-ghost btn-xs text-error"
													onClick={() => handleDelete(route.id)}
													disabled={submitting}
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
