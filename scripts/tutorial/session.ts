export interface SessionOutput {
  completed: string[][];
  unfinished: string[];
}

/**
 * Writes a tutorial's run blocks as one bash script, so variables and directory changes carry
 * from block to block as they do for a reader. stderr joins stdout to keep the two in order,
 * and a sentinel line after each block marks where its output ends.
 *
 * Args:
 *   commands: Each run block's commands, in page order.
 *   sentinel: A line no block prints; it must need no shell quoting beyond single quotes.
 *
 * Returns:
 *   The script's text.
 */
export function sessionScript(commands: string[], sentinel: string): string {
  // The newline before the sentinel ends a block's last line when the block did not.
  const marker = `printf '\\n%s\\n' '${sentinel}'`;
  return ["set -euo pipefail", "exec 2>&1", ...commands.flatMap((c) => [c, marker]), ""].join("\n");
}

function linesOf(text: string): string[] {
  if (text === "") {
    return [];
  }
  const lines = text.split("\n");
  return text.endsWith("\n") ? lines.slice(0, -1) : lines;
}

/**
 * Splits a session's output at the sentinel lines `sessionScript` writes.
 *
 * Args:
 *   output: Everything the session printed.
 *   sentinel: The sentinel the script was written with.
 *
 * Returns:
 *   The lines of each block that ran to its end, and the lines printed after the last
 *   sentinel: empty when every block completed, or the stopped block's output when not.
 */
export function splitOutput(output: string, sentinel: string): SessionOutput {
  const parts = output.split(`\n${sentinel}\n`);
  const unfinished = parts.pop() ?? "";
  return { completed: parts.map(linesOf), unfinished: linesOf(unfinished) };
}
