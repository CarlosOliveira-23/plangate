import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, DEFAULT_CONFIG } from "../src/config.js";

describe("loadConfig", () => {
  it("returns the default config when no .plangate.yml exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "plangate-"));
    expect(loadConfig(dir)).toEqual(DEFAULT_CONFIG);
  });

  it("merges a partial .plangate.yml over the defaults", () => {
    const dir = mkdtempSync(join(tmpdir(), "plangate-"));
    writeFileSync(
      join(dir, ".plangate.yml"),
      "allowlist:\n  - '^aws_s3_bucket$'\nuseCheckov: false\n"
    );
    const config = loadConfig(dir);
    expect(config.allowlist).toEqual(["^aws_s3_bucket$"]);
    expect(config.useCheckov).toBe(false);
    expect(config.protectedTags).toEqual(DEFAULT_CONFIG.protectedTags);
  });
});
