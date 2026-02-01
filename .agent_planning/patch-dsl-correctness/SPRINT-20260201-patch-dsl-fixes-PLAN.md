# Sprint Plan: Patch DSL Correctness Fixes

**Epic**: oscilla-animator-v2-j6h0 — Patch DSL: fix correctness issues from code review
**Confidence**: HIGH (all items are concrete bugs with clear fixes)
**Status**: READY FOR IMPLEMENTATION

## Overview

The Patch DSL (HCL-based serialization) was implemented in Sprint 1-3. Code review found 9 correctness issues. This sprint fixes them all in dependency order.

## Key Decisions (User-Approved)

1. **Dash handling**: Allow dashes in lexer identifiers (align lexer with serializer). Do NOT strip dashes.
2. **Param keys**: Support quoted keys in grammar (`"my key" = value`). Best for round-trip fidelity.
3. **Null**: Add dedicated `NULL` TokenKind (like BOOL has its own kind).
4. **Negative numbers**: Handle at lexer level (signed number literals). Require adjacency (`-1` works, `- 1` does not). Also handle `-.5`.
5. **Recovery**: Promote recoverToBlockEnd fix to P1 (can cause cascading errors).

## Implementation Order

### Group 1: Foundation Fixes (P0 — must fix first)

#### 1.1 Wrap lexer in try/catch in deserializer [qk45]
- **File**: `src/patch-dsl/deserialize.ts`
- **Problem**: `tokenize()` throws on malformed input (e.g., unterminated strings, unexpected chars). The deserializer contract says "never throws" but it does.
- **Fix**: Wrap `tokenize(hcl)` and `parse(tokens)` in try/catch. On catch, return empty patch + PatchDslError with the exception message.
- **Test**: Pass garbage input, verify no throw, verify error in result.

#### 1.2 Fix identifier mismatch: allow dashes in lexer identifiers [2300]
- **Files**: `src/patch-dsl/lexer.ts`
- **Problem**: `toIdentifier()` allows dashes (`[^a-z0-9_-]`), but `isAlphaNumeric()` only accepts `[a-zA-Z0-9_]`. Serialized identifiers with dashes fail to lex.
- **Fix**: Update `isAlphaNumeric()` to also accept `-` (dash). Update identifier grammar comment. Ensure identifier cannot START with dash (only `[a-zA-Z_]` starts, then `[a-zA-Z0-9_-]` continues).
- **IMPORTANT**: Dashes in identifiers interact with negative number parsing (2.1). When `-` follows an identifier context (e.g. `foo-bar`), it's part of the identifier. When `-` appears in value position followed by a digit, it's a negative number. The lexer must handle this by context: identifiers consume `-` only when already in an identifier (i.e. after first alpha/underscore char). Negative numbers are handled separately in `nextToken()` when `-` appears at token start followed by a digit.
- **Test**: Round-trip a block with display name "golden-spiral" — should work.

#### 1.3 Implement vararg/lens/port-override deserialization [97mf]
- **File**: `src/patch-dsl/patch-from-ast.ts`
- **Problem**: Line 179 has `// TODO: Process nested blocks for port overrides, varargs, lenses`. The serializer emits these (serialize.ts:146-162), but deserializer ignores them.
- **Fix**: After building the basic block, iterate over `hclBlock.children` and process:
  - `port` blocks → update `combineMode` and `defaultSource` on matching InputPort
  - `vararg` blocks → build VarargConnection array from nested `connect` blocks
  - `lens` blocks → build LensAttachment array from lens attributes
- **Test**: Round-trip a patch that uses port overrides, varargs, or lenses.

### Group 2: Lexer/Parser Completeness (P1)

#### 2.1 Support negative number literals [m6ct]
- **File**: `src/patch-dsl/lexer.ts`
- **Problem**: `-1` and `-0.5` are not recognized. The lexer sees `-` as unexpected character.
- **Fix**: In `nextToken()`, when `ch === '-'` and next char is a digit OR next char is `.` followed by digit, parse as negative number. Require adjacency (no whitespace between `-` and digits). Also handle `-.5` form.
- **Note**: This does NOT conflict with dash-in-identifiers because identifiers start with `[a-zA-Z_]`, never `-`. The `-` at token start is always either a negative number or an error.
- **Test**: Lex `-1`, `-0.5`, `-.5`, verify NUMBER tokens with correct values. Also test `a=-1` tokenizes correctly as IDENT EQUALS NUMBER.

