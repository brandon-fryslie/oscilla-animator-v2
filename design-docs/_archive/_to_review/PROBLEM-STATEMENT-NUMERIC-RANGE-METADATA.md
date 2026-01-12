# Problem Statement: Numeric Range Semantics for Phase/Unit

## What we’re trying to solve
Several components need **concrete numeric behavior** (min/max/step, wrap) for floats that represent normalized values (e.g., phase, unit/progress), but the system no longer has a dedicated `phase` domain. This is causing TypeScript failures and behavioral ambiguity:

- Bus UI components compare `domain === 'phase'` or `domain === 'number'`, but `phase` is no longer a CoreDomain and `number` was replaced by `float`.
- Adapters still create TypeDesc with `domain: 'number'` or `'phase'` which is invalid.
- Lens resolution expects to identify phase to emit `Signal:phase` artifacts.

The core need is **explicit, typed metadata** for numeric range behavior — without brittle string matching or “detective” logic.

## Constraints / decisions already made
- No ad‑hoc string matching like `semantics.startsWith('phase')`.
- No components inventing meaning from loose string values.
- The IR compiler is the canonical compiler; no re‑enabling legacy compiler.
- Only requirement is to publish two phases on buses.

## What I considered
### Option A: Encode phase via `semantics` strings
- Pros: minimal structural change
- Cons: requires string matching in UI and elsewhere; user explicitly rejected.

### Option B: Add `range` metadata to `TypeDesc`
- Pros: explicit numeric behavior for UI; avoids “phase” checks
- Cons: user flagged that `TypeDesc` should not carry numeric range if it applies to non‑numeric domains (event/config/vec2/string). This makes it a poor fit at the TypeDesc level.

### Option C: Introduce numeric-range metadata somewhere else (not `TypeDesc`)
- Create a **separate numeric metadata map** keyed by type or port ID, used by UI controls.
- Keeps TypeDesc pure/structural while still allowing explicit numeric behavior.

## Proposed direction (pending approval)
Given the rejection of `range` on `TypeDesc`, the best path is:

1) **Define a numeric range metadata table** separate from TypeDesc.
   - Example: `PortRangeHints` map keyed by `BlockType + portId` or by `SlotType`.
   - Alternatively: a `NumericHint` object in slot/port definitions (not TypeDesc).

2) **Use explicit numeric hints** for phase/unit/progress in block definitions.
   - Ex: `output('phase', ..., { uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01, wrap: true } })`

3) **Update UI components** (BusInspector, BusViz) to read the explicit hint rather than domain/semantics.

4) **Adapters/Lens**: convert phase behavior into explicit hints or dedicated adapter types without needing domain `phase`.

## Files involved (current failures)
- `src/editor/BusInspector.tsx` (phase/number checks)
- `src/editor/BusViz.tsx` (phase/number checks)
- `src/editor/BusCreationDialog.tsx` (defaults to number)
- `src/editor/adapters/AdapterRegistry.ts` (number/phase domains)
- `src/editor/lenses/lensResolution.ts` (phase domain check)
- `src/editor/ir/types/typeConversion.ts` (Phase mapping)

## Next step needed
Choose where explicit numeric range metadata should live (port definitions vs a dedicated registry) so UI and adapters can rely on it without using string matching or adding range to TypeDesc.

