# Sprint: Vector Component Lenses (Extract/Construct)
Generated: 2026-02-01
Confidence: HIGH: 0, MEDIUM: 2, LOW: 0
Status: RESEARCH REQUIRED

## Sprint Goal
Implement Extract and Construct lenses for accessing/building vector and color components.

## Scope
**Deliverables:**
1. Extract — extract a scalar component from vec3/color
2. Construct — build vec3/color from scalar components

## Work Items

### P0: Extract block

Extract a single component from a multi-component payload (vec3, color).

**Acceptance Criteria:**
- [ ] Block type `Extract` registered with `category: 'lens'`
- [ ] Input: `in` (vec3 or color), `component` (config: 0|1|2, or 'x'|'y'|'z'|'r'|'g'|'b')
- [ ] Output: `out` (FLOAT — scalar extracted component)
- [ ] Correctly extracts the specified component from multi-stride values
- [ ] Test: extract(vec3(1,2,3), 1) = 2

#### Unknowns to Resolve
- How does the IR handle component extraction from strided values? Need to check if there's an existing pattern for reading a single lane from a vec3/color buffer.
- Does the existing `components` field on `ValueRefExpr` provide what's needed, or is a new IR operation required?
- Payload polymorphism: should this use `payloadVar` for type inference, or accept any multi-component payload?

#### Exit Criteria
- Confirm IR has or can support component extraction from strided buffers
- Identify whether an IR extension is needed
- Determine the payload constraint approach

### P1: Construct block

Build a vec3/color from individual scalar components.

**Acceptance Criteria:**
- [ ] Block type `Construct` registered with `category: 'lens'`
- [ ] Inputs: `x`/`y`/`z` (or `r`/`g`/`b`) as FLOAT scalars
- [ ] Output: `out` (vec3 or color)
- [ ] Assembles components into a multi-component output
- [ ] Test: construct(1, 2, 3) = vec3(1, 2, 3)

#### Unknowns to Resolve
- How does the IR assemble individual scalars into a multi-stride output? Is there a `pack` or `construct` IR operation?
- Which payload types should be supported? vec2, vec3, color? All of them?
- How does the output type get determined — is it from config, or inferred from connections?

#### Exit Criteria
- Confirm IR supports or can be extended for component assembly
- Identify approach for output type determination (config vs inference)

## Dependencies
- Sprint 1 (infrastructure + pure lenses) must be complete
- May need IR extensions (to be determined during research)

## Risks
- **IR may not support component extraction natively** — current IR operates at the payload stride level. Extracting a single float from a vec3 may need a new `extractComponent` IR node.
- **Type change**: Unlike other lenses, Extract changes the output type (vec3→float). This means it won't be discoverable as a "compatible lens" for same-type connections. May need special handling in `canApplyLens`.
- **Construct needs multi-input**: 3 scalar inputs → 1 vec3 output. This is fine for a block, but as a lens it means the lens block has multiple wirable inputs.
