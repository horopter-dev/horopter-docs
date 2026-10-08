import { randomBytes } from "node:crypto";

export interface Markers {
  step: string;
  attempt: string;
}

export interface SessionBlock {
  command: string;
  retry?: number;
}

export interface SessionOutput {
  completed: string[][];
  unfinished: string[];
}

/**
 * Makes the marker lines for one session: random, so no block prints them by chance.
 *
 * Returns:
 *   A marker printed after each block, and one printed after each failed retry attempt.
 */
export function newMarkers(): Markers {
  const id = randomBytes(8).toString("hex");
  return { step: `__TUTORIAL_STEP_${id}__`, attempt: `__TUTORIAL_ATTEMPT_${id}__` };
}

function markerLine(marker: string): string {
  // The newline before the marker ends a block's last line when the block did not.
  return `printf '\\n%s\\n' '${marker}'`;
}

function retried(command: string, interval: number, markers: Markers): string {
  // errexit is ignored inside a condition, so each attempt runs as a plain command with its
  // own `set -e`, and the loop reads its status afterwards.
  return [
    "set +e",
    "while true; do",
    "(",
    "set -e",
    command,
    ")",
    '[ "$?" -eq 0 ] && break',
    markerLine(markers.attempt),
    `sleep ${interval}`,
    "done",
    "set -e",
  ].join("\n");
}

/**
 * Writes a tutorial's run blocks as one bash script, so variables and directory changes carry
 * from block to block as they do for a reader. stderr joins stdout to keep the two in order,
 * and a marker line after each block marks where its output ends. A retry block repeats in a
 * subshell until an attempt succeeds, with a marker line after each failed attempt.
 *
 * Args:
 *   blocks: Each run block's commands and retry interval in seconds, in page order.
 *   markers: The session's markers, from `newMarkers`.
 *
 * Returns:
 *   The script's text.
 */
export function sessionScript(blocks: SessionBlock[], markers: Markers): string {
  const body = blocks.flatMap(({ command, retry }) => [
    retry === undefined ? command : retried(command, retry, markers),
    markerLine(markers.step),
  ]);
  return ["set -euo pipefail", "exec 2>&1", ...body, ""].join("\n");
}

function separator(marker: string): string {
  return `\n${marker}\n`;
}

function linesOf(text: string): string[] {
  if (text === "") {
    return [];
  }
  const lines = text.split("\n");
  return text.endsWith("\n") ? lines.slice(0, -1) : lines;
}

function lastAttempt(text: string, markers: Markers): string {
  return text.split(separator(markers.attempt)).at(-1) ?? "";
}

function lastAttemptThatPrinted(text: string, markers: Markers): string {
  return text.split(separator(markers.attempt)).findLast((attempt) => attempt !== "") ?? "";
}

/**
 * Splits a session's output at the marker lines `sessionScript` writes.
 *
 * Args:
 *   output: Everything the session printed.
 *   markers: The markers the script was written with.
 *
 * Returns:
 *   The lines of each block that ran to its end, and the lines printed after the last
 *   block marker: empty when every block completed, or the stopped block's output when not.
 *   A finished retried block's lines are its last attempt's; a stopped one's are those of
 *   its last attempt that printed anything, since it may have stopped between attempts.
 */
export function splitOutput(output: string, markers: Markers): SessionOutput {
  const parts = output.split(separator(markers.step));
  const unfinished = parts.pop() ?? "";
  return {
    completed: parts.map((part) => linesOf(lastAttempt(part, markers))),
    unfinished: linesOf(lastAttemptThatPrinted(unfinished, markers)),
  };
}

/**
 * Counts the blocks a session's output so far shows as finished.
 *
 * Args:
 *   output: What the session has printed so far.
 *   markers: The markers the script was written with.
 *
 * Returns:
 *   The number of block markers in the output.
 */
export function completedBlocks(output: string, markers: Markers): number {
  return output.split(separator(markers.step)).length - 1;
}
