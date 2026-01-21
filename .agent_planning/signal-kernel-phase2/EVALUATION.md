# Evaluation: Signal Kernel Phase 2

**Topic:** Signal Kernel Contract Refinements
**Source:** `.agent_planning/_future/6-signal-kernel.md`
**Generated:** 2026-01-21
**Verdict:** CONTINUE (2 sprints)

## Summary

The 6-signal-kernel.md recommendations propose tightening signal kernel contracts. Phase 1 (completed) renamed oscillators and documented layer contracts. This Phase 2 focuses on remaining refinements.

## What's Already Done (Phase 1)

| Recommendation | Status | Evidence |
|----------------|--------|----------|
| Rename `sin`→`oscSin`, `cos`→`oscCos`, `tan`→`oscTan` | ✅ COMPLETE | Lines 260-292 in SignalEvaluator.ts |
| Add deprecated legacy aliases | ✅ COMPLETE | Lines 284-292 with console.warn |
| Move generic math to opcodes | ✅ COMPLETE | abs/floor/ceil/round/fract/sqrt/exp/log/pow/min/max/clamp all in OpcodeInterpreter |
| Remove duplicate math from SignalEvaluator | ✅ COMPLETE | No abs/floor/ceil/etc. in current applySignalKernel |
| Layer contract documentation | ✅ COMPLETE | KERNEL-CONTRACTS.md exists |
| Keep smoothstep/step as shaping | ✅ COMPLETE | Lines 324-340 in SignalEvaluator.ts |
| Keep easing + noise kernels | ✅ COMPLETE | Lines 342-437 in SignalEvaluator.ts |

## What Remains (Phase 2)

### 1. Phase Wrapping for Oscillators
**Recommendation:** Add internal `wrapPhase()` to all oscillator kernels.
**Current State:** Only triangle/square/sawtooth use `% 1` wrapping. oscSin/oscCos/oscTan do NOT wrap.
**Gap:** Inconsistent - some wrap, some don't.

```typescript
// CURRENT (oscSin - NO wrap):
return Math.sin(values[0] * 2 * Math.PI);

// RECOMMENDED:
const p = wrapPhase(values[0]);  // p ∈ [0,1)
return Math.sin(p * 2 * Math.PI);
```

### 2. Input Clamping for Easing Functions
**Recommendation:** Clamp easing inputs to [0,1] internally.
**Current State:** Easing functions use raw `t = values[0]` without clamping.
**Gap:** Edge cases outside [0,1] may produce unexpected results.

```typescript
// CURRENT:
const t = values[0];
return t * t;

// RECOMMENDED:
const t = clamp01(values[0]);
return t * t;
```

### 3. Smoothstep Edge Case
**Recommendation:** Handle edge0 === edge1 explicitly.
**Current State:** Division by zero possible when edges are equal.
**Gap:** Undefined behavior.

```typescript
// RECOMMENDED:
if (edge0 === edge1) return x < edge0 ? 0 : 1;
```

### 4. Update Kernel Signatures
**Current State:** kernel-signatures.ts still has entries for deprecated `sin`, `cos`, `tan` (should be `oscSin`, etc.)
**Gap:** Signature registry outdated.

### 5. Helper Functions
**Recommendation:** Add `wrapPhase()`, `clamp01()`, `throwArity()` helpers.
**Current State:** Inline implementations, no shared helpers.
**Gap:** Code duplication, inconsistent error messages.

### 6. Consider Renaming Waveforms
**Recommendation:** Consider `oscTriangle`, `oscSquare`, `oscSawtooth` for consistency.
**Current State:** Named `triangle`, `square`, `sawtooth`.
**Gap:** Minor naming inconsistency (not blocking).

## Sprint Breakdown

### Sprint 1: Contract Hardening (HIGH confidence)
- Add wrapPhase() helper function
- Add clamp01() helper function  
- Apply wrapPhase to oscSin/oscCos/oscTan
- Apply clamp01 to all easing functions
- Fix smoothstep edge0===edge1 edge case

### Sprint 2: Cleanup (HIGH confidence)
- Update kernel-signatures.ts (sin→oscSin, cos→oscCos, tan→oscTan)
- Add oscSin/oscCos/oscTan to signatures
- Consider deprecation timeline for legacy sin/cos/tan aliases

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking behavior for inputs outside expected domain | Test with edge cases first |
| Existing patches rely on unwrapped oscillator behavior | Keep behavior identical for normalized inputs |

## Dependencies

None - Phase 1 is complete.

## Recommendation

Proceed with Sprint 1 (contract hardening). Minimal code changes, high impact on reliability.
