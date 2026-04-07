import type { DataExpiry } from "../lib/data-expiry";

type ExpiryWarningProps = {
	/** データ有効期限情報 */
	expiry: DataExpiry | null;
	/** 現在の日付（YYYYMMDD 形式） */
	currentDate: string;
};

/** GTFS データの有効期限警告を表示するコンポーネント */
export function ExpiryWarning({ expiry, currentDate }: ExpiryWarningProps) {
	if (expiry === null) {
		return null;
	}

	if (expiry.isExpired(currentDate)) {
		return (
			<div className="alert alert-error" role="alert">
				<span>
					{
						"全ての時刻表データが有効期限切れです。表示内容が正確でない可能性があります。"
					}
				</span>
			</div>
		);
	}

	if (expiry.isPartiallyExpired(currentDate)) {
		return (
			<div className="alert alert-warning" role="alert">
				<span>
					{
						"一部の時刻表データが有効期限切れです。表示内容が正確でない可能性があります。"
					}
				</span>
			</div>
		);
	}

	return null;
}
