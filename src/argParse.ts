/**
 * Minimal shell-token splitter: handles single/double quotes well enough
 * for AWS CLI / terraform / az / kubectl invocations. It is not a full
 * shell parser (no $(...) expansion, no pipes-as-tokens) -- commands that
 * need more than that should be flagged as degraded by the caller rather
 * than guessed at.
 */
export function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) tokens.push(current);
  return tokens;
}

/** Returns the value following the first occurrence of any of `flags`. */
export function getFlagValue(tokens: string[], flags: string[]): string | undefined {
  for (let i = 0; i < tokens.length; i++) {
    if (flags.includes(tokens[i]) && i + 1 < tokens.length) {
      return tokens[i + 1];
    }
    for (const flag of flags) {
      if (tokens[i].startsWith(`${flag}=`)) {
        return tokens[i].slice(flag.length + 1);
      }
    }
  }
  return undefined;
}

/** Returns every token after `flag` up to (but not including) the next token starting with "--". */
export function getFlagList(tokens: string[], flag: string): string[] {
  const start = tokens.indexOf(flag);
  if (start === -1) return [];
  const values: string[] = [];
  for (let i = start + 1; i < tokens.length; i++) {
    if (tokens[i].startsWith("--")) break;
    values.push(tokens[i]);
  }
  return values;
}

export function hasFlag(tokens: string[], flag: string): boolean {
  return tokens.includes(flag);
}
