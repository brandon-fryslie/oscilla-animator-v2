# Research Findings: Unit Annotation System

**Date**: 2026-01-20
**Confidence**: HIGH (upgraded from MEDIUM)

## Unit Taxonomy (Final)

Based on kernel audit and intrinsic analysis:

| Unit | Range/Notes | Used By |
|------|-------------|---------|
| `phase` | [0, 1) cyclic | sin/cos/tan signal kernels, phaseA/phaseB rails, phase arithmetic |
| `radians` | [0, 2π) or unbounded | Field-level polar conversions (circleAngle, fieldPolarToCartesian) |
| `normalized` | [0, 1] clamped | normalizedIndex intrinsic, easing functions, opacity |
| `scalar` | Dimensionless float | sin/cos outputs, general arithmetic results |
| `ms` | Milliseconds | time rail (tMs) |
| `#` | Count/index (integer) | index intrinsic, array positions |
| `degrees` | [0, 360) | Future: user-facing angle inputs |
| `seconds` | Time in seconds | Future: user-facing time |

## Key Insights

1. **Phase vs Radians**: SignalEvaluator kernels (sin/cos/tan) expect PHASE [0,1) and convert internally to radians. Field-level kernels (polar, circular layout) work directly in radians. This is the primary unit mismatch we need to detect.

2. **No existing unit tracking**: Current system has NO unit safety. All numeric types are just 'float'. This causes bugs when phase is connected to radian-expecting inputs.

3. **Backwards compatibility critical**: We have ~20 blocks and many tests. Adding `unit?: NumericUnit` to CanonicalType must be non-breaking.

## Validation Scope Decision

**Chosen: Extend Pass 4 (wiring validation)**

Rationale:
- Pass 4 already validates edge type compatibility
- All types fully resolved by this point
- Clean separation: wiring validation is the natural place for unit checks
- No need for new pass

Implementation: Add `validateUnitCompatibility()` function called during edge validation.

## Auto-Conversion Decision

**Chosen: Explicit-only (warnings, no auto-insert)**

Rationale:
- Safer for gradual adoption
- Teaches users about unit system
- Avoids hidden conversions that may not be what user wants
- Can add auto-conversion later if needed (non-breaking change)

Behavior:
- Unit mismatch → emit warning diagnostic
- No unit annotation → no warning (backwards compatible)
- Matching units → no warning

## Kernel Signature Format

Store in new file `src/runtime/kernel-signatures.ts`:

```typescript
interface KernelSignature {
  inputs: Array<{ expectedUnit?: NumericUnit }>;
  output: { unit?: NumericUnit };
}

const KERNEL_SIGNATURES: Record<string, KernelSignature> = {
  sin: {
    inputs: [{ expectedUnit: 'phase' }],
    output: { unit: 'scalar' },
  },
  // ... etc
};
```

Kept separate from implementation for clarity and future extensibility (e.g., adding descriptions, validation rules).

## Implementation Strategy

1. Add `NumericUnit` type to canonical-types.ts
2. Extend `CanonicalType` with optional `unit` field
3. Create kernel-signatures.ts with kernel unit declarations
4. Add unit validation to Pass 4 wiring
5. Update select blocks to declare units (start with oscillator, time rails)
6. Write tests for unit mismatch detection

## Exit Criteria Met

- [x] Unit taxonomy documented
- [x] Kernel signature format defined
- [x] Validation insertion point chosen
- [x] Auto-conversion policy decided
- [x] All unknowns resolved

**Status**: Ready for implementation
