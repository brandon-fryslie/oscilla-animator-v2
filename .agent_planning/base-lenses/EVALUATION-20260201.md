# Evaluation: Base Lens Implementation
Generated: 2026-02-01

## Verdict: CONTINUE

## Context

The task is to implement the "minimal ship-it" lens set from `design-docs/_new/lenses/01-base-lenses.md`. The infrastructure for lenses already exists — Sprint 2 of the adapter system redesign established:

1. `LensAttachment` data model on ports (Patch.ts)
2. Two-phase normalization: Phase 1 (expand lenses) → Phase 2 (auto-insert adapters)
3. PatchStore lens mutations (addLens, removeLens, updateLensParams)
4. UI lens utilities (getAvailableLensTypes, findCompatibleLenses, canApplyLens)
5. Lens block creation and edge rewiring in `normalize-adapters.ts`

## What Already Exists

### Infrastructure (COMPLETE)
- LensAttachment type with params support
- Phase 1 lens expansion in normalize-adapters.ts
- PatchStore.addLens/removeLens/updateLensParams
- lensUtils.ts for UI compatibility checking
- PortContextMenu with lens add/remove UI

### Existing Blocks That Are Already Lenses
- **Broadcast** (signal→field) — already registered with adapterSpec
- **Reduce** (field→signal) — already registered, supports sum/avg/min/max via config

### Existing Adapter Blocks (type converters, not value-shaping lenses)
- 11 unit conversion adapters (degrees↔radians, phase↔scalar, etc.)

### What's Missing: VALUE-SHAPING LENS BLOCKS
None of the following exist as blocks:
1. Scale+Bias
2. Clamp
3. Wrap01 (as standalone lens — exists as adapter ScalarToPhase01 but with unit change)
4. Slew/Lag (exists as signal block, NOT as a lens)
5. Step Quantize
6. Smoothstep / Power/Gamma
7. Mask
8. Extract/Construct (vector component access)

## Key Design Decisions

### Lenses vs Adapters: Category Distinction
- **Adapters** (`category: 'adapter'`): Change unit/cardinality type. Auto-inserted by compiler Phase 2. Have `adapterSpec`.
- **Lenses** (`category: 'lens'`): Value-shaping transformations. User-controlled only. NO `adapterSpec` (never auto-inserted). Have parameterized inputs.

### Lens Block Naming
Convention: `ScaleBias`, `Clamp`, `Wrap01`, etc.

### Lens Discovery
`lensUtils.ts` currently filters by `category: 'adapter'`. Must be updated to also include `category: 'lens'` — or better, use a dedicated category.

### Type Polymorphism
Most value-shaping lenses operate on FLOAT with scalar units. Some (Extract/Construct) need payload polymorphism. The `payload` metadata on BlockDef handles this.

### Stateful Lenses
Slew/Lag is stateful (needs `allocStateSlot`, `stateRead`, `stepStateWrite`). This is fine — the Lag block already demonstrates this pattern. However, stateful lenses need `capability: 'state'` and `isStateful: true`.

## Risks

1. **lensUtils.ts hardcodes `category: 'adapter'`** — lens blocks with `category: 'lens'` won't appear in UI until this is updated.
2. **Slew as lens vs block** — Lag already exists as a signal block. A Slew lens would be a duplicate unless it's specifically for lens-on-port usage. Decision: the lens version should be usable as a port-attached lens, distinct from the standalone Lag block.
3. **Extract/Construct requires vec3/color payload awareness** — more complex than scalar lenses. May benefit from being a separate sprint.

## Available OpCodes for Lens Implementation

All needed opcodes exist:
- `Mul`, `Add` — Scale+Bias
- `Clamp` — Clamp
- `Wrap01`, `Fract` — Wrap01
- `Lerp` — Slew/Lag (with state)
- `Floor`, `Round`, `Mul`, `Div` — Step Quantize
- `Select`, `Mul` — Smoothstep (composable from existing ops)
- `Pow` — Power/Gamma
- `Select` — Mask

## Scope Assessment

The 10-item "ship it" list from the design doc breaks into:
- **Already done**: Broadcast (#7), Reduce (#8)
- **Pure scalar lenses (straightforward)**: Scale+Bias (#1), Clamp (#2), Wrap01 (#3), Step Quantize (#5), Smoothstep/Gamma (#6)
- **Stateful lens**: Slew/Lag (#4)
- **Gating lens**: Mask (#9)
- **Payload-polymorphic**: Extract/Construct (#10)

Recommended phasing:
- Sprint 1: Pure scalar lenses + infrastructure update (HIGH confidence)
- Sprint 2: Stateful + gating lenses (HIGH confidence, pattern exists)
- Sprint 3: Extract/Construct (MEDIUM confidence, needs payload polymorphism design)
