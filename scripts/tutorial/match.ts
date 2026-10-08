const wildcard = "...";

function linePattern(expected: string): RegExp {
  const literals = expected.split(wildcard).map((part) => RegExp.escape(part));
  return new RegExp(`^${literals.join(".*")}$`);
}

/**
 * Checks a run block's output against its expect block. Each expected line must match the
 * output line in the same place; `...` within a line matches any text. Extra output lines
 * are allowed only after a final `...` line.
 *
 * Args:
 *   expected: The expect block's lines.
 *   actual: The run block's output lines.
 *
 * Returns:
 *   A description of the first mismatch, or undefined when the output matches.
 */
export function matchOutput(expected: string[], actual: string[]): string | undefined {
  const allowsMore = expected.at(-1) === wildcard;
  const required = allowsMore ? expected.slice(0, -1) : expected;
  for (const [index, line] of required.entries()) {
    const got = actual[index];
    if (got === undefined) {
      return `line ${index + 1}: expected "${line}", but the output ended`;
    }
    if (!linePattern(line).test(got)) {
      return `line ${index + 1}: expected "${line}", got "${got}"`;
    }
  }
  const extra = actual[required.length];
  if (!allowsMore && extra !== undefined) {
    return `line ${required.length + 1}: unexpected "${extra}"`;
  }
  return undefined;
}
