# Sprint: opcode-arity - Strict Arity Enforcement
Generated: 2026-01-21
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Enforce strict arity for all fixed-arity opcodes and simplify dispatch.

## Scope
**Deliverables:**
1. Strict arity enforcement for binary opcodes (sub, div, mod)
2. Strict arity enforcement for ternary opcodes (clamp, lerp)
3. Remove redundant fallback unary dispatch from applyNaryOp
4. Comprehensive arity error tests

## Work Items

### P0: Strict arity for binary opcodes
**Acceptance Criteria:**
- [ ] `sub(values)` throws if values.length !== 2
- [ ] `div(values)` throws if values.length !== 2
- [ ] `mod(values)` throws if values.length !== 2
- [ ] Error messages include opcode name and expected arity

**Technical Notes:**
- Use existing `expectArity()` function (line 82-86)
- Replace `values.length >= 2 ? ... : fallback` pattern with strict check

### P1: Strict arity for ternary opcodes
**Acceptance Criteria:**
- [ ] `clamp(values)` throws if values.length !== 3
- [ ] `lerp(values)` throws if values.length !== 3
- [ ] Consistent error message format with binary ops

**Technical Notes:**
- Same pattern as binary ops

### P2: Remove fallback unary dispatch
**Acceptance Criteria:**
- [ ] Lines 185-188 in applyNaryOp removed (the `if (values.length === 1)` branch)
- [ ] All dispatch routing happens in applyOpcode (lines 71-77)
- [ ] Unknown opcodes with wrong arity throw clear error

**Technical Notes:**
- This simplifies the dispatch logic
- applyOpcode already routes 1-arg calls to applyUnaryOp

### P3: Add arity enforcement tests
**Acceptance Criteria:**
- [ ] Tests for sub with 1 arg and 3+ args → expect throw
- [ ] Tests for div with 1 arg → expect throw
- [ ] Tests for mod with 1 arg → expect throw
- [ ] Tests for clamp with 2 args and 4+ args → expect throw
- [ ] Tests for lerp with 2 args and 4+ args → expect throw
- [ ] All tests verify error message contains "exactly N argument"

## Dependencies
- None - isolated module

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Caller uses fuzzy arity | Low | Run full test suite; grep callsites |
| hash opcode needs 1-arg form | Low | Keep optional seed default for now; revisit if needed |

## Estimated Effort
20-30 minutes total
