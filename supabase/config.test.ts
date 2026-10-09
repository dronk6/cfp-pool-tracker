// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(join(__dirname, "config.toml"), "utf8");

// Text of one [section], up to the next [header] line.
function section(name: string): string {
  const start = config.indexOf(`\n[${name}]`);
  if (start === -1) throw new Error(`No [${name}] in config.toml`);
  const rest = config.slice(start + 1);
  const next = rest.slice(1).search(/^\[/m);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

// These keep the local stack's auth matching production (issue #17).
describe("config.toml auth settings", () => {
  it("disables self-signup", () => {
    expect(section("auth")).toMatch(/^enable_signup = false$/m);
    // In the CLI, [auth.email] enable_signup is the email provider switch, not self-signup: false breaks login codes.
    expect(section("auth.email")).toMatch(/^enable_signup = true$/m);
  });

  it("matches production's email limits", () => {
    expect(section("auth.email")).toMatch(/^max_frequency = "30s"$/m);
    expect(section("auth.email")).toMatch(/^otp_length = 8$/m);
  });

  it("sends the code, not a link, in the magic link email", () => {
    const magicLink = section("auth.email.template.magic_link");
    const path = magicLink.match(/^content_path = "\.\/(.+)"$/m)?.[1];
    expect(path).toBeDefined();
    const template = readFileSync(join(__dirname, "..", path!), "utf8");
    expect(template).toContain("{{ .Token }}");
    expect(template).not.toContain("{{ .ConfirmationURL }}");
  });
});
