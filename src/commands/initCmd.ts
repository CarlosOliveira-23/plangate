import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { DEFAULT_CONFIG_YAML } from "../config.js";

export async function runInit(): Promise<number> {
  const path = join(process.cwd(), ".plangate.yml");
  if (existsSync(path)) {
    console.error(pc.red(`${path} already exists.`));
    return 1;
  }

  writeFileSync(path, DEFAULT_CONFIG_YAML, "utf8");
  console.log(`${pc.green("✔")} Created ${path}`);
  return 0;
}
