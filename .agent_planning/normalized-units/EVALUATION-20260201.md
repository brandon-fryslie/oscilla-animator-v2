# Evaluation: Normalized Units Implementation
Generated: 2026-02-01

## Verdict: CONTINUE

## Source
Design doc: `design-docs/_new/normalized-units.md`

## Summary

The design doc establishes a clear philosophy: normalize "glue signals" (phase, mix, masks, easings, normalizedIndex) to [0,1] and keep time/space/physics in natural units. The codebase already has the **type system infrastructure** to support this (`UnitType` with `norm01`, `phase01`, etc.) and has **adapter blocks** for conversions. What's missing is:

1. **Correct unit annotations on ~19 block ports** — mostly color block h/s/l/a parameters that use `unitScalar()` instead of `unitPhase01()` (hue) or `unitNorm01()` (saturation/lightness/alpha)
2. **5 missing lens/adapter blocks** from the design doc's recommended set (NormalizeRange, DenormalizeRange, Wrap01 standalone, Clamp01 standalone, Bipolar↔Unipolar)

## What Already Exists
- `UnitType` union: `none | scalar | norm01 | count | angle | time | space | color`
- Constructors: `unitNorm01()`, `unitPhase01()`, `unitScalar()`, etc.
- 11 adapter blocks in `src/blocks/adapter/`
- Adapter auto-insertion in `normalize-adapters.ts`
- Lens system (recently redesigned in Sprint 2)

## Gaps Found

### Port Unit Annotations (19 ports across 7 files)
| Category | Count | Files |
|----------|-------|-------|
| Hue → unitPhase01() | 4 | make-color-hsl, split-color-hsl, color-picker, hue-shift |
| S/L/A → unitNorm01() | 13 | make-color-hsl, split-color-hsl, color-picker, alpha-multiply, field-const-color |
| Smoothing → unitNorm01() | 1 | lag |
| Normalized index → unitNorm01() | 1 | array |

### Missing Adapter Blocks (5)
1. NormalizeRange(inMin, inMax) → [0,1]
2. DenormalizeRange(outMin, outMax) from [0,1]
3. Wrap01 standalone block
4. Clamp01 standalone block
5. Bipolar↔Unipolar conversions

## Risk Assessment
- **Low risk**: Port annotation changes are type metadata only — they don't change runtime behavior, but they DO affect adapter auto-insertion (edges between mismatched units will now get adapters inserted)
- **Medium risk**: New adapter blocks need to integrate with the adapter-spec system and normalize-adapters pass
- **Testing**: Need to verify that changing unit annotations doesn't break existing connections in test patches

## Dependencies
- Lens system redesign (Sprint 2) — COMPLETE
- Adapter-spec system — WORKING
- No blocking dependencies
