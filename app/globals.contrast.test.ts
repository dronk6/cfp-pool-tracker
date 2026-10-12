// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * Reads the theme variables from globals.css and checks the WCAG contrast of every pairing
 * the app relies on, in both modes. Only the syntax globals.css uses is supported (#rrggbb,
 * var(), color-mix in srgb); anything else throws so a new kind of value fails loudly
 * instead of being skipped.
 */

type Rgb = [number, number, number];
type Variables = Map<string, string>;

const css = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const DARK_BLOCK = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}\s*\}/;

function parseDeclarations(body: string): Variables {
  const variables: Variables = new Map();
  for (const declaration of body.split(";")) {
    const match = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(declaration);
    if (match) variables.set(match[1], match[2]);
  }
  return variables;
}

function loadModes(): { light: Variables; dark: Variables } {
  const darkMatch = DARK_BLOCK.exec(css);
  if (!darkMatch) throw new Error("No dark :root block found in globals.css");
  const lightMatch = /:root\s*\{([^}]*)\}/.exec(css.replace(DARK_BLOCK, ""));
  if (!lightMatch) throw new Error("No light :root block found in globals.css");
  const light = parseDeclarations(lightMatch[1]);
  return { light, dark: new Map([...light, ...parseDeclarations(darkMatch[1])]) };
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}

/** "color 30%", "color" -> the color and its percentage, if given. */
function splitPercentage(argument: string): { color: string; percentage: number | null } {
  const match = /^([\s\S]+?)(?:\s+(\d+(?:\.\d+)?)%)?$/.exec(argument.trim());
  if (!match) throw new Error(`Unsupported color-mix argument: ${argument}`);
  return { color: match[1], percentage: match[2] === undefined ? null : Number(match[2]) };
}

function resolve(value: string, variables: Variables, seen: string[] = []): Rgb {
  const text = value.trim();

  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];

  const reference = /^var\(\s*(--[\w-]+)\s*\)$/.exec(text);
  if (reference) {
    const name = reference[1];
    const target = variables.get(name);
    if (target === undefined) throw new Error(`Undefined variable ${name}`);
    if (seen.includes(name)) throw new Error(`Circular variable ${name}`);
    return resolve(target, variables, [...seen, name]);
  }

  const mix = /^color-mix\(\s*in\s+srgb\s*,([\s\S]+)\)$/.exec(text);
  if (mix) {
    const args = splitTopLevel(mix[1]);
    if (args.length !== 2) throw new Error(`Unsupported color-mix: ${text}`);
    const [a, b] = args.map(splitPercentage);
    // Missing percentages are completed to 100%, then normalized, as CSS does.
    const pa = a.percentage ?? (b.percentage === null ? 50 : 100 - b.percentage);
    const pb = b.percentage ?? 100 - pa;
    const total = pa + pb;
    if (total <= 0) throw new Error(`Unsupported color-mix: ${text}`);
    const colorA = resolve(a.color, variables, seen);
    const colorB = resolve(b.color, variables, seen);
    // CSS mixes the gamma-encoded sRGB channels directly.
    return colorA.map((channel, i) => (channel * pa + colorB[i] * pb) / total) as Rgb;
  }

  throw new Error(`Unsupported color syntax: ${text}`);
}

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(foreground: Rgb, background: Rgb): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const modes = loadModes();

function ratio(mode: "light" | "dark", foreground: string, background: string): number {
  const variables = modes[mode];
  return contrast(resolve(`var(--${foreground})`, variables), resolve(`var(--${background})`, variables));
}

// Normal text needs 4.5:1.
const TEXT_PAIRS: [string, string][] = [
  ["primary-2", "primary-1"],
  ["accent-1", "primary-1"],
  ["danger", "primary-1"],
  ["on-accent-2", "accent-2"],
  ["primary-2", "accent-2-tint"],
];

// Borders, focus rings and other meaningful non-text parts need 3:1.
const NON_TEXT_PAIRS: [string, string][] = [
  ["primary-2", "primary-1"],
  ["outline-soft", "primary-1"],
  ["accent-1", "primary-1"],
  ["accent-1", "accent-2-tint"],
];

describe.each(["light", "dark"] as const)("%s mode contrast", (mode) => {
  it.each(TEXT_PAIRS)("text --%s on --%s is at least 4.5:1", (foreground, background) => {
    expect(ratio(mode, foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)("--%s against --%s is at least 3:1", (foreground, background) => {
    expect(ratio(mode, foreground, background)).toBeGreaterThanOrEqual(3);
  });
});

describe("documented exception", () => {
  // --accent-2 is too light for the light page (2.09:1), so it is never the only boundary marker
  // (primary buttons also carry a --primary-2 border). If the palette changes, revisit this.
  it("--accent-2 against the light background stays at about 2.09:1", () => {
    const value = ratio("light", "accent-2", "primary-1");
    expect(value).toBeLessThan(3);
    expect(value).toBeCloseTo(2.09, 1);
  });

  it("--accent-2 against the dark background is at least 3:1", () => {
    expect(ratio("dark", "accent-2", "primary-1")).toBeGreaterThanOrEqual(3);
  });
});

describe("the contrast checker", () => {
  it("fails loudly on syntax it does not support", () => {
    expect(() => resolve("rgb(0 0 0)", new Map())).toThrow(/Unsupported/);
    expect(() => resolve("var(--missing)", new Map())).toThrow(/Undefined/);
  });

  it("matches known WCAG ratios", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });
});
