import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

// Placeholder component so this file can demonstrate the test convention
// before any real components exist. Delete once real tests cover the pattern.
function Toggle() {
  const [on, setOn] = useState(false);
  return (
    <button onClick={() => setOn(!on)}>{on ? "On" : "Off"}</button>
  );
}

describe("Toggle (example)", () => {
  it("starts off", () => {
    render(<Toggle />);

    expect(screen.getByRole("button", { name: "Off" })).toBeInTheDocument();
  });

  it("switches on when clicked", async () => {
    render(<Toggle />);

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button", { name: "On" })).toBeInTheDocument();
  });
});
