import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StatusCue from "./StatusCue";

describe("StatusCue", () => {
  it("marks errors with a prefix that assistive technology skips", () => {
    render(
      <p role="alert">
        <StatusCue kind="error" />
        Something broke.
      </p>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Error: Something broke.");
    expect(screen.getByText("Error:")).toHaveAttribute("aria-hidden", "true");
  });

  it("marks warnings with a different prefix", () => {
    render(<StatusCue kind="warning" />);

    expect(screen.getByText("Warning:")).toHaveAttribute("aria-hidden", "true");
  });
});
