# Implementation Context: parser-infinite-loop

## The Bug (Exact Trace)

Input: `'invalid syntax { ] }'`

Lexer output: `IDENT("invalid"), IDENT("syntax"), LBRACE, RBRACKET, RBRACE, EOF`

Parser trace:
1. `parseDocument()` loop starts
2. `parseBlock()` consumes "invalid", can't find LBRACE after "syntax", calls `recoverToBlockEnd()`
3. `recoverToBlockEnd()` starts with `braceDepth=1, bracketDepth=0`, scans forward from "syntax"
4. Hits LBRACE → braceDepth=2, advance
5. Hits RBRACKET → bracketDepth=-1 → **break without advance**. Cursor stuck at RBRACKET (index 3).
6. `parseBlock()` returns null. Back in `parseDocument()`.
7. `skipNewlines()` — no-op (RBRACKET is not NEWLINE)
8. `!isAtEnd()` — true (cursor at RBRACKET, not EOF)
9. `parseBlock()` again: token is RBRACKET, not IDENT → error → `recoverToBlockEnd()` → same break → same position
10. **Infinite loop**. Each iteration pushes error. Array grows to 169M+ → OOM.

## Key Code Locations

- `parser.ts:58-64` — `parseDocument()` main loop (no progress guard)
- `parser.ts:84-87` — `parseBlock()` early return on non-IDENT (calls recover, returns null)
- `parser.ts:395-421` — `recoverToBlockEnd()` (the bug: break without advance on line 416)
- `parser.ts:423-431` — `recoverToNewline()` (safe: always advances)

## Fix Strategy

### `recoverToBlockEnd()` fix

The method has two problems:
1. `break` on line 416 doesn't advance past the RBRACKET
2. `braceDepth = 1` assumes we're inside braces, but callers at line 86 haven't entered a brace

Fix approach: Add a `startedInsideBrace: boolean` parameter (default true for backward compat) OR restructure the loop to advance-then-check instead of check-then-advance. The key invariant is: **every iteration must advance the cursor**.

### `parseDocument()` guard

Add `const before = this.current` check after each `parseBlock()` call. If no progress, force-advance. This is a permanent safety net.

## Test Strategy

Parser tests live in `src/patch-dsl/__tests__/parser.test.ts`. Add a `describe('error recovery')` block with malformed inputs. Use Vitest's test timeout (default 5000ms) as a safety net — if any test hangs, it fails instead of OOMing.
