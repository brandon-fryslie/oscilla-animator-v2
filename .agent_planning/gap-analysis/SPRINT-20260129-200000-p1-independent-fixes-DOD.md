# Definition of Done: Sprint p1-independent-fixes

## Gate Criteria

### Per-Item Gates
- [ ] #1: `canonical-types.test.ts` gap-analysis-related assertions pass with `'inst'` discriminant
- [ ] #2: DEFAULTS_V0 perspective/branch are `{ kind: 'default' }` objects, not strings
- [ ] #3: `constValueMatchesPayload()` called in `sigConst()` and `fieldConst()` — mismatch throws
- [ ] #4: `payloadStride()` returns `number`, exhaustive switch, no fall-through default
- [ ] #5: `grep -r 'AxisTag' src/` returns 0 results
- [ ] #6: No `.stride` field on ConcretePayloadType variants; `payloadStride()` is sole authority
- [ ] #7: No `{ kind: 'shape' }` in PayloadType; SHAPE constant removed
- [ ] #8: `CameraProjection` is closed union; ConstValue uses it
- [ ] #9: `tryDeriveKind()` exported, returns null for var axes, tested
- [ ] #10: `sigEventRead` sets type internally, no caller-provided type param
- [ ] #11: `AxisViolation` uses `nodeKind` + `nodeIndex`
- [ ] #12: deriveKind agreement assert exists at lowering + debug boundaries
- [ ] #13: Forbidden-pattern Vitest test exists and passes

### Sprint-Level Gates
- [ ] TypeScript compiles: `npx tsc --noEmit` exits 0
- [ ] All gap-analysis-scoped tests pass
- [ ] Tests failing from out-of-scope causes commented out with TODO
- [ ] No regressions in passing tests
