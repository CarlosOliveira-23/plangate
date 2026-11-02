import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import pc from "picocolors";

interface HookEntry {
  type: string;
  command: string;
}

interface MatcherEntry {
  matcher?: string;
  hooks?: HookEntry[];
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: MatcherEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const HOOK_COMMAND = "npx plangate hook";

export interface InitHookOptions {
  global?: boolean;
}

/**
 * Registers PlanGate as a Claude Code PreToolUse hook on the Bash tool,
 * merging into whatever settings.json already has rather than overwriting
 * it. Idempotent: running it twice doesn't add a duplicate entry.
 *
 * NOTE: this writes the hook configuration the current community
 * documentation describes (matcher + hooks[].type/command). Verify with
 * `/hooks` inside Claude Code after installing, since this project
 * couldn't reach docs.anthropic.com to confirm the schema directly.
 */
export async function runInitHook(options: InitHookOptions): Promise<number> {
  const path = options.global
    ? join(homedir(), ".claude", "settings.json")
    : join(process.cwd(), ".claude", "settings.json");

  let settings: ClaudeSettings = {};
  if (existsSync(path)) {
    try {
      settings = JSON.parse(readFileSync(path, "utf8")) as ClaudeSettings;
    } catch (err) {
      console.error(pc.red(`Could not parse existing ${path}: ${(err as Error).message}`));
      return 1;
    }
  }

  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];

  let bashMatcher = settings.hooks.PreToolUse.find((m) => m.matcher === "Bash");
  if (!bashMatcher) {
    bashMatcher = { matcher: "Bash", hooks: [] };
    settings.hooks.PreToolUse.push(bashMatcher);
  }
  bashMatcher.hooks ??= [];

  const alreadyRegistered = bashMatcher.hooks.some((h) => h.command.includes("plangate"));
  if (alreadyRegistered) {
    console.log(pc.dim(`PlanGate is already registered in ${path}.`));
    return 0;
  }

  bashMatcher.hooks.push({ type: "command", command: HOOK_COMMAND });

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");

  console.log(`${pc.green("✔")} Registered PlanGate as a PreToolUse hook in ${path}`);
  console.log(pc.dim("  Run /hooks inside Claude Code to confirm it loaded, then try a destructive command to see it in action."));
  return 0;
}
