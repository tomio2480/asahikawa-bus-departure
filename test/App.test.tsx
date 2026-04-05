import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../src/App";

describe("App", () => {
	it("タイトルが表示される", () => {
		render(<App />);
		expect(screen.getByText("旭川バス発車案内")).toBeInTheDocument();
	});
});
