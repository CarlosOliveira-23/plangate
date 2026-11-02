#!/usr/bin/env node
import { Command } from "commander";
import { runHook } from "./commands/hookCmd.js";
import { runCheck } from "./commands/check.js";
import { runInit } from "./commands/initCmd.js";
import { runInitHook } from "./commands/initHook.js";

const program = new Command();

program
  .name("plangate")
  .description("Gates AI-agent-proposed cloud/infra commands on the real structured plan/diff, not the command text.")
  .version("0.1.0");

program
  .command("check")
  .description("Manually evaluate a command, e.g. `plangate check -- terraform apply`.")
  .option("--allow-ask", "Exit 0 even when the verdict is ASK (treat as a pass in unattended CI)")
  .argument("<command...>", "the command to evaluate")
  .action(async (commandParts: string[], opts) => {
    process.exitCode = await runCheck(commandParts, { allowAsk: opts.allowAsk });
  });

program
  .command("hook")
  .description("Claude Code PreToolUse hook entrypoint: reads the hook JSON from stdin, writes a decision to stdout.")
  .action(async () => {
    process.exitCode = await runHook();
  });

program
  .command("init")
  .description("Scaffold a .plangate.yml config file in the current directory.")
  .action(async () => {
    process.exitCode = await runInit();
  });

program
  .command("init-hook")
  .description("Register PlanGate as a PreToolUse hook in .claude/settings.json.")
  .option("--global", "Write to ~/.claude/settings.json instead of ./.claude/settings.json")
  .action(async (opts) => {
    process.exitCode = await runInitHook({ global: opts.global });
  });

program.parseAsync(process.argv);
