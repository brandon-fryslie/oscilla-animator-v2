# Removed Blocks — 2026-01-31

Block library reduction to minimize migration surface area for the type system migration.
These blocks will be rewritten with improved kernels after the migration is complete.

## Removed from `field-operations-blocks.ts` (10 blocks)

| Block | Reason |
|-------|--------|
| `FieldPolarToCartesian` | Complex dual signal/field lowering with 4+ OpCodes and `fieldPolarToCartesian` kernel. Will rewrite with improved kernels. |
| `FieldCartesianToPolar` | Most complex lowering of any block (3 kernels: `vec3ExtractXY`, `cartesianToPolarSig`, `fieldCartesianToPolar`). Will rewrite. |
| `Pulse` | Dual path with 4+ OpCodes vs `fieldPulse` kernel. Specialized waveform shaping. |
| `GoldenAngle` | Dual path, `fieldGoldenAngle` kernel (marked deprecated in kernel inventory). |
| `AngularOffset` | Dual path, `fieldAngularOffset` kernel. |
| `RadiusSqrt` | Dual path, `fieldRadiusSqrt` kernel. |
| `JitterVec` | Dual path with 6 OpCodes vs `fieldJitterVec` kernel. Uses legacy `sigSlot` alias. |
| `HueFromPhase` | Dual path, `fieldHueFromPhase` kernel. |
| `SetZ` | Uses legacy `sigSlot` alias, `fieldSetZ` kernel. |
| `Mod` | Duplicate of `Modulo` in math-blocks.ts (both do modulo, cardinality-generic). |

**Kept in file:** `FromDomainId`, `Sin`, `Cos` (low migration friction, thin OpCode wrappers).

## Removed from `color-blocks.ts` (4 blocks)

| Block | Reason |
|-------|--------|
| `ColorLFO` | Compound convenience block embedding oscillator logic + `hsvToRgb` kernel. |
| `HSVToColor` | Signal-only variant; redundant with the cardinality-generic `HsvToRgb`. |
| `HsvToRgb` | `kernelZipSig` with `hsvToRgb` kernel. Will rewrite with improved kernels. |
| `ApplyOpacity` | `kernelZipSig` with `perElementOpacity` kernel. Will rewrite. |

**File is now empty** (stub with removal note). `ConstColor` was previously removed.

## Removed from `geometry-blocks.ts` (2 blocks)

| Block | Reason |
|-------|--------|
| `PolarToCartesian` | Duplicate of `FieldPolarToCartesian`. Uses legacy `sigSlot` alias. Slated for rewrite. |
| `OffsetVec` | Duplicate of `JitterVec` (same `fieldJitterVec` kernel). Uses legacy `sigSlot` alias. |

**File is now empty** (stub with removal note).

## Removed from `instance-blocks.ts` (4 blocks)

| Block | Reason |
|-------|--------|
| `GridLayout` | Superseded by `GridLayoutUV` (gauge-invariant UV placement basis). |
| `LinearLayout` | Superseded by `LineLayoutUV`. |
| `CircleLayout` | Superseded by `CircleLayoutUV`. |
| `LineLayout` | Superseded by `LineLayoutUV`. Duplicate of `LinearLayout` (both call `lineLayout` kernel). |

**Kept in file:** `CircleLayoutUV`, `LineLayoutUV`, `GridLayoutUV` (UV-based gauge-invariant layouts).

## Summary

- **20 blocks removed** (10 field-ops, 4 color, 2 geometry, 4 legacy layouts)
- **~37 blocks remaining** — all with low migration friction
- Remaining blocks are thin wrappers around OpCodes or canonical IRBuilder methods
- Removed blocks had complex multi-kernel lowering or were duplicates/superseded

## Restoration Plan

After the type system migration is complete:
1. Write new, correct kernels based on the new type system
2. Rewrite block library using the new kernels
3. Color blocks, coordinate conversion, and specialized field operations will return as properly typed blocks
