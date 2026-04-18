import { useCallback, useState } from "react";
import { useNotificationSettings } from "./useNotificationSettings";

/**
 * commit() の戻り値。
 * - ok: true  … 永続化に成功した場合（committedMinutes が新しい確定値）
 * - ok: false … 永続化失敗または canCommit=false の場合。error にエラー内容が入る。
 */
export type NotifyInputCommitResult =
	| { ok: true; committedMinutes: number }
	| { ok: false; error: unknown };

/** 通知タイミング（発車の何分前か）の入力値が満たすべき範囲 */
const MIN_MINUTES = 1;
const MAX_MINUTES = 60;

/**
 * 通知タイミング入力の確定値と編集中の値を同一スコープで保持するフック。
 *
 * 従来は RouteRegistration 内に `useState(inputValue)` と
 * `useEffect(() => setInputValue(minutes))` による props → state 同期が
 * 存在していた。この構造はユーザー入力中に外部から minutes が更新された
 * 場合に編集途中の値を破壊する典型的なアンチパターンである
 * （Issue #89）。
 *
 * 本フックは確定値（useNotificationSettings の minutes）と
 * 編集中の値（inputValue）を同一スコープで管理し、
 * 編集開始後は minutes が変わっても inputValue が書き換えられない
 * 性質を保証する。RouteRegistration は純粋な制御コンポーネントとなり
 * useEffect 同期が不要になる。
 */
export function useNotifyBeforeMinutesInput() {
	const { minutes, setMinutes } = useNotificationSettings();
	const [inputValue, setInputValue] = useState<string>(() => String(minutes));

	const parsed = Number(inputValue);
	const isValid =
		inputValue.trim() !== "" &&
		Number.isInteger(parsed) &&
		parsed >= MIN_MINUTES &&
		parsed <= MAX_MINUTES;
	const isChanged = parsed !== minutes;
	const canCommit = isValid && isChanged;

	const commit = useCallback((): NotifyInputCommitResult => {
		if (!canCommit) {
			// 無効値・未変更の状態で呼ばれた場合は呼び出し側のガードが漏れている。
			// 明示的にエラーとして返し、誤ったトースト表示を誘発しないようにする。
			return { ok: false, error: new Error("invalid-or-unchanged") };
		}
		try {
			setMinutes(parsed);
			return { ok: true, committedMinutes: parsed };
		} catch (err) {
			// 永続化失敗時は入力欄を確定済み値へロールバックし、
			// 画面表示と保存値の乖離を防ぐ。
			setInputValue(String(minutes));
			return { ok: false, error: err };
		}
	}, [canCommit, minutes, parsed, setMinutes]);

	return { minutes, inputValue, setInputValue, canCommit, commit } as const;
}
