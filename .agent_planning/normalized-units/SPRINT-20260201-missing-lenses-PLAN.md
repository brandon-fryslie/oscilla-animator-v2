# Sprint: Missing Lenses - Add Adapter Blocks from Design Doc
Generated: 2026-02-01
Confidence: HIGH: 2, MEDIUM: 1, LOW: 0
Status: PARTIALLY READY

## Sprint Goal
Add the 5 missing adapter/lens blocks recommended in the normalized-units design doc: NormalizeRange, DenormalizeRange, Wrap01, Clamp01, and Bipolar↔Unipolar.

## Scope
**Deliverables:**
- 5 new adapter blocks with correct type signatures
- Adapter-spec integration for auto-insertion
- Tests for each new block

## Work Items

### P0: Add Wrap01 and Clamp01 standalone blocks
**Acceptance Criteria:**
- [ ] `Adapter_Wrap01` block: scalar→norm01 via `fract(x)` (Wrap01 opcode)
- [ ] `Adapter_Clamp01` block: scalar→norm01 via `clamp(x, 0, 1)`
- [ ] Both registered in adapter-spec with correct TypePattern
- [ ] Unit tests verify wrapping/clamping behavior

**Technical Notes:**
- Wrap01 opcode already exists in the kernel set
- Clamp opcode already exists
- These are similar to existing `scalar-to-norm01-clamp.ts` but Wrap01 provides wrap semantics vs clamp
- Clamp01 may overlap with existing `scalar-to-norm01-clamp` — check if they're identical

### P1: Add Bipolar↔Unipolar conversion blocks
**Acceptance Criteria:**
- [ ] `Adapter_BipolarToUnipolar` block: [-1,1]→[0,1] via `u = (b+1)/2`
- [ ] `Adapter_UnipolarToBipolar` block: [0,1]→[-1,1] via `b = u*2-1`
- [ ] Registered in adapter-spec
- [ ] Unit tests for both conversions

**Technical Notes:**
- These are Scale+Bias operations: `x*0.5+0.5` and `x*2-1`
- Need to decide on unit representation for bipolar [-1,1] signals — currently no `bipolar` unit kind exists in UnitType
- May need to add `bipolar11` unit kind or use `scalar` with convention

#### Unknowns to Resolve
- Does UnitType need a new `bipolar` / `bipolarNorm` kind? Or is bipolar just `scalar` with convention?
- If we add a new unit kind, it affects the type system broadly

#### Exit Criteria
- Decision on bipolar unit representation

### P2: Add NormalizeRange and DenormalizeRange blocks
**Acceptance Criteria:**
- [ ] `Lens_NormalizeRange` block: maps [inMin, inMax] → [0,1] with configurable min/max parameters
- [ ] `Lens_DenormalizeRange` block: maps [0,1] → [outMin, outMax] with configurable min/max parameters
- [ ] Both have `min` and `max` parameter inputs
- [ ] Tests verify range mapping behavior

**Technical Notes:**
- These are parameterized lenses (Scale+Bias), not simple adapters
- Formula: normalize = (x - min) / (max - min), denormalize = x * (max - min) + min
- These are user-facing lens blocks, not auto-inserted adapters
- Likely implemented as regular blocks (not adapter blocks) since they have parameters

## Dependencies
- Sprint 1 (Port Annotations) should be done first — correct units make adapter rules meaningful

## Risks
- Bipolar unit kind is a MEDIUM confidence item — needs design decision before implementation
- NormalizeRange/DenormalizeRange are parameterized, which means they can't be auto-inserted adapters (they need user-specified min/max). They're lens blocks.
