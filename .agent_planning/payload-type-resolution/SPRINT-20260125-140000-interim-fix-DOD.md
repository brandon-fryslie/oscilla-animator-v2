# Definition of Done: Interim Fix - Run Pass 0 Twice

## Functional Requirements

- [ ] Patches with HsvToRgb (or any block using defaultSourceConst) compile without "missing payloadType" error
- [ ] Derived Const blocks have correct payloadType based on target input type
- [ ] All 6 demo patches in main.ts compile and run

## Technical Requirements

- [ ] Pass 0 runs twice in `runNormalizationPasses()`: before and after Pass 1
- [ ] No duplicate processing (blocks with payloadType are skipped)
- [ ] No breaking changes to public API

## Test Requirements

- [ ] New regression test for derived Const block payloadType resolution
- [ ] All existing tests in `src/graph/passes/__tests__/` pass
- [ ] All existing tests in `src/compiler/__tests__/` pass
- [ ] Integration test: HsvToRgb with default sat/val

## Documentation Requirements

- [ ] Inline comment explaining the double-pass pattern
- [ ] TODO marker referencing architectural fix
