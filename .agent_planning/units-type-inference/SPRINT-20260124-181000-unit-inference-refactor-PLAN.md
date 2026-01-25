# Sprint: unit-inference-refactor - Single Source of Truth for Unit Resolution

Generated: 2026-01-24T18:10:00Z
Confidence: HIGH: 4, MEDIUM: 1, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Make pass1 (constraint solver) the single source of truth for unit resolution. Remove unit inference from pass0. Fix the shared unitVar problem.

## Scope

**Deliverables:**
- Pass0 only resolves payload type, NOT unit
- Pass1 constraint solver handles all unit resolution with per-block-instance variables
- All 86 test files pass, typecheck clean
- No redundant inference paths

## Work Items

### P0: Fix the shared unitVar problem in pass1

**Acceptance Criteria:**
- [ ] Each block instance gets a unique unit variable ID (not shared `const_out`)
- [ ] Pass1 creates per-instance variables like `blockIndex:portName:out` instead of using definition's shared ID
- [ ] Constraint solver can independently resolve units for different Const blocks

**Technical Notes:**
- In `pass1TypeConstraints()`, when encountering a polymorphic port, create a unique variable ID based on `${blockIndex}:${portName}:${direction}`
- The union-find then operates on these unique IDs
- This allows one Const to resolve to `phase01` while another resolves to `scalar`

### P1: Remove unit inference from pass0

**Acceptance Criteria:**
- [ ] `pass0-polymorphic-types.ts` no longer sets `resolvedUnit` on blocks
- [ ] Pass0 ONLY sets `payloadType` for payload-generic blocks
- [ ] No more `block.params.resolvedUnit` coming from pass0

**Technical Notes:**
- Remove lines that set `resolvedUnit` in pass0-polymorphic-types.ts (lines ~62, ~102, ~114)
- Keep payload type inference intact - that's still needed

### P2: Update pass1-default-sources.ts if needed

**Acceptance Criteria:**
- [ ] Default source Const blocks are created without pre-resolved units
- [ ] They only get `payloadType` from the target port's type

**Technical Notes:**
- Currently line 97 sets `payloadType` only - verify no unit setting sneaks in
- Default sources should remain unit-polymorphic until pass1 resolves them

### P3: Verify pass2 uses pass1's resolved types correctly

**Acceptance Criteria:**
- [ ] `getPortType()` in pass2 correctly reads from `resolvedPortTypes` map
- [ ] Falls back to definition type only for monomorphic ports
- [ ] Throws error if polymorphic port not in resolved map (existing behavior)

**Technical Notes:**
- This should already work correctly - just verify after other changes

### P4 (MEDIUM): Handle unconnected polymorphic ports

**Acceptance Criteria:**
- [ ] Unconnected Const blocks produce clear error: "Cannot resolve unit for unconnected Const.out"
- [ ] Error message includes suggestions per spec

**Technical Notes:**
- If a Const block's output has no outgoing edge, its unit variable is unconstrained
- Pass1 should detect this and emit `UnresolvedUnit` error
- Already implemented but verify it works after refactor

## Dependencies

- None - self-contained refactor

## Risks

- Some tests may rely on pass0's unit resolution behavior
- Need to verify default sources still work correctly
