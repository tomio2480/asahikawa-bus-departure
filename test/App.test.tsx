import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/hooks/useDatabase", () => ({
	useDatabase: vi.fn(),
}));

vi.mock("../src/hooks/useRoutes", () => ({
	useRoutes: vi.fn(),
}));

import { useDatabase } from "../src/hooks/useDatabase";
import { useRoutes } from "../src/hooks/useRoutes";

const mockUseDatabase = vi.mocked(useDatabase);
const mockUseRoutes = vi.mocked(useRoutes);

// DepartureBoard と RouteRegistration は DB を必要とするためモック
vi.mock("../src/components/DepartureBoard", () => ({
	DepartureBoard: () => <div data-testid="departure-board" />,
}));

vi.mock("../src/components/RouteRegistration", () => ({
	RouteRegistration: () => <div data-testid="route-registration" />,
}));

import App from "../src/App";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("App", () => {
	it("タイトルが表示される", () => {
		mockUseDatabase.mockReturnValue({ db: null, error: null, loading: true });
		mockUseRoutes.mockReturnValue({
			routes: [],
			loading: true,
			error: null,
			add: vi.fn(),
			update: vi.fn(),
			remove: vi.fn(),
			reload: vi.fn(),
		});
		render(<App />);
		expect(screen.getByText("旭川バス発車案内")).toBeInTheDocument();
	});

	it("データ読み込み中はローディング表示される", () => {
		mockUseDatabase.mockReturnValue({ db: null, error: null, loading: true });
		mockUseRoutes.mockReturnValue({
			routes: [],
			loading: true,
			error: null,
			add: vi.fn(),
			update: vi.fn(),
			remove: vi.fn(),
			reload: vi.fn(),
		});
		render(<App />);
		expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
		expect(screen.queryByTestId("departure-board")).not.toBeInTheDocument();
	});

	it("データベースエラー時にエラーメッセージが表示される", () => {
		mockUseDatabase.mockReturnValue({
			db: null,
			error: new Error("DB load failed"),
			loading: false,
		});
		mockUseRoutes.mockReturnValue({
			routes: [],
			loading: false,
			error: null,
			add: vi.fn(),
			update: vi.fn(),
			remove: vi.fn(),
			reload: vi.fn(),
		});
		render(<App />);
		expect(screen.getByText(/DB load failed/)).toBeInTheDocument();
	});

	it("読み込み完了後に発車案内と経路登録が表示される", () => {
		mockUseDatabase.mockReturnValue({
			db: {} as ReturnType<typeof useDatabase>["db"],
			error: null,
			loading: false,
		});
		mockUseRoutes.mockReturnValue({
			routes: [],
			loading: false,
			error: null,
			add: vi.fn(),
			update: vi.fn(),
			remove: vi.fn(),
			reload: vi.fn(),
		});
		render(<App />);
		expect(screen.getByTestId("departure-board")).toBeInTheDocument();
		expect(screen.getByTestId("route-registration")).toBeInTheDocument();
	});
});
