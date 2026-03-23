# Unit Typing Audit: scalar Removal + Unit Propagation

**Date**: 2026-02-08
**Branch**: bmf_type_system_refactor

## Summary

Unified two overlapping dimensionless UnitType kinds (`none` and `scalar`) into a single `none` kind. Added unit variable propagation to blocks that should preserve units through their ports.

## Phase 1: scalar Kind Removal

| File | Change |
|---|---|
| `core/canonical-types/units.ts` | Removed `{ kind: 'scalar' }` from UnitType, deleted `unitScalar()`, removed case from `unitsEqual()` |
| `core/canonical-types/payloads.ts` | `ALLOWED_UNITS.float`: `['scalar',...]` -> `['none',...]`; `defaultUnitForPayload(float)`: `unitScalar()` -> `unitNone()` |
| `core/canonical-types/index.ts` | Removed `unitScalar` export |
| `blocks/adapter/*.ts` (~15 files) | `unitScalar()` -> `unitNone()`, `{ kind: 'scalar' }` -> `{ kind: 'none' }` in adapterSpec |
| `blocks/signal/oscillator.ts`, `blocks/signal/lag.ts` | `unitScalar()` -> `unitNone()` |
| `blocks/color/*.ts` (~6 files) | `unitScalar()` -> `unitNone()` |
| `blocks/instance/array.ts` | `unitScalar()` -> `unitNone()` |
| `blocks/render/camera.ts` | `unitScalar()` -> `unitNone()` |
| `blocks/lens/slew.ts`, `blocks/lens/normalize-range.ts` | `unitScalar()` -> `unitNone()` |
| `blocks/domain/*.ts`, `blocks/field/*.ts`, `blocks/layout/*.ts`, `blocks/shape/*.ts` | `{ kind: 'scalar' }` -> `{ kind: 'none' }` in canonicalField/canonicalSignal calls |
| `ui/reactFlowEditor/typeValidation.ts` | Removed `case 'scalar':` |
| `ui/reactFlowEditor/lensUtils.ts` | Removed `case 'scalar':` |
| `ui/debug-viz/renderers/FloatValueRenderer.tsx` | Removed `case 'scalar':`, `{ kind: 'scalar' }` -> `{ kind: 'none' }` |
| `ui/components/BlockInspector.tsx` | `case 'scalar':` -> `case 'none':` |
| `ui/components/typeFormatters.ts` | Removed `case 'scalar':` block |
| `ui/debug-viz/DebugMiniView.tsx` | Removed `unitKind === 'scalar'` comparison |
| ~12 test files | `unitScalar()` -> `unitNone()`, `{ kind: 'scalar' }` -> `{ kind: 'none' }` |

**NOT changed**: `SlotValue.kind: 'scalar'` in runtime/IR (completely different concept).

## Phase 2: Unit Variable Propagation

### Signal/State Blocks

| Block | Port | Old Unit | New Unit | Rationale |
|---|---|---|---|---|
| **UnitDelay** | `in` | `canonicalType(FLOAT)` (none) | `inferType(FLOAT, unitVar('unitDelay_U'))` | Preserves unit through delay |
| **UnitDelay** | `out` | `canonicalType(FLOAT)` (none) | `inferType(FLOAT, unitVar('unitDelay_U'))` | Same var as `in` |
| **UnitDelay** | `initialValue` | `canonicalType(FLOAT)` | no change | Config, not exposed |
| **Lag** | `target` | `canonicalType(FLOAT)` (none) | `inferType(FLOAT, unitVar('lag_U'))` | Preserves unit through smoothing |
| **Lag** | `out` | `canonicalType(FLOAT)` (none) | `inferType(FLOAT, unitVar('lag_U'))` | Same var as `target` |
| **Lag** | `smoothing` | `canonicalType(FLOAT, unitNone(), ..., contractClamp01())` | no change | Dimensionless rate [0,1] |
| **Lag** | `initialValue` | `canonicalType(FLOAT)` | no change | Config, not exposed |
| **Accumulator** | `delta` | `canonicalType(FLOAT)` (none) | `inferType(FLOAT, unitVar('accum_U'))` | Preserves unit through accumulation |
| **Accumulator** | `value` | `canonicalType(FLOAT)` (none) | `inferType(FLOAT, unitVar('accum_U'))` | Same var as `delta` |
| **Accumulator** | `reset` | `canonicalType(BOOL)` | no change | Bool, no unit |
| **SampleHold** | `value` | `canonicalType(FLOAT)` (none) | `inferType(FLOAT, unitVar('sh_U'))` | Preserves unit through latch |
| **SampleHold** | `out` | `canonicalType(FLOAT)` (none) | `inferType(FLOAT, unitVar('sh_U'))` | Same var as `value` |
| **SampleHold** | `trigger` | `canonicalEvent()` | no change | Event, different concept |

