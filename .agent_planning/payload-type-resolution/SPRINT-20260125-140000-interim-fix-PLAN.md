# Sprint: Interim Fix - Run Pass 0 Twice

Generated: 2026-01-25T14:00:00Z
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Unblock the "Const block missing payloadType" error by running payload resolution twice - before and after default source materialization.

## Scope

**Deliverables:**
- Run Pass 0 (payload resolution) both before and after Pass 1
- Ensure Pass 0 skips already-resolved blocks on second run
- Add regression test to verify derived Const blocks get payloadType

## Work Items

### P0: Modify pass orchestration to run Pass 0 twice

**Acceptance Criteria:**
- [ ] `runNormalizationPasses()` calls `pass0PayloadResolution()` after `pass1DefaultSources()`
- [ ] Derived Const blocks (from defaultSourceConst) have payloadType set
- [ ] HsvToRgb block with default sat/val compiles successfully
- [ ] All existing tests pass

**Technical Notes:**
- Modify `src/graph/passes/index.ts` lines 54-74
- Pass 0 already skips blocks with `payloadType !== undefined` (line 35)
- Second pass will only process newly created blocks

### P1: Add regression test

**Acceptance Criteria:**
- [ ] Test creates patch with HsvToRgb using default sat/val
- [ ] Test verifies compilation succeeds
- [ ] Test verifies derived Const blocks have payloadType: 'float'

**Technical Notes:**
- Add test in `src/graph/passes/__tests__/pass0-payload-resolution.test.ts`
- Or create new test file for cross-pass integration

### P2: Document the interim solution

**Acceptance Criteria:**
- [ ] Comment in code explaining why Pass 0 runs twice
- [ ] Reference to the architectural fix sprint
- [ ] Mark as INTERIM/TODO for removal

**Technical Notes:**
- Add inline comment in `runNormalizationPasses()`
- Reference this sprint plan

## Dependencies

- None (this is the first fix)

## Risks

- **Minimal**: Pass 0 is idempotent (skips resolved blocks)
- **Performance**: Extra pass is O(n) where n = blocks, negligible impact
