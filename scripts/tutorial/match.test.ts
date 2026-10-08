import { describe, expect, it } from "vitest";
import { matchOutput } from "#scripts/tutorial/match.ts";

describe("matchOutput", () => {
  it("accepts output whose lines equal the expected lines", () => {
    expect(matchOutput(["hello", "world"], ["hello", "world"])).toBeUndefined();
  });

  it("accepts no output when no lines are expected", () => {
    expect(matchOutput([], [])).toBeUndefined();
  });

  it("reports the first line that differs", () => {
    expect(matchOutput(["hello", "world"], ["hello", "there"])).toBe(
      'line 2: expected "world", got "there"',
    );
  });

  it("matches ... within a line against any text, including none", () => {
    expect(matchOutput(["id: ...", "...-done"], ["id: 4f2a", "-done"])).toBeUndefined();
  });

  it("matches the rest of a line literally, so regex characters are not special", () => {
    expect(matchOutput(["a.c (x)"], ["abc (x)"])).toBe('line 1: expected "a.c (x)", got "abc (x)"');
    expect(matchOutput(["[...]"], ["[ok]"])).toBeUndefined();
  });

  it("matches the whole line, not a part of it", () => {
    expect(matchOutput(["hello"], ["hello world"])).toBe(
      'line 1: expected "hello", got "hello world"',
    );
  });

  it("reports a missing line", () => {
    expect(matchOutput(["hello", "world"], ["hello"])).toBe(
      'line 2: expected "world", but the output ended',
    );
  });

  it("reports an extra line", () => {
    expect(matchOutput(["hello"], ["hello", "world"])).toBe('line 2: unexpected "world"');
  });

  it("allows extra lines after a final ... line", () => {
    expect(matchOutput(["hello", "..."], ["hello", "world", "again"])).toBeUndefined();
  });

  it("allows no extra lines after a final ... line", () => {
    expect(matchOutput(["hello", "..."], ["hello"])).toBeUndefined();
  });

  it("matches a ... line that is not final against exactly one line", () => {
    expect(matchOutput(["...", "end"], ["anything", "end"])).toBeUndefined();
    expect(matchOutput(["...", "end"], ["one", "two", "end"])).toBe(
      'line 2: expected "end", got "two"',
    );
  });
});
