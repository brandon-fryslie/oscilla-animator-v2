# Definition of Done: opcode-arity Sprint
Generated: 2026-01-21

## Exit Criteria

All of the following must be true:

### 1. Binary Arity Enforcement
- [ ] `applyOpcode('sub', [5])` throws error containing "exactly 2 argument"
- [ ] `applyOpcode('sub', [5, 3, 1])` throws error containing "exactly 2 argument"
- [ ] `applyOpcode('div', [6])` throws error containing "exactly 2 argument"
- [ ] `applyOpcode('mod', [7])` throws error containing "exactly 2 argument"
- [ ] All binary ops with correct arity still work (existing tests pass)

### 2. Ternary Arity Enforcement
- [ ] `applyOpcode('clamp', [0.5, 0])` throws error containing "exactly 3 argument"
- [ ] `applyOpcode('clamp', [0.5, 0, 1, 2])` throws error containing "exactly 3 argument"
- [ ] `applyOpcode('lerp', [0, 10])` throws error containing "exactly 3 argument"
- [ ] `applyOpcode('lerp', [0, 10, 0.5, 1])` throws error containing "exactly 3 argument"
- [ ] All ternary ops with correct arity still work (existing tests pass)

### 3. Dispatch Simplification
- [ ] No `if (values.length === 1) { return applyUnaryOp(...) }` in applyNaryOp default case
- [ ] applyOpcode handles all 1-arg routing (line 73-74)
- [ ] Unknown opcode with wrong arity throws clear error

### 4. Test Coverage
- [ ] New test describe block: "OpcodeInterpreter - Strict Arity Enforcement"
- [ ] At least 10 new arity error test cases
- [ ] All 560+ existing tests still pass

### 5. No Regressions
- [ ] `npm test` passes with 0 failures
- [ ] No changes to SignalEvaluator.ts or Materializer.ts required

## Verification Command
```bash
npm test
```

## Files Changed
- `src/runtime/OpcodeInterpreter.ts` (lines 147-166, 184-190)
- `src/runtime/__tests__/OpcodeInterpreter.test.ts` (add ~30 lines)
