# Definition of Done: Payload Stride Object

**Sprint:** payload-stride-object
**Generated:** 2026-01-26

## Completion Criteria

### Code Quality
- [ ] TypeScript compiles with no errors (`npm run typecheck`)
- [ ] All 1631+ tests pass (`npm run test`)
- [ ] No new `any` casts introduced
- [ ] No runtime assertions or checks for stride validity (type system enforces correctness)

### P0: ConcretePayloadType Definition
- [ ] Type is a discriminated union with `kind` and `stride` fields
- [ ] Each stride is a literal type (e.g., `stride: 2` not `stride: number`)
- [ ] Factory constants exist (FLOAT, VEC2, VEC3, COLOR, etc.)
- [ ] `strideOf()` returns `type.stride` directly
- [ ] `isConcretePayload()` works with new structure
- [ ] `payloadsEqual()` compares by `kind`

### P1: Type Comparisons Updated
- [ ] No remaining `payload === 'float'` style comparisons
- [ ] All switch statements use `payload.kind`
- [ ] `ALLOWED_UNITS` restructured for new type
- [ ] `defaultUnitForPayload()` works with new structure

### P2: ContinuityApply Fix
- [ ] `StepContinuityApply.stride` field exists
- [ ] Pass7 populates stride from payload type
- [ ] `ContinuityApply.ts` uses `step.stride`
- [ ] Hardcoded `semantic === 'position' ? 2 : 1` removed
- [ ] Test assertions updated to verify correct behavior

### Verification
- [ ] Create a continuity test case with `color` semantic to verify stride=4 works
- [ ] Verify vec2 continuity still works (regression check)
- [ ] No hardcoded stride heuristics remain in ContinuityApply.ts

## Not Required
- Migrating existing `strideOf()` call sites to `.stride` (future work)
- Performance benchmarks (no performance impact expected)
- Documentation updates (internal refactor)
