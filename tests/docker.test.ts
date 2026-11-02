import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { isDockerDestructive, getDockerPlan, extractComposeVolumeNames } from "../src/providers/docker.js";
import { readFileSync } from "node:fs";

const fixturesDir = join(__dirname, "fixtures");
const composeFixture = readFileSync(join(fixturesDir, "docker-compose.yml"), "utf8");

describe("isDockerDestructive", () => {
  it("matches volume rm/prune, system prune --volumes, compose down -v, and rm -v", () => {
    expect(isDockerDestructive("docker volume rm db_data")).toBe(true);
    expect(isDockerDestructive("docker volume prune")).toBe(true);
    expect(isDockerDestructive("docker system prune -a --volumes")).toBe(true);
    expect(isDockerDestructive("docker compose down -v")).toBe(true);
    expect(isDockerDestructive("docker-compose down --volumes")).toBe(true);
    expect(isDockerDestructive("docker rm -v my-container")).toBe(true);
  });

  it("does not match non-destructive docker commands", () => {
    expect(isDockerDestructive("docker ps")).toBe(false);
    expect(isDockerDestructive("docker compose up -d")).toBe(false);
    expect(isDockerDestructive("docker compose down")).toBe(false);
    expect(isDockerDestructive("docker rm my-container")).toBe(false);
  });
});

describe("extractComposeVolumeNames", () => {
  it("lists named top-level volumes, excluding external ones", () => {
    const names = extractComposeVolumeNames(composeFixture);
    expect(names).toContain("db_data");
    expect(names).toContain("cache_data");
    expect(names).not.toContain("shared_assets");
  });
});

describe("getDockerPlan", () => {
  it("maps `docker volume rm` names directly to delete changes", () => {
    const plan = getDockerPlan("docker volume rm db_data cache_data", fixturesDir);
    expect(plan.degraded).toBe(false);
    expect(plan.changes).toHaveLength(2);
    expect(plan.changes[0]).toMatchObject({ resourceType: "docker:volume", address: "db_data", action: "delete" });
  });

  it("reads the compose file for `down -v` instead of guessing", () => {
    const plan = getDockerPlan("docker compose -f docker-compose.yml down -v", fixturesDir);
    expect(plan.degraded).toBe(false);
    expect(plan.changes.map((c) => c.address)).toEqual(["db_data", "cache_data"]);
  });

  it("degrades when the compose file can't be found", () => {
    const plan = getDockerPlan("docker compose down -v", join(fixturesDir, "nonexistent-dir"));
    expect(plan.degraded).toBe(true);
  });

  it("degrades `docker rm -v` since anonymous-volume contents can't be verified ahead of time", () => {
    const plan = getDockerPlan("docker rm -v my-container", fixturesDir);
    expect(plan.degraded).toBe(true);
  });

  it("degrades `docker volume prune` since the removal set can't be enumerated ahead of time", () => {
    const plan = getDockerPlan("docker volume prune -f", fixturesDir);
    expect(plan.degraded).toBe(true);
  });
});
