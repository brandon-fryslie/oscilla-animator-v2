# Evaluation: Opcode Interpreter Cleanup (Phase 2)
Generated: 2026-01-21

## Verdict: CONTINUE

The interpreter is architecturally sound and ~95% complete. Three specific fixes needed.

---

## 1. What Exists - Current Implementation Status

**✅ Present & Correct:**
- All 25 opcodes from spec are implemented
- Complete unary ops: neg, abs, sin, cos, tan, wrap01, floor, ceil, round, fract, sqrt, exp, log, sign
- Binary ops: sub, div, mod, pow, hash
- Ternary ops: clamp, lerp
- Variadic ops: add, mul, min, max
- `expectArity()` function exists (line 82-86)
- Clear header documentation with OPCODE REFERENCE (lines 1-62)
- Comprehensive test suite (96 tests covering all ops)
- Proper dispatch in `applyOpcode()` based on arity (line 71-77)

---

## 2. What's Missing - Spec vs Implementation Gap

### 🔴 CRITICAL ISSUES:

| Issue | Location | Severity | Impact |
|-------|----------|----------|--------|
| **Fuzzy arity enforcement** | Lines 147-166 | HIGH | `sub`, `div`, `mod`, `clamp`, `lerp` have fallback behavior instead of strict enforcement |
| **Fallback unary dispatch** | Lines 184-188 in `applyNaryOp` | MEDIUM | Violates spec: "Remove fallback unary from n-ary dispatch" |

### Details:

**A. Fuzzy Arity Issues (lines 147-166):**
```typescript
// CURRENT: Tolerates wrong arity
case 'sub':
  return values.length >= 2 ? values[0] - values[1] : -values[0];  // Silently negates if 1 arg
case 'div':
  return values.length >= 2 ? values[0] / values[1] : 1 / values[0];  // Inverts if 1 arg
case 'clamp':
  return values.length >= 3 ? ... : values[0];  // No-op if 2 args
case 'lerp':
  return values.length >= 3 ? ... : values[0];  // No-op if 2 args
```

**B. Fallback Unary in applyNaryOp (lines 184-188):**
- Redundant: `applyOpcode()` already routes 1-arg calls to `applyUnaryOp()`
- Creates two code paths for same operation
- Spec says: "Keep routing only in applyOpcode; remove fallback from applyNaryOp"

---

## 3. What Needs Changes

**File:** `src/runtime/OpcodeInterpreter.ts`

### Change 1: Strict arity for binary ops (lines 147-154)
```diff
case 'sub':
- return values.length >= 2 ? values[0] - values[1] : -values[0];
+ expectArity('sub', values.length, 2);
+ return values[0] - values[1];
```
(Same for div, mod)

### Change 2: Strict arity for ternary ops (lines 159-166)
```diff
case 'clamp':
- return values.length >= 3 ? ... : values[0];
+ expectArity('clamp', values.length, 3);
+ return Math.max(values[1], Math.min(values[2], values[0]));
```
(Same for lerp)

### Change 3: Remove fallback unary from applyNaryOp (lines 184-190)
```diff
default:
- if (values.length === 1) {
-   return applyUnaryOp(op, values[0]);
- }
  throw new Error(`OpCode ${op} not implemented for ${values.length} args`);
```

### Change 4: Add arity error tests
Add tests for:
- `sub(1)` → throw
- `div(1)` → throw
- `mod(1)` → throw
- `clamp(1,2)` → throw
- `lerp(1,2)` → throw

---

## 4. Dependencies & Risks

**Risk Level: LOW**

Potential callers:
- SignalEvaluator.ts
- Materializer.ts
- phase7-kernel-sanity.test.ts

All appear to use correct arity. Run `npm test` after changes.

---

## 5. Ambiguities

| Question | Answer |
|----------|--------|
| Is binary ops arity strictly 2? | YES (spec 4.2) |
| Should hash require 2 args? | YES - require explicit seed |

---

## Summary

| Dimension | Status |
|-----------|--------|
| Spec Coverage | ✅ 100% |
| Arity Enforcement | ❌ INCOMPLETE |
| Dispatch Simplicity | ❌ REDUNDANT |
| Test Coverage | ⚠️ PARTIAL |
| Risk of Changes | ✅ LOW |

**Total effort: 20–30 minutes. No blockers.**
