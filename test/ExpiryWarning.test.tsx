import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExpiryWarning } from "../src/components/ExpiryWarning";
import type { DataExpiry } from "../src/lib/data-expiry";

afterEach(() => {
	cleanup();
});

function createExpiry(earliest: string, latest: string): DataExpiry {
	return {
		earliestEndDate: earliest,
		latestEndDate: latest,
		isExpired: (dateStr: string) => dateStr > latest,
		isPartiallyExpired: (dateStr: string) =>
			dateStr > earliest && dateStr <= latest,
	};
}

describe("ExpiryWarning コンポーネント", () => {
	it("全データが有効な場合は何も表示しない", () => {
		const expiry = createExpiry("20261130", "20280407");
		const { container } = render(
			<ExpiryWarning expiry={expiry} currentDate="20260601" />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("一部データが期限切れの場合は警告を表示する", () => {
		const expiry = createExpiry("20261130", "20280407");
		render(<ExpiryWarning expiry={expiry} currentDate="20261201" />);
		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(
			screen.getByText(/一部の時刻表データが有効期限切れです/),
		).toBeInTheDocument();
	});

	it("全データが期限切れの場合はエラーを表示する", () => {
		const expiry = createExpiry("20261130", "20280407");
		render(<ExpiryWarning expiry={expiry} currentDate="20280501" />);
		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(
			screen.getByText(/全ての時刻表データが有効期限切れです/),
		).toBeInTheDocument();
	});

	it("expiry が null の場合は何も表示しない", () => {
		const { container } = render(
			<ExpiryWarning expiry={null} currentDate="20260601" />,
		);
		expect(container.firstChild).toBeNull();
	});
});
