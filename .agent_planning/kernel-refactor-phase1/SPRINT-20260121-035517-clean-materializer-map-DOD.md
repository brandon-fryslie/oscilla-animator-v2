# Sprint: clean-materializer-map - Definition of Done

**Generated:** 2026-01-21T03:55:17Z

## Acceptance Criteria

### P0: applyMap Simplified to Opcodes-Only

- [ ] Calling map with `{ kind: 'kernel', name: 'sqrt' }` throws error
- [ ] Calling map with `{ kind: 'opcode', opcode: 'sqrt' }` works correctly
- [ ] Error message mentions "Map only supports opcodes, not kernels"

### P1: fieldGoldenAngle Moved to applyKernel

- [ ] `applyKernel(out, [id01Arr], 'fieldGoldenAngle', N, type)` produces golden angle values
- [ ] Output values are `id01 * 50 * goldenAngle` (where goldenAngle ≈ 2.39996)
- [ ] Throws error if inputs.length !== 1

### P2: IR Uses Opcode Path for Math

```bash
# Should return no matches for kernel math in map context:
grep -rn "kind: 'map'" --include="*.ts" src/compiler/ | grep "'sqrt'\|'floor'\|'ceil'\|'round'"
```

### P3: Materializer Header Comment Updated

- [ ] Lines 1-30+ contain full layer contract
- [ ] Lists all field kernels in registry
- [ ] States "coord-space agnostic" for field kernels

### Verification

```bash
# Type check
npx tsc --noEmit

# Grep for old kernel cases in applyMap
grep -A5 "case 'sqrt':\|case 'floor':\|case 'ceil':\|case 'round':" src/runtime/Materializer.ts
# Should return NO matches (these cases removed)

# Verify fieldGoldenAngle is in applyKernel
grep -n "fieldGoldenAngle" src/runtime/Materializer.ts
# Should show it in applyKernel function, NOT in applyMap

# Run tests
npm test
```
