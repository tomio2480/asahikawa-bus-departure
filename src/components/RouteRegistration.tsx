import { useCallback, useState } from "react";
import type { Database } from "sql.js";
import type { StopSearchResult } from "../lib/stop-search";
import type { RouteEntry } from "../types/route-entry";
import { StopSearch } from "./StopSearch";

type RouteRegistrationProps = {
	/** sql.js データベースインスタンス */
	db: Database;
	/** 登録済み経路一覧 */
	routes: RouteEntry[];
	/** 経路追加コールバック */
	onAdd: (entry: Omit<RouteEntry, "id">) => Promise<number>;
	/** 経路更新コールバック */
	onUpdate: (entry: RouteEntry) => Promise<void>;
	/** 経路削除コールバック */
	onDelete: (id: number) => Promise<void>;
};

type FormState = {
	fromStop: StopSearchResult | null;
	toStop: StopSearchResult | null;
	walkMinutes: string;
};

const initialFormState: FormState = {
	fromStop: null,
	toStop: null,
	walkMinutes: "",
};

/** 経路登録・編集・削除を行うコンポーネント */
export function RouteRegistration({
	db,
	routes,
	onAdd,
	onUpdate,
	onDelete,
}: RouteRegistrationProps) {
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
			const walkMinutes = Number(form.walkMinutes);
			if (form.walkMinutes === "" || !Number.isFinite(walkMinutes)) {
				setErrorMessage("徒歩所要時間を入力してください");
				return;
			}

			setSubmitting(true);
			try {
				const entry = {
					fromStopId: form.fromStop.stop_id,
					toStopId: form.toStop.stop_id,
					walkMinutes,
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
		[form, editingId, onAdd, onUpdate, resetForm],
	);

	const handleEdit = useCallback((route: RouteEntry) => {
		setForm({
			fromStop: { stop_id: route.fromStopId, stop_name: "" },
			toStop: { stop_id: route.toStopId, stop_name: "" },
			walkMinutes: String(route.walkMinutes),
		});
		setEditingId(route.id ?? null);
		setErrorMessage(null);
	}, []);

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
			<form onSubmit={handleSubmit} className="card bg-base-100 shadow-sm">
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
							placeholder="0"
						/>
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
										<th>操作</th>
									</tr>
								</thead>
								<tbody>
									{routes.map((route) => (
										<tr key={route.id}>
											<td>{route.fromStopId}</td>
											<td>{route.toStopId}</td>
											<td>{route.walkMinutes}</td>
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
													onClick={() =>
														route.id != null && handleDelete(route.id)
													}
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
