# Definition of Done: Sprint validation-gate

## Gate Criteria

### Per-Item Gates
- [ ] #14: `deriveKind(zeroCardType)` returns `'const'`; all DerivedKind consumers handle `'const'`
- [ ] #22: `canonicalConst(FLOAT, unitScalar())` returns type with cardinality=zero
- [ ] #15: `compileFrontend()` calls `validateTypes()` after type graph; violations produce errors
- [ ] #21: `validateNoVarAxes()` catches var axes; integrated into validation gate
- [ ] #17: Binding mismatch produces `BindingMismatchError` with left/right/remedy
- [ ] #20: AxisInvalid diagnostic has blockId, portId, expected, actual

### Sprint-Level Gates
- [ ] TypeScript compiles: `npx tsc --noEmit` exits 0
- [ ] Compilation rejects intentional axis violation (integration test)
- [ ] Compilation rejects intentional var escape (integration test)
- [ ] All gap-analysis-scoped tests pass
- [ ] No regressions in passing tests