### Lens Blocks

| Block | Port | Old Unit | New Unit | Rationale |
|---|---|---|---|---|
| **Clamp** | `in,min,max,out` | `canonicalType(FLOAT)` | `inferType(FLOAT, unitVar('clamp_U'))` | All share unit |
| **Slew** | `in,out` | `canonicalType(FLOAT)` | `inferType(FLOAT, unitVar('slew_U'))` | Value path preserves unit |
| **Slew** | `rate` | `canonicalType(FLOAT, unitNone(), ..., contractClamp01())` | no change | Dimensionless rate |
| **StepQuantize** | `in,step,out` | `canonicalType(FLOAT)` | `inferType(FLOAT, unitVar('stepQ_U'))` | All share unit |
| **Deadzone** | `in,threshold,out` | `canonicalType(FLOAT)` | `inferType(FLOAT, unitVar('dz_U'))` | All share unit |
| **Mask** | `in,out` | `canonicalType(FLOAT)` | `inferType(FLOAT, unitVar('mask_U'))` | Value path preserves unit |
| **Mask** | `mask` | `canonicalType(FLOAT)` | no change | Dimensionless gate |
| **ScaleBias** | `in,bias,out` | `canonicalType(FLOAT)` | `inferType(FLOAT, unitVar('sb_U'))` | Additive bias shares unit |
| **ScaleBias** | `scale` | `canonicalType(FLOAT)` | no change | Dimensionless multiplier |
| **Smoothstep** | `in,edge0,edge1` | `canonicalType(FLOAT)` | `inferType(FLOAT, unitVar('ss_U'))` | Input domain shares unit |
| **Smoothstep** | `out` | `canonicalType(FLOAT)` | no change | Normalized 0-1 output |
| **Wrap01** | `in,out` | `canonicalType(FLOAT)` | `inferType(FLOAT, unitVar('w01_U'))` | Preserves unit |
| **NormalizeRange** | `in,min,max` | `canonicalType(FLOAT)` | `inferType(FLOAT, unitVar('nr_U'))` | Input domain shares unit |
| **NormalizeRange** | `out` | `canonicalType(FLOAT, ..., contractClamp01())` | no change | Normalized 0-1 output |
| **DenormalizeRange** | `min,max,out` | `canonicalType(FLOAT)` | `inferType(FLOAT, unitVar('dnr_U'))` | Output domain shares unit |
| **DenormalizeRange** | `in` | `canonicalType(FLOAT, ..., contractClamp01())` | no change | Normalized 0-1 input |

### Blocks NOT Changed (Already Correct)

| Block | Reason |
|---|---|
| Add, Subtract, Modulo | `unitBehavior: 'preserve'` auto-derives vars |
| Multiply, Divide, Sin, Cos, Expression | `requireUnitless` is correct |
| Const, DefaultSource, Broadcast, Reduce | Already use `payloadVar`/`unitVar` |
| Oscillator, Phasor | Explicit concrete units (angle:turns) |
| Adapter blocks | Explicit from/to units in adapterSpec |
| Color blocks | Explicit color units |
| Noise, Hash, Length, Normalize(math) | Intrinsically dimensionless |

## Solver Change

Added fallback in `compiler/frontend/payload-unit/solve.ts`: unresolved unit vars with no concrete evidence default to `unitNone()`. This mirrors the existing behavior for `requireUnitless` and ensures isolated polymorphic block chains compile without error.

## Test Coverage

- `src/__tests__/forbidden-patterns.test.ts`: `unitScalar` banned, `kind: 'scalar'` banned in UnitType contexts
- `src/core/__tests__/canonical-types.test.ts`: `defaultUnitForPayload(FLOAT)` returns none, `isValidPayloadUnit` validates float+none and float+angle
- `src/compiler/frontend/payload-unit/__tests__/unit-propagation.test.ts`: 7 integration tests verifying unit propagation through Lag, Clamp, ScaleBias, Smoothstep, NormalizeRange, DenormalizeRange, and default-to-none behavior
