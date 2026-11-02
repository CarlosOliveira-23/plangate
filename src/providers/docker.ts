import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { tokenize, getFlagValue } from "../argParse.js";
import type { PlanResult, ResourceChange } from "../types.js";

const DEFAULT_COMPOSE_FILENAMES = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"];

export function isDockerDestructive(command: string): boolean {
  return (
    /\bdocker\s+volume\s+rm\b/.test(command) ||
    /\bdocker\s+volume\s+prune\b/.test(command) ||
    /\bdocker\s+system\s+prune\b[^|&;]*(?:--volumes\b|-v\b)/.test(command) ||
    /\b(?:docker-compose|docker\s+compose)\b[^|&;]*\bdown\b[^|&;]*(?:--volumes\b|-v\b)/.test(command) ||
    /\bdocker\s+rm\b[^|&;]*(?:--volumes\b|-v\b)/.test(command)
  );
}

interface ComposeFile {
  volumes?: Record<string, { external?: boolean | Record<string, unknown> } | null>;
}

/** Named, non-external top-level volumes declared in a compose file -- the ones `down -v` actually deletes. */
export function extractComposeVolumeNames(composeYaml: string): string[] {
  const parsed = (yaml.load(composeYaml) as ComposeFile) ?? {};
  return Object.entries(parsed.volumes ?? {})
    .filter(([, def]) => !def?.external)
    .map(([name]) => name);
}

function resolveComposeFile(tokens: string[], cwd: string): string | undefined {
  const explicit = getFlagValue(tokens, ["-f", "--file"]);
  if (explicit) return join(cwd, explicit);
  return DEFAULT_COMPOSE_FILENAMES.map((name) => join(cwd, name)).find(existsSync);
}

function namesFromPositional(tokens: string[], afterToken: string): string[] {
  const idx = tokens.indexOf(afterToken);
  return tokens.slice(idx + 1).filter((t) => !t.startsWith("-"));
}

function volumeChanges(names: string[]): ResourceChange[] {
  return names.map((name): ResourceChange => ({
    provider: "docker",
    resourceType: "docker:volume",
    address: name,
    action: "delete",
    tags: {}
  }));
}

/**
 * Docker/Compose has no dry-run for volume deletion, so PlanGate reads the
 * one structured source that exists: names given on the command line, or
 * the compose file's `volumes:` section. When neither is enumerable
 * (`volume prune`, `system prune --volumes`), it asks instead of guessing.
 */
export function getDockerPlan(command: string, cwd: string): PlanResult {
  const tokens = tokenize(command);

  if (/\bvolume\s+rm\b/.test(command)) {
    return { provider: "docker", changes: volumeChanges(namesFromPositional(tokens, "rm")), degraded: false };
  }

  if (/\bdown\b/.test(command) && /(?:docker-compose|docker\s+compose)/.test(command)) {
    const composeFile = resolveComposeFile(tokens, cwd);
    if (!composeFile) {
      return {
        provider: "docker",
        changes: [],
        degraded: true,
        note: "Could not find the compose file to see which volumes `down -v` would delete. Refusing to approve an unverified teardown."
      };
    }
    return {
      provider: "docker",
      changes: volumeChanges(extractComposeVolumeNames(readFileSync(composeFile, "utf8"))),
      degraded: false
    };
  }

  if (/\bdocker\s+rm\b/.test(command)) {
    const containers = namesFromPositional(tokens, "rm");
    return {
      provider: "docker",
      changes: [],
      degraded: true,
      note: `\`docker rm -v\` can delete anonymous volumes attached to ${containers.join(", ") || "the target container(s)"}; PlanGate cannot verify what data those hold ahead of time.`
    };
  }

  return {
    provider: "docker",
    changes: [],
    degraded: true,
    note: "`docker volume prune` / `docker system prune --volumes` can delete volumes PlanGate cannot enumerate ahead of time. Refusing to auto-approve."
  };
}
