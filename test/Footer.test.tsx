import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Footer } from "../src/components/Footer";

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

	it("外部リンクに rel='noopener noreferrer' が設定されている", () => {
		render(<Footer />);
		const links = screen.getAllByRole("link");
		for (const link of links) {
			expect(link).toHaveAttribute("rel", "noopener noreferrer");
		}
	});
});
