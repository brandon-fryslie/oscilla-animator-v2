# Definition of Done: param-hints Sprint

**Generated:** 2026-01-20

## Acceptance Criteria

### Type System
- [ ] `BlockDef.paramHints` field exists with type `Record<string, UIControlHint> | undefined`
- [ ] TypeScript compiles without errors
- [ ] No breaking changes to existing block registrations

### UI Behavior
- [ ] ParamField prioritizes `paramHints[key]` over `inputDef.uiHint`
- [ ] Falls back to inputDef.uiHint when paramHint not specified
- [ ] Falls back to type inference when no hints available

### Const Block
- [ ] Const block uses `paramHints` instead of inline `params.uiHint`
- [ ] Slider renders for `value` param in inspector
- [ ] Slider has range 1-10000 with step 1
- [ ] Value changes work correctly

### No Regressions
- [ ] Existing blocks with input hints still work (Square, Array)
- [ ] Existing blocks without hints still work
- [ ] Build passes (`npm run build`)
- [ ] Type check passes (`npm run typecheck`)

## Verification Method

1. Build and typecheck: `npm run build && npm run typecheck`
2. Manual test: Create Const block, verify slider appears in inspector
3. Regression: Create Square block, verify its slider still works
