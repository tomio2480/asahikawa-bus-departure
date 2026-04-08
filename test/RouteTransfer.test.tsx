import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteTransfer } from "../src/components/RouteTransfer";

// route-store モジュールのモック
vi.mock("../src/lib/route-store", () => ({
	exportRoutes: vi.fn(),
	importRoutes: vi.fn(),
}));

import { exportRoutes, importRoutes } from "../src/lib/route-store";

const mockExportRoutes = vi.mocked(exportRoutes);
const mockImportRoutes = vi.mocked(importRoutes);

describe("RouteTransfer", () => {
	const mockOnImportComplete = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it("エクスポートボタンとインポートボタンが表示される", () => {
		render(<RouteTransfer onImportComplete={mockOnImportComplete} />);
		expect(
			screen.getByRole("button", { name: /エクスポート/ }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /インポート/ }),
		).toBeInTheDocument();
	});

	describe("エクスポート", () => {
		it("エクスポートボタン押下で JSON ファイルがダウンロードされる", async () => {
			mockExportRoutes.mockResolvedValue({
				version: 1,
				routes: [
					{ fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 5 },
				],
			});

			const createObjectURL = vi.fn(() => "blob:mock-url");
			const revokeObjectURL = vi.fn();
			globalThis.URL.createObjectURL = createObjectURL;
			globalThis.URL.revokeObjectURL = revokeObjectURL;

			const clickSpy = vi.fn();
			const origCreateElement = document.createElement.bind(document);
			vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
				const el = origCreateElement(tag);
				if (tag === "a") {
					vi.spyOn(el, "click").mockImplementation(clickSpy);
				}
				return el;
			});

			render(<RouteTransfer onImportComplete={mockOnImportComplete} />);
			fireEvent.click(screen.getByRole("button", { name: /エクスポート/ }));

			await waitFor(() => {
				expect(mockExportRoutes).toHaveBeenCalledOnce();
				expect(createObjectURL).toHaveBeenCalledOnce();
				expect(clickSpy).toHaveBeenCalledOnce();
				expect(revokeObjectURL).toHaveBeenCalledOnce();
			});

			vi.restoreAllMocks();
		});

		it("エクスポートに失敗した場合エラーメッセージを表示する", async () => {
			mockExportRoutes.mockRejectedValue(new Error("DB error"));

			render(<RouteTransfer onImportComplete={mockOnImportComplete} />);
			fireEvent.click(screen.getByRole("button", { name: /エクスポート/ }));

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent("DB error");
			});
		});
	});

	describe("インポート", () => {
		it("ファイル選択でインポートが実行される", async () => {
			mockImportRoutes.mockResolvedValue(3);

			render(<RouteTransfer onImportComplete={mockOnImportComplete} />);

			const fileInput = document.querySelector(
				'input[type="file"]',
			) as HTMLInputElement;
			expect(fileInput).not.toBeNull();

			const json = JSON.stringify({
				version: 1,
				routes: [
					{ fromStopId: "test:S001", toStopId: "test:S002", walkMinutes: 5 },
				],
			});
			const file = new File([json], "routes.json", {
				type: "application/json",
			});

			fireEvent.change(fileInput, { target: { files: [file] } });

			await waitFor(() => {
				expect(mockImportRoutes).toHaveBeenCalledOnce();
				expect(mockOnImportComplete).toHaveBeenCalledOnce();
			});
		});

		it("インポート成功時に件数メッセージを表示する", async () => {
			mockImportRoutes.mockResolvedValue(3);

			render(<RouteTransfer onImportComplete={mockOnImportComplete} />);

			const fileInput = document.querySelector(
				'input[type="file"]',
			) as HTMLInputElement;

			const json = JSON.stringify({ version: 1, routes: [] });
			const file = new File([json], "routes.json", {
				type: "application/json",
			});
			fireEvent.change(fileInput, { target: { files: [file] } });

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent(
					"3 件の経路をインポートしました",
				);
			});
		});

		it("インポートに失敗した場合エラーメッセージを表示する", async () => {
			mockImportRoutes.mockRejectedValue(new Error("Invalid format"));

			render(<RouteTransfer onImportComplete={mockOnImportComplete} />);

			const fileInput = document.querySelector(
				'input[type="file"]',
			) as HTMLInputElement;

			const json = "invalid json";
			const file = new File([json], "routes.json", {
				type: "application/json",
			});
			fireEvent.change(fileInput, { target: { files: [file] } });

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent("Invalid format");
				expect(mockOnImportComplete).not.toHaveBeenCalled();
			});
		});
	});
});
