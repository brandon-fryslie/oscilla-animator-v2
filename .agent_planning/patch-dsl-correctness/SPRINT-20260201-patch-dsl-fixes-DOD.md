# Definition of Done: Patch DSL Correctness Fixes

**Epic**: oscilla-animator-v2-j6h0

## Key Decisions

1. **Dashes**: Allow dashes in lexer identifiers (align lexer with serializer)
2. **Param keys**: Support quoted keys (`"my key" = value`) in grammar
3. **Null**: Dedicated `NULL` TokenKind
4. **Negative numbers**: Lexer-level, adjacency required, handle `-.5`
5. **Recovery**: recoverToBlockEnd promoted to P1

## Acceptance Criteria

### P0 — Critical

- [ ] **AC1**: `deserializePatchFromHCL("!@#$%garbage")` returns a result with errors, does NOT throw
- [ ] **AC2**: Identifiers with dashes lex correctly: `golden-spiral` lexes as single IDENT token. Round-trip works for blocks with dashed display names.
- [ ] **AC3**: Vararg connections, lens attachments, and port overrides (combineMode, defaultSource) survive serialize→deserialize round-trip

### P1 — Important

- [ ] **AC4**: `-1`, `-0.5`, and `-.5` lex as NUMBER tokens and round-trip through serialize/deserialize. `a=-1` tokenizes as IDENT EQUALS NUMBER.
- [ ] **AC5**: `null` values round-trip: `emitValue(null)` produces `null`, parser recognizes `null` keyword via NULL token, `convertHclValue` returns `null`. Works in lists `[1, null, 2]` and objects `{ a = null }`.
- [ ] **AC6**: Param keys with spaces/special chars use quoted key syntax (`"my key" = value`). Parser accepts STRING tokens as attribute keys. Round-trip preserves original key names.
- [ ] **AC7**: Tripwire test file exists covering all review findings (lexer exceptions, negative numbers, null, dashes, quoted keys, error messages)
- [ ] **AC8**: `recoverToBlockEnd()` tracks bracket depth and doesn't consume past object/list container boundaries

### P2-P3 — Polish

- [ ] **AC9**: Edge resolution errors show `blockName.portName` format, not JSON blobs

### Cross-cutting

- [ ] **AC10**: All existing tests still pass (no regressions)
- [ ] **AC11**: `npm run typecheck` passes
- [ ] **AC12**: All child beads of j6h0 are closed with `bd close <id> --reason "..." --json`

## Verification

Run:
```bash
npx vitest run src/patch-dsl/
npm run typecheck
```
