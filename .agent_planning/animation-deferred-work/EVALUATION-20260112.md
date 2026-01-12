# Animation Deferred Work Evaluation

**Date**: 2026-01-12
**Status**: CONTINUE - Clear path to implementation

## Executive Summary

The animation system has working end-to-end rendering but contains multiple temporary hacks, missing kernel implementations, and incomplete compiler passes. The most critical gaps are signal-level kernel support (blocks Oscillator) and missing field kernels for geometry blocks.

## 1. Temporary Hacks & Hardcoded Values

### Pass 7 Schedule Construction (`pass7-schedule.ts`)
| Location | Issue | Severity |
|----------|-------|----------|
| Line 124-125 | MVP domain selection - hardcoded to use first domain only | Medium |

### Field Materializer (`Materializer.ts`)
| Location | Issue | Severity |
|----------|-------|----------|
| Line 322-323 | `fieldGoldenAngle` has hardcoded `turns = 50` | Medium |

### Schedule Executor (`ScheduleExecutor.ts`)
| Location | Issue | Severity |
|----------|-------|----------|
| Lines 168-188 | Signal/field detection heuristic uses array bounds | **High** |
| Line 187 | Hardcoded size fallback to 10 | Medium |

## 2. Deferred Work from Pass 7 DOD

Per `DOD-20260112.md`:
- ❌ `evalSig` step generation (currently inline in render)
- ❌ `materialize` step generation (render calls internally)
- ❌ `stateWrite` step generation (no stateful blocks tested)
- ❌ Multiple domain support (uses first domain only)

## 3. Missing Kernel Implementations

### CRITICAL - Signal-Level Kernels
These kernels are called from blocks but not implemented in SignalEvaluator:
- `sin`, `cos` - Used by Oscillator blocks (CRASH)
- Kernel dispatch throws: `PureFn kind kernel not implemented`

### CRITICAL - Field-Level Kernels (Not in Materializer)
- `circleLayout` - Circle block
- `circleAngle` - Circle block
- `offsetPosition` - OffsetPosition block
- `polarToCartesian` - Signal-level version (field version exists)
- `packRGBA` - Color packing

### Currently Implemented (Field Kernels)
- makeVec2, hsvToRgb, jitter2d, attract2d, fieldAngularOffset, fieldRadiusSqrt, fieldAdd, fieldPolarToCartesian, fieldPulse, fieldHueFromPhase, fieldJitter2D, applyOpacity, gridPos

### Currently Implemented (Opcodes)
- neg, abs, sin, cos, tan, wrap01, add, sub, mul, div, mod, min, max, clamp, lerp, hash

## 4. Runtime/Compiler Gaps

### Pass 8 Link Resolution - NOT IMPLEMENTED
- Location: `compile.ts` lines 151-155
- Status: Commented out with TODOs
- Impact: **CRITICAL** - Compilation pipeline incomplete

### createStubProgramIR - Temporary
- Location: `compile.ts:243-264`
- Status: Explicitly marked as stub
- Impact: **CRITICAL** - IR conversion not properly lowered

### SignalEvaluator kernel support
- Location: `SignalEvaluator.ts:161`
- Pattern: Throws on kernel functions
- Impact: **CRITICAL** - Oscillator blocks crash

## 5. Architecture Risks

1. **Kernel registration fragility** - String-based switch statements, no registry
2. **No compile-time kernel validation** - Discovery only at runtime
3. **IRBuilder bypass** - createStubProgramIR manually builds IR

## 6. Open Questions

1. Should signal/field kernels share a registry or be separate?
2. How to handle undefined kernels? (compile-time vs runtime)
3. What's the intended lifetime of createStubProgramIR?
4. Should multi-domain fail fast or silently use first?

## 7. Verdict

**CONTINUE** - The issues are well-defined and have clear implementation paths. Priority order:

1. **P0**: Signal kernel support (unblocks Oscillator)
2. **P1**: Missing field kernels (unblocks geometry blocks)
3. **P2**: Size type disambiguation (remove heuristic hack)
4. **P3**: Multi-domain support (remove MVP limitation)
5. **P4**: Pass 8 / IR linking (complete compiler pipeline)
