# Plan: Fix DefaultSource Cardinality Bug

## Problem

`DefaultSource` block (`src/blocks/signal/default-source.ts`) only produces signal-cardinality (`one`) outputs. When a target port expects field-cardinality (`many`), the constant is type-mismatched and the default source is rejected.

**Root Cause**: The `lower()` function passes `outType` directly to `ctx.b.constant()` and never checks cardinality. Constants are inherently scalar. To produce a field, you need per-element varying values — not just a broadcast of a uniform constant.

## Solution

Restructure `lower()` to branch on cardinality first, then payload kind.

### Signal path (cardinality `one`) — unchanged

Existing dispatch: float→1.0, int→0, bool→false, vec2→[0,0], vec3→[0,0,0], color→HueRainbow(phaseA).

### Field path (cardinality `many`) — new

For fields, elements must be visually distinct. Two payloads need special treatment:

#### vec3 field (position default)
Arrange elements in a time-varying circle so they're spatially spread and animated:
1. `normalizedIndex` intrinsic field (0→1 per element)
2. `phaseA` signal (time) → broadcast to field
3. `angle = (normalizedIndex + phaseA) * 2π`
4. `x = cos(angle)`, `y = sin(angle)`, `z = 0`
5. `construct([x, y, z], outType)` → vec3 field

IR ops: `intrinsic`, `broadcast`, `kernelZip(Add)`, `kernelMap(Mul)`, `kernelMap(Cos/Sin)`, `constant(0)`, `construct`.

#### color field (color default)
Per-element rainbow that shifts over time:
1. `normalizedIndex` intrinsic field (0→1 per element)
2. `phaseA` signal (time) → broadcast to field
3. `hue = normalizedIndex + phaseA` (each element gets different hue, all shift with time)
4. `construct([hue, 0.8, 0.5, 1.0], outType_hsl)` → HSL color field
5. `hslToRgb(hsl, outType)` → RGB color field

IR ops: `intrinsic`, `broadcast`, `kernelZip(Add)`, `constant(sat/light/alpha)`, `broadcast(sat/light/alpha)`, `construct`, `hslToRgb`.

#### Other field types (float, int, bool, vec2)
Broadcast the signal constant uniformly — uniform values are fine for these types:
1. Create constant as signal: `ctx.b.constant(value, signalType)`
2. `ctx.b.broadcast(constId, outType)` → field

### Event path — unchanged
`eventNever()` regardless of cardinality.

## Implementation

### Step 1: Refactor lower() structure

Split into three top-level branches:
```
if (discrete) → eventNever (unchanged)
else if (isMany) → dispatchFieldDefault(payload, outType, ctx)
else → existing signal dispatch (unchanged)
```

Extract `dispatchFieldDefault()` as a local function handling vec3/color/other.

### Step 2: Imports

Add to imports: `canonicalSignal`, `isMany`, `unitTurns`, `unitHsl`, `COLOR`, `VEC3`, `BOOL`, `OpCode`.

### Step 3: Tests

Create `src/blocks/__tests__/default-source.test.ts`:
- Signal-cardinality outputs work as before (regression)
- Field vec3 produces construct with cos/sin from normalizedIndex + phaseA
- Field color produces hslToRgb from normalizedIndex + phaseA
- Field float produces broadcast of constant
- Event still produces eventNever

## Files Modified

1. `src/blocks/signal/default-source.ts` — Main fix
2. `src/blocks/__tests__/default-source.test.ts` — New tests

## Verification

- `npx vitest run` — All existing tests pass
- `npm run typecheck` — Type check passes
- New tests verify field-cardinality outputs use per-element intrinsics

## What this does NOT do (deferred)

- **Semantic dispatch by port name**: Port-name-aware defaults (e.g., "this is a scale port, default to 1.0"). Currently purely type-driven.
- **Zero cardinality handling**: Separate work item (bd-73lv).
- **Configurable spread radius**: Circle radius is hardcoded to 1.0.
