// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * All colors come from the variables in globals.css. This fails on any other hard-coded
 * color in the app's CSS or TSX, so a new one cannot bypass the contrast test. The variable
 * definitions (the :root blocks of globals.css) are the one place literals belong.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", ".claude", ".git"]);

// Deliberately partial: the common names, enough to catch a copy-pasted color.
const NAMED_COLORS = [
  "black", "white", "red", "green", "blue", "yellow", "orange", "purple", "pink", "gray", "grey",
  "brown", "cyan", "magenta", "silver", "gold", "navy", "teal", "maroon", "olive", "lime", "aqua",
  "fuchsia", "indigo", "violet", "crimson", "coral", "salmon", "tomato", "khaki", "tan", "beige",
  "ivory", "lavender", "orchid", "plum", "turquoise", "azure", "linen", "snow", "whitesmoke",
  "gainsboro", "lightgray", "lightgrey", "darkgray", "darkgrey", "dimgray", "dimgrey", "slategray",
  "rebeccapurple", "darkgreen", "darkred", "darkblue", "lightblue", "lightgreen",
];

// A hex color starts a value or string: after whitespace, a quote, ":", "(" or ",". That keeps
// URL fragments such as "/#add" from matching.
const HEX_COLOR = /(?<=^|[\s"'`:(,])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/im;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const NAMED_COLOR = new RegExp(String.raw`(?<![\w#-])(?:${NAMED_COLORS.join("|")})(?![\w-])`, "i");

function filesUnder(directory: string, matches: (name: string) => boolean): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : filesUnder(join(directory, entry.name), matches);
    }
    return matches(entry.name) ? [join(directory, entry.name)] : [];
  });
}

const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");

/** The text inside the innermost { } blocks: declarations only, never selectors such as `#abc123`. */
function declarationBlocks(css: string): string[] {
  return [...withoutComments(css).matchAll(/\{([^{}]*)\}/g)].map((match) => match[1]);
}

function cssColors(css: string): string[] {
  return declarationBlocks(css).filter(
    (block) => HEX_COLOR.test(block) || COLOR_FUNCTION.test(block) || NAMED_COLOR.test(block),
  );
}

function globalsColors(css: string): string[] {
  const withoutThemeDefinitions = css.replace(/:root\s*\{[^}]*\}/g, "");
  return cssColors(withoutThemeDefinitions);
}

/**
 * The color literals in a TSX file. Named colors are not checked here, where words such as "red"
 * are far more likely to be text. Hex colors count only inside a quoted string, so JSX text such as
 * "Pick #123" is not flagged.
 */
function tsxColors(tsx: string): string[] {
  const strings = withoutComments(tsx).match(/"[^"]*"|'[^']*'|`[^`]*`/g) ?? [];
  return strings.filter((text) => HEX_COLOR.test(text) || COLOR_FUNCTION.test(text));
}

const label = (file: string) => relative(ROOT, file).split(sep).join("/");

describe("hard-coded colors", () => {
  const cssFiles = filesUnder(ROOT, (name) => name.endsWith(".module.css"));
  const tsxFiles = filesUnder(ROOT, (name) => name.endsWith(".tsx") && !/\.test\.tsx$/.test(name));

  it("finds the files to check", () => {
    expect(cssFiles.length).toBeGreaterThan(5);
    expect(tsxFiles.length).toBeGreaterThan(5);
  });

  it("keeps literals out of globals.css apart from the variable definitions", () => {
    expect(globalsColors(readFileSync(join(ROOT, "app", "globals.css"), "utf8"))).toEqual([]);
  });

  it.each(cssFiles.map((file) => [label(file), file]))("%s uses only theme variables", (_name, file) => {
    expect(cssColors(readFileSync(file, "utf8"))).toEqual([]);
  });

  it.each(tsxFiles.map((file) => [label(file), file]))("%s has no color literals", (_name, file) => {
    expect(tsxColors(readFileSync(file, "utf8"))).toEqual([]);
  });
});

describe("the guard", () => {
  it("catches the kinds of color it is meant to", () => {
    for (const declaration of ["color: #b54708", "color: #FFF", "border: 1px solid rgb(0 0 0 / 0.5)", "color: hsl(10 20% 30%)", "color: red"]) {
      expect(cssColors(`a { ${declaration}; }`)).toHaveLength(1);
    }
    expect(cssColors("@media (min-width: 30rem) { a { box-shadow: 0 0 1px rgba(0, 0, 0, 1); } }")).toHaveLength(1);
    expect(tsxColors('const style = { color: "#fff" };')).toHaveLength(1);
    expect(tsxColors('const style = { color: "rgb(0 0 0)" };')).toHaveLength(1);
  });

  it("skips globals.css variable definitions but not other literals", () => {
    expect(globalsColors(":root { --a: #fff; }\n@media (prefers-color-scheme: dark) { :root { --a: #000; } }")).toEqual([]);
    expect(globalsColors(":root { --a: #fff; }\nbody { color: #000; }")).toHaveLength(1);
  });

  it("ignores things that only look like colors", () => {
    expect(cssColors("#abc123 { margin: 0; }")).toEqual([]);
    expect(cssColors("a { color: var(--accent-1); }")).toEqual([]);
    expect(cssColors("a { font-family: Arial, Helvetica, sans-serif; }")).toEqual([]);
    expect(cssColors("a { color: currentColor; background: transparent; }")).toEqual([]);
    expect(cssColors("/* #fff and red */ a { margin: 0; }")).toEqual([]);
    expect(tsxColors('<a className="red-link" href="/#add">Pick #123</a> {/* #fff */}')).toEqual([]);
    expect(tsxColors("const total = count(1);")).toEqual([]);
  });
});
