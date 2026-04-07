import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadingSpinner } from "../src/components/LoadingSpinner";

afterEach(() => {
	cleanup();
});

describe("LoadingSpinner コンポーネント", () => {
	it("ローディング表示がレンダリングされる", () => {
		render(<LoadingSpinner />);
		expect(
			screen.getByRole("status", { name: "読み込み中" }),
		).toBeInTheDocument();
	});

	it("「読み込み中」のテキストが表示される", () => {
		render(<LoadingSpinner />);
		expect(screen.getByText("読み込み中...")).toBeInTheDocument();
	});
});
