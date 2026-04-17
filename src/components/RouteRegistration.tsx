import { useCallback, useMemo, useState } from "react";
import type { Database } from "sql.js";
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

			let notifyEnabled = form.notifyEnabled;
			if (notifyEnabled && onRequestNotificationPermission) {
				const result = await onRequestNotificationPermission();
				if (result === "denied") {
					notifyEnabled = false;
				}
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
		[form, editingId, onAdd, onUpdate, resetForm, onRequestNotificationPermission],
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
														if (!route.notifyEnabled && onRequestNotificationPermission) {
															const result = await onRequestNotificationPermission();
															if (result === "denied") return;
														}
														try {
															await onUpdate({
																...route,
																notifyEnabled: !route.notifyEnabled,
															});
														} catch (err) {
															setErrorMessage(
																err instanceof Error ? err.message : "通知設定の更新に失敗しました",
															);
														}
													}}
													disabled={submitting}
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
