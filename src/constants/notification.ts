/**
 * 通知タイミング（発車の何分前か）に関する定数。
 *
 * 以下の 3 箇所で同じ値を参照する必要があるため、ここに集約する:
 * - useNotificationSettings: 永続化時のクランプ範囲 / デフォルト値
 * - useNotifyBeforeMinutesInput: 入力値バリデーション範囲
 * - RouteRegistration: number 入力の min / max HTML 属性
 *
 * 値の意味:
 * - NOTIFY_MIN_MINUTES: 発車の何分前に通知するかの最小値（分）
 * - NOTIFY_MAX_MINUTES: 同最大値（分）
 * - NOTIFY_DEFAULT_MINUTES: 未保存時のデフォルト値（分）
 */
export const NOTIFY_MIN_MINUTES = 1;
export const NOTIFY_MAX_MINUTES = 60;
export const NOTIFY_DEFAULT_MINUTES = 5;
