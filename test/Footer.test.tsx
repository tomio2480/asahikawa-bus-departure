import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataAttribution, Footer } from "../src/components/Footer";

afterEach(() => {
	cleanup();
});

describe("Footer", () => {
	it("コピーライトが表示される", () => {
		render(<Footer />);
		expect(screen.getByText(/© 2026 Shota Nishihara/)).toBeInTheDocument();
	});

	it("X (Twitter) リンクが正しい URL を持つ", () => {
		render(<Footer />);
		const link = screen.getByRole("link", { name: /X \(Twitter\)/ });
		expect(link).toHaveAttribute("href", "https://x.com/tomio2480");
		expect(link).toHaveAttribute("target", "_blank");
	});

	it("GitHub Sponsors リンクが正しい URL を持つ", () => {
		render(<Footer />);
		const link = screen.getByRole("link", { name: /GitHub Sponsors/ });
		expect(link).toHaveAttribute(
			"href",
			"https://github.com/sponsors/tomio2480",
		);
		expect(link).toHaveAttribute("target", "_blank");
	});

	it("GitHub リポジトリリンクが正しい URL を持つ", () => {
		render(<Footer />);
		const links = screen
			.getAllByRole("link")
			.filter((el) => el.textContent === "GitHub");
		expect(links).toHaveLength(1);
		expect(links[0]).toHaveAttribute(
			"href",
			"https://github.com/tomio2480/asahikawa-bus-departure",
		);
		expect(links[0]).toHaveAttribute("target", "_blank");
	});

	it("外部リンクに rel='noopener noreferrer' と target='_blank' が設定されている", () => {
		render(<Footer />);
		const links = screen.getAllByRole("link");
		for (const link of links) {
			expect(link).toHaveAttribute("rel", "noopener noreferrer");
			expect(link).toHaveAttribute("target", "_blank");
		}
	});
});

describe("DataAttribution", () => {
	describe("免責表示と公式リンク", () => {
		it("免責表示が表示される", () => {
			render(<DataAttribution />);
			expect(
				screen.getByText("このサービスの情報は参考値です。"),
			).toBeInTheDocument();
			expect(
				screen.getByText(
					/正確な時刻・運賃は各事業者の公式ページをご確認ください/,
				),
			).toBeInTheDocument();
		});

		it("旭川電気軌道の公式リンクが正しい URL を持つ", () => {
			render(<DataAttribution />);
			const link = screen.getByRole("link", { name: "旭川電気軌道" });
			expect(link).toHaveAttribute(
				"href",
				"https://www.asahikawa-denkikidou.jp/",
			);
		});

		it("道北バスの公式リンクが正しい URL を持つ", () => {
			render(<DataAttribution />);
			const link = screen.getByRole("link", { name: "道北バス" });
			expect(link).toHaveAttribute("href", "https://www.dohokubus.com/");
		});

		it("ふらのバスの公式リンクが正しい URL を持つ", () => {
			render(<DataAttribution />);
			const link = screen.getByRole("link", { name: "ふらのバス" });
			expect(link).toHaveAttribute("href", "https://www.furanobus.jp/");
		});
	});

	describe("データ出典表示", () => {
		it("HODA のデータ出典が表示される", () => {
			render(<DataAttribution />);
			expect(screen.getByText(/加工して作成/)).toBeInTheDocument();
		});

		it("HODA データセットへのリンクが正しい URL を持つ", () => {
			render(<DataAttribution />);
			const link = screen.getByRole("link", {
				name: /公共交通GTFSデータ/,
			});
			expect(link).toHaveAttribute(
				"href",
				"https://ckan.hoda.jp/dataset/gtfs-data",
			);
		});

		it("CC BY 4.0 ライセンスへのリンクが表示される", () => {
			render(<DataAttribution />);
			const link = screen.getByRole("link", { name: /CC BY 4\.0/ });
			expect(link).toHaveAttribute(
				"href",
				"https://creativecommons.org/licenses/by/4.0/deed.ja",
			);
		});
	});

	it("外部リンクに rel='noopener noreferrer' と target='_blank' が設定されている", () => {
		render(<DataAttribution />);
		const links = screen.getAllByRole("link");
		for (const link of links) {
			expect(link).toHaveAttribute("rel", "noopener noreferrer");
			expect(link).toHaveAttribute("target", "_blank");
		}
	});
});
