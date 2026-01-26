# Sprint: position-stride - Update Tests for Stride-2 Position Buffers
Generated: 2026-01-26
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Update steel-thread tests to expect stride-2 position buffers instead of stride-3.

## Scope
**Deliverables:**
- Update `steel-thread.test.ts` for stride-2 positions
- Update `steel-thread-rect.test.ts` for stride-2 positions
- Update `steel-thread-dual-topology.test.ts` for stride-2 positions

## Work Items

### P0: steel-thread.test.ts
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] Line 132: Change `100 * 3` to `100 * 2`
- [ ] Lines 145-151: Update validation loop from `i * 3` to `i * 2`, remove z check
- [ ] Lines 177-184: Update comparison loop from `i * 3` to `i * 2`
- [ ] Update comment at line 130 to say "vec2 stride" not "vec3 stride"
- [ ] Test passes: `npx vitest run src/compiler/__tests__/steel-thread.test.ts`

**Technical Notes:**
- Position buffer changed from stride-3 (world-space xyz) to stride-2 (screen-space xy)
- z coordinate is no longer stored after projection

### P1: steel-thread-rect.test.ts
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] Line 129: Change `50 * 3` to `50 * 2`
- [ ] Lines 147-153: Update validation loop from `i * 3` to `i * 2`, remove z check
- [ ] Lines 181-188: Update comparison loop from `i * 3` to `i * 2`
- [ ] Update comment at line 127 to say "vec2 stride"
- [ ] Test passes: `npx vitest run src/compiler/__tests__/steel-thread-rect.test.ts`

### P2: steel-thread-dual-topology.test.ts
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] Line 205: Change `25 * 3` to `25 * 2`
- [ ] Line 210: Change `20 * 3` to `20 * 2`
- [ ] Lines 266-274: Update validation loops from `i * 3` to `i * 2`, remove z checks
- [ ] Lines 305-322: Update comparison loops from `i * 3` to `i * 2`
- [ ] Update comments to say "vec2 stride"
- [ ] Test passes: `npx vitest run src/compiler/__tests__/steel-thread-dual-topology.test.ts`

## Dependencies
- None (tests only)

## Risks
- None - purely mechanical test updates
