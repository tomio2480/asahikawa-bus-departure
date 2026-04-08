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

/** レンダー済み DOM から file input を取得するヘルパー */
function getFileInput(): HTMLInputElement {
	const el = document.querySelector('input[type="file"]');
	if (!(el instanceof HTMLInputElement)) {
		throw new Error("file input not found");
	}
	return el;
}

describe("RouteTransfer", () => {
	const mockOnImportComplete = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		// jsdom は URL.createObjectURL/revokeObjectURL を実装していないため
		// vi.spyOn で上書きできるようスタブを設定する
		if (!URL.createObjectURL) {
			URL.createObjectURL = () => "";
		}
		if (!URL.revokeObjectURL) {
			URL.revokeObjectURL = () => {};
		}
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.useRealTimers();
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

			const createObjectURLSpy = vi
				.spyOn(URL, "createObjectURL")
				.mockReturnValue("blob:mock-url");
			const revokeObjectURLSpy = vi
				.spyOn(URL, "revokeObjectURL")
				.mockImplementation(() => {});

			const clickSpy = vi.fn();
			const appendChildSpy = vi.spyOn(document.body, "appendChild");
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
				expect(createObjectURLSpy).toHaveBeenCalledOnce();
				expect(appendChildSpy).toHaveBeenCalled();
				expect(clickSpy).toHaveBeenCalledOnce();
			});

			// setTimeout(100ms) 後に revokeObjectURL が呼ばれる
			await waitFor(() => {
				expect(revokeObjectURLSpy).toHaveBeenCalledOnce();
			});
		});

		it("ファイル名にローカル日付が使用される", async () => {
			// 日付を固定してテストの安定性を確保
			vi.useFakeTimers({ shouldAdvanceTime: true });
			vi.setSystemTime(new Date("2026-04-08T12:00:00"));

			mockExportRoutes.mockResolvedValue({ version: 1, routes: [] });

			vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
			vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

			let capturedAnchor: HTMLAnchorElement | null = null;
			const origCreateElement = document.createElement.bind(document);
			vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
				const el = origCreateElement(tag);
				if (tag === "a") {
					capturedAnchor = el as HTMLAnchorElement;
					vi.spyOn(el, "click").mockImplementation(() => {});
				}
				return el;
			});

			render(<RouteTransfer onImportComplete={mockOnImportComplete} />);
			fireEvent.click(screen.getByRole("button", { name: /エクスポート/ }));

			await waitFor(() => {
				expect(capturedAnchor).not.toBeNull();
			});

			expect(capturedAnchor?.download).toBe("routes-2026-04-08.json");
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

	describe("二重実行防止", () => {
		it("エクスポート処理中はボタンが無効化される", async () => {
			let resolveExport: (value: { version: 1; routes: [] }) => void;
			mockExportRoutes.mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveExport = resolve;
					}),
			);

			vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
			vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
			const origCreateElement = document.createElement.bind(document);
			vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
				const el = origCreateElement(tag);
				if (tag === "a") {
					vi.spyOn(el, "click").mockImplementation(() => {});
				}
				return el;
			});

			render(<RouteTransfer onImportComplete={mockOnImportComplete} />);

			const exportBtn = screen.getByRole("button", { name: /エクスポート/ });
			const importBtn = screen.getByRole("button", { name: /インポート/ });

			fireEvent.click(exportBtn);

			await waitFor(() => {
				expect(exportBtn).toBeDisabled();
				expect(importBtn).toBeDisabled();
			});

			resolveExport?.({ version: 1, routes: [] });

			await waitFor(() => {
				expect(exportBtn).not.toBeDisabled();
				expect(importBtn).not.toBeDisabled();
			});
		});

		it("インポート処理中はボタンが無効化される", async () => {
			let resolveImport: (value: number) => void;
			mockImportRoutes.mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveImport = resolve;
					}),
			);

			render(<RouteTransfer onImportComplete={mockOnImportComplete} />);

			const exportBtn = screen.getByRole("button", { name: /エクスポート/ });
			const importBtn = screen.getByRole("button", { name: /インポート/ });

			const fileInput = getFileInput();

			const json = JSON.stringify({ version: 1, routes: [] });
			const file = new File([json], "routes.json", {
				type: "application/json",
			});
			fireEvent.change(fileInput, { target: { files: [file] } });

			// readFileAsText 完了後に importRoutes が呼ばれるまで待つ
			await waitFor(() => {
				expect(exportBtn).toBeDisabled();
				expect(importBtn).toBeDisabled();
				expect(mockImportRoutes).toHaveBeenCalled();
			});

			resolveImport?.(0);

			await waitFor(() => {
				expect(exportBtn).not.toBeDisabled();
				expect(importBtn).not.toBeDisabled();
			});
		});
	});

	describe("インポート", () => {
		it("ファイル選択でインポートが実行される", async () => {
			mockImportRoutes.mockResolvedValue(3);

			render(<RouteTransfer onImportComplete={mockOnImportComplete} />);

			const fileInput = getFileInput();
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
				expect(mockImportRoutes).toHaveBeenCalled();
				expect(mockOnImportComplete).toHaveBeenCalled();
			});
		});

		it("インポート成功時に件数メッセージを表示する", async () => {
			mockImportRoutes.mockResolvedValue(3);

			render(<RouteTransfer onImportComplete={mockOnImportComplete} />);

			const fileInput = getFileInput();

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

		it("成功メッセージは 3 秒後に自動消去される", async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			mockImportRoutes.mockResolvedValue(2);

			render(<RouteTransfer onImportComplete={mockOnImportComplete} />);

			const fileInput = getFileInput();

			const json = JSON.stringify({ version: 1, routes: [] });
			const file = new File([json], "routes.json", {
				type: "application/json",
			});
			fireEvent.change(fileInput, { target: { files: [file] } });

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent(
					"2 件の経路をインポートしました",
				);
			});

			// 3 秒経過で成功メッセージが消える
			vi.advanceTimersByTime(3000);
			await waitFor(() => {
				expect(screen.queryByRole("alert")).toBeNull();
			});
		});

		it("インポートに失敗した場合エラーメッセージを表示する", async () => {
			mockImportRoutes.mockRejectedValue(new Error("Invalid format"));

			render(<RouteTransfer onImportComplete={mockOnImportComplete} />);

			const fileInput = getFileInput();

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
