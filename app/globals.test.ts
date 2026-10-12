import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

function variable(name: string): string {
  const match = css.match(new RegExp(String.raw`${name}:\s*(#[0-9a-fA-F]{6})\s*;`));
  if (!match) throw new Error(`${name} is not a #rrggbb color in globals.css`);
  return match[1];
}

// WCAG 2 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("primary button colors", () => {
  const confirm = variable("--confirm");
  const label = variable("--confirm-text");

  it("keeps the label readable on the button and its hover", () => {
    expect(contrast(label, confirm)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(label, variable("--confirm-hover"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the button visible against the light and dark pages", () => {
    expect(contrast(confirm, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(contrast(confirm, "#0a0a0a")).toBeGreaterThanOrEqual(3);
  });
});
