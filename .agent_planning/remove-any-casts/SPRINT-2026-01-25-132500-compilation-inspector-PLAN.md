# Sprint: CompilationInspector Output Access

**Generated:** 2026-01-25T13:25:00Z
**Confidence:** HIGH: 1, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION
**Estimated effort:** 20-30 minutes

## Sprint Goal

Address ~15 'as any' casts in CompilationInspector output access by properly typing pass snapshots or creating test helpers.

## Scope

**Deliverables:**
- Remove all `snapshot?.passes[0].output as any` casts
- Either type pass output field as discriminated union, or create typed test helper
- Ensure proper access to pass-specific output structures
- Document decision for future CompilationInspector extensions

**Files affected:**
- `src/__tests__/CompilationInspectorService.test.ts`

## Work Items

### P0: Analyze CompilationInspector pass output structure
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] Understand what types pass outputs can be (Pass 1, Pass 2, etc.)
- [ ] Review CompilationInspector types and pass snapshot definitions
- [ ] Determine if outputs are discriminated union or need helper
- [ ] Document findings in code comments

**Technical Notes:**
- Each compiler pass produces different output type
- Snapshots may not have enough type information to discriminate
- May require creating helper: `getPassOutput<T extends Pass>(snapshot, passIndex): T`

### P1: Implement proper typing strategy
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] Choose approach: discriminated union vs typed helper
- [ ] Update type definitions or create test helper as needed
- [ ] Replace all `output as any` casts with typed access
- [ ] Tests pass without regression
- [ ] All 15+ casts eliminated

**Technical Notes:**
- **Option A:** Type pass snapshots as discriminated union by pass type
  - Requires updating CompilationInspector pass types
  - More compiler-enforced, but may require more infrastructure

- **Option B:** Create helper like `getPass7Output(snapshot): ScheduleIR`
  - Works purely in test files, no production code changes
  - Simpler but less type-safe

- **Recommendation:** Start with Option B (helper), consider Option A if boilerplate grows

## Dependencies

- Category 2 (schedule access) - may use ScheduleIR for pass 7 helpers

## Risks

- **Medium:** CompilationInspector API may have design gaps
- **Medium:** Pass output types may not be properly exported
- **Mitigation:** Inspect API first, document any limitations discovered

## Implementation Sequence

1. Read CompilationInspector types and service
2. Understand what each pass output type is
3. Read CompilationInspectorService.test.ts to catalog casts
4. Implement chosen typing strategy (helper or discriminated union)
5. Replace all casts
6. Run tests to verify
7. Document decision for future extension

## Stretch Goal

If output types are well-structured, implement discriminated union approach for stronger type safety going forward.
