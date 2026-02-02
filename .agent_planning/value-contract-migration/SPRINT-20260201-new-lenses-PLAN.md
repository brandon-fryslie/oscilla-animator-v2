# Sprint: New Lenses - Contract-Based Adapter and Lens Blocks
Generated: 2026-02-01
Confidence: HIGH: 2, MEDIUM: 1, LOW: 0
Status: PARTIALLY READY
Depends-on: SPRINT-20260201-migrate-refs

## Sprint Goal
Add the adapter and lens blocks from the design doc that leverage the new ValueContract system: Clamp01, Wrap01, Clamp11 adapters + NormalizeRange/DenormalizeRange parameterized lenses.

## Work Items

### P0: Add contract-based auto-insert adapter blocks
**Acceptance Criteria:**
- [ ] `Adapter_Clamp01` block: scalar(none) → scalar(clamp01) via `clamp(x, 0, 1)`
- [ ] `Adapter_Wrap01` block: scalar(none) → scalar(wrap01) via `fract(x)`
- [ ] `Adapter_Clamp11` block: scalar(none) → scalar(clamp11) via `clamp(x, -1, 1)`
- [ ] All registered with adapter-spec TypePattern using contract matching
- [ ] Auto-insertion triggers when connecting no-contract source to contract-requiring input
- [ ] Unit tests for each

**Technical Notes:**
- `Adapter_ScalarToNorm01Clamp` already exists — this becomes `Adapter_Clamp01` after the migration
- `Adapter_Wrap01` is new (scalar→scalar but adds wrap contract)
- `Adapter_Clamp11` is new (for bipolar signals)
- These are auto-inserted by the compiler, not user-placed

### P1: Add bidirectional bipolar↔unipolar adapters
**Acceptance Criteria:**
- [ ] `Adapter_BipolarToUnipolar` block: scalar(clamp11) → scalar(clamp01) via `u = (b+1)/2`
- [ ] `Adapter_UnipolarToBipolar` block: scalar(clamp01) → scalar(clamp11) via `b = u*2-1`
- [ ] Registered in adapter-spec with contract-aware patterns
- [ ] Unit tests for both

**Technical Notes:**
- Scale+Bias: `x*0.5+0.5` and `x*2-1`
- These fire when connecting bipolar output to unipolar input (or vice versa)

### P2: Add NormalizeRange and DenormalizeRange lens blocks
**Acceptance Criteria:**
- [ ] `Lens_NormalizeRange` block: maps [inMin, inMax] → scalar(clamp01)
- [ ] `Lens_DenormalizeRange` block: maps scalar(clamp01) → [outMin, outMax]
- [ ] Both have `min` and `max` parameter inputs
- [ ] Tests verify range mapping

**Technical Notes:**
- These are parameterized, so they're lens blocks (user-placed), NOT auto-inserted adapters
- Formula: normalize = (x - min) / (max - min), denormalize = x * (max - min) + min
- The output of NormalizeRange should carry contract: clamp01

#### Unknowns to Resolve
- Should these be in `src/blocks/lens/` or `src/blocks/adapter/`?
- Should the UI offer these in a "lenses" panel or as regular blocks?

#### Exit Criteria
- Decision on block categorization (lens vs regular block)

## Dependencies
- Sprint 2 (Migrate References) must be complete — blocks need new contract types

## Risks
- Adapter auto-insertion priority: if multiple adapters match a contract mismatch, which one wins? Need to verify adapter priority system handles this.
