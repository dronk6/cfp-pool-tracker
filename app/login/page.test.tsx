import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LoginPage from "./page";

describe("LoginPage", () => {
  it("renders the heading and the email form", () => {
    render(<LoginPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Log In" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});
