# Evaluation: Single Opcode Definition Table

**Topic:** Consolidate opcode definitions so both evaluators consume the same table
**Date:** 2026-02-06
**Verdict:** CONTINUE

## Summary

The proposal addresses a clear violation of the "SINGLE ENFORCER" architectural law. Currently, 26 opcodes are implemented twice:
1. **OpcodeInterpreter.ts** (lines 110-207) - The canonical implementation
2. **ValueExprMaterializer.ts:evaluatePureFn** (lines 400-447) - Duplicate implementation

SignalKernelLibrary.ts correctly delegates to OpcodeInterpreter, but ValueExprMaterializer has its own inline switch statement.

## Current State Analysis

### What Exists

**OpcodeInterpreter.ts** (CANONICAL - 207 lines)
- Well-documented header explaining it is the SINGLE ENFORCER
- Unary ops: neg, abs, sin, cos, tan, wrap01, floor, ceil, round, fract, sqrt, exp, log, sign
- N-ary ops: add, sub, mul, div, mod, min, max, clamp, lerp, pow, hash, select
- Proper arity validation via `expectArity()`
- Clean separation: `applyUnaryOp()` and `applyNaryOp()`

**SignalKernelLibrary.ts** (CLEAN - 88 lines)
- `applyPureFn()` correctly dispatches to `applyOpcode()` for 'opcode' kind
- Handles kernel, kernelResolved, expr, composed kinds
- No duplication

**ValueExprMaterializer.ts** (VIOLATION - 748 lines)
- Lines 400-447: `evaluatePureFn()` contains duplicate switch statement
- All 26 opcodes re-implemented inline
- Does NOT call OpcodeInterpreter

### Semantic Discrepancies Found

| Opcode | OpcodeInterpreter | ValueExprMaterializer | Difference |
|--------|-------------------|----------------------|------------|
| `add` | `reduce((a,b) => a+b, 0)` (variadic) | `args[0] + args[1]` (binary) | **Variadic vs binary** |
| `mul` | `reduce((a,b) => a*b, 1)` (variadic) | `args[0] * args[1]` (binary) | **Variadic vs binary** |
| `select` | `values[0] > 0 ? ...` | `args[0] ? ...` | **Numeric vs truthy** |
| `clamp` | `max(min, min(max, x))` | `min(max(x, min), max)` | Equivalent but different order |
| `lerp` | `a*(1-t) + b*t` | `a + (b-a)*t` | Mathematically equivalent |

## Risk Assessment

**LOW RISK** - This is a straightforward refactor:
1. Replace the duplicate switch statement with a call to `applyOpcode()`
2. The fix is a single function change (48 lines → ~5 lines)
3. Existing tests should catch any regressions
4. OpcodeInterpreter is already imported in ValueExprMaterializer (line 26)

## Confidence: HIGH

- Clear problem, clear solution
- No architectural decisions needed
- Single-file change with no structural impact
- Existing tests provide coverage

## Blockers

None identified.

## Recommendation

Proceed with implementation. This is a mechanical refactor that eliminates code duplication and enforces the architectural invariant.