#### 2.2 Handle null round-trip [vyxn]
- **Files**: `src/patch-dsl/lexer.ts`, `src/patch-dsl/parser.ts`, `src/patch-dsl/ast.ts`, `src/patch-dsl/patch-from-ast.ts`
- **Problem**: `emitValue(null)` emits `"null"` text, but lexer has no `null` keyword, so it lexes as IDENT "null". Parser treats it as a reference, not a null value.
- **Fix**:
  1. Add `NULL = 'NULL'` to TokenKind enum
  2. Add `HclNullValue` variant to HclValue union: `{ kind: 'null' }`
  3. In lexer `identifier()`: recognize `"null"` keyword → emit `TokenKind.NULL` token
  4. In parser `parseValue()`: match `TokenKind.NULL` → return `{ kind: 'null' }`
  5. In `convertHclValue()`: add case `'null'` → return `null`
- **Test**: Round-trip `{ key = null }`, `[1, null, 2]`.

#### 2.3 Support quoted param keys in serialization and parsing [rkp0]
- **Files**: `src/patch-dsl/serialize.ts`, `src/patch-dsl/parser.ts`
- **Problem**: Param keys are emitted raw (`${key} = ...`). If a key contains spaces or special chars, the result is invalid HCL.
- **Fix**:
  1. In serializer `emitBlock()`: check if key is a valid identifier. If not, emit as `"key" = value` (quoted).
  2. In parser `parseAttribute()` and `parseBody()`: accept STRING token as attribute key (in addition to IDENT). This enables round-trip of quoted keys.
  3. Helper function `isValidIdentifier(key: string): boolean` to check if quoting is needed.
- **Test**: Round-trip a block with param key "my key" and "special!chars".

### Group 3: Error Recovery & Polish (P1-P2)

#### 3.1 Add tripwire tests [4hti]
- **File**: `src/patch-dsl/__tests__/tripwire.test.ts` (new)
- **Problem**: The review findings need test coverage to prevent regression.
- **Fix**: Write tests that verify:
  - Lexer exceptions don't escape deserializer
  - Negative numbers round-trip
  - Null values round-trip
  - Dashed identifiers work
  - Quoted param keys round-trip
  - Edge error messages are readable

#### 3.2 Fix recoverToBlockEnd() context-awareness [zum2] — PROMOTED TO P1
- **File**: `src/patch-dsl/parser.ts`
- **Problem**: `recoverToBlockEnd()` counts brace depth starting at 1, but doesn't account for being inside an object `{}` or list `[]` context. It can consume too many closing braces, causing cascading errors.
- **Fix**: Also track bracket depth. Stop at RBRACKET when bracket depth would go negative. This prevents recovery from escaping list/object containers.

#### 3.3 Improve edge endpoint error messages [ipiq]
- **File**: `src/patch-dsl/patch-from-ast.ts`
- **Problem**: Error messages show `JSON.stringify(fromAttr)` which dumps the full HclValue object. Not user-friendly.
- **Fix**: Add `formatHclValue(value: HclValue): string` helper that returns:
  - Reference: `blockName.portName`
  - String: `"value"`
  - Number/Bool: `value.toString()`
  - Object/List: `{...}` or `[...]`

## Dependencies

```
1.1 (try/catch)    ── no deps
1.2 (dashes)       ── no deps (but coordinate with 2.1)
1.3 (vararg)       ── no deps
2.1 (negative)     ── coordinate with 1.2 (dash handling)
2.2 (null)         ── no deps
2.3 (quoted keys)  ── no deps
3.1 (tests)        ── depends on all fixes above
3.2 (recovery)     ── no deps
3.3 (messages)     ── no deps
```

Items 1.2 and 2.1 should be implemented together since they both affect how `-` is handled in the lexer.
All other items are independent.
Tests (3.1) should be written last to cover all fixes.
