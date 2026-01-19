# Sprint: state-mapping - Definition of Done

> **Sprint**: state-mapping
> **Generated**: 2026-01-18

---

## Acceptance Criteria Checklist

### ContinuityState Types (src/runtime/ContinuityState.ts)

- [ ] File exists and is properly typed
- [ ] `StableTargetId` branded type exported
- [ ] `computeStableTargetId()` function exported
- [ ] `MappingState` discriminated union exported
  - Variants: `identity`, `byId`, `byPosition`
  - `byId` and `byPosition` have `newToOld: Int32Array`
- [ ] `TargetContinuityState` interface exported
- [ ] `ContinuityState` interface exported
- [ ] `createContinuityState()` factory exported
- [ ] `getOrCreateTargetState()` function exported

### ContinuityMapping (src/runtime/ContinuityMapping.ts)

- [ ] File exists and is properly typed
- [ ] `buildMappingById()` function exported
- [ ] `buildMappingByPosition()` function exported
- [ ] `detectDomainChange()` function exported

### RuntimeState Integration

- [ ] `RuntimeState` interface includes `continuity: ContinuityState`
- [ ] `createRuntimeState()` initializes continuity state

### Mapping Algorithm Correctness

- [ ] 10→11 maps indices 0-9 correctly, index 10 is -1
- [ ] 11→10 maps indices 0-9 correctly
- [ ] Identity mapping returns `{ kind: 'identity' }` for unchanged domains
- [ ] byPosition respects maxSearchRadius

### Tests

- [ ] Unit tests exist at `src/runtime/__tests__/ContinuityMapping.test.ts`
- [ ] All tests pass: `npm test`
- [ ] Type check passes: `npm run typecheck`

---

## Verification Commands

```bash
# Type check
npm run typecheck

# Run mapping tests
npm test -- --testPathPattern=ContinuityMapping

# Verify exports
grep -E "export (type|interface|function)" src/runtime/ContinuityState.ts
grep -E "export (type|interface|function)" src/runtime/ContinuityMapping.ts
```

---

## Exit Criteria

Sprint is complete when:
1. All checklist items above are checked
2. `npm run typecheck` passes with zero errors
3. `npm test` passes with zero failures
4. Integration with RuntimeState verified
