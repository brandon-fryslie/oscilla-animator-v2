# Sprint: remove-duplicate-math - Definition of Done

**Generated:** 2026-01-21T03:55:17Z

## Acceptance Criteria

### P0: Duplicate Kernels Removed

- [ ] `applySignalKernel('abs', [1])` throws `Unknown signal kernel: abs`
- [ ] `applySignalKernel('floor', [1])` throws `Unknown signal kernel: floor`
- [ ] `applySignalKernel('sqrt', [1])` throws `Unknown signal kernel: sqrt`
- [ ] `applySignalKernel('pow', [2, 3])` throws `Unknown signal kernel: pow`
- [ ] `applySignalKernel('min', [1, 2])` throws `Unknown signal kernel: min`
- [ ] `applySignalKernel('max', [1, 2])` throws `Unknown signal kernel: max`
- [ ] `applySignalKernel('clamp', [0.5, 0, 1])` throws `Unknown signal kernel: clamp`
- [ ] `applySignalKernel('mix', [0, 1, 0.5])` throws `Unknown signal kernel: mix`
- [ ] `applySignalKernel('sign', [-1])` throws `Unknown signal kernel: sign`

### P1: Domain-Specific Kernels Still Work

- [ ] `applySignalKernel('oscSin', [0.25])` returns `1` (sin at π/2)
- [ ] `applySignalKernel('triangle', [0.25])` returns `0`
- [ ] `applySignalKernel('easeInQuad', [0.5])` returns `0.25`
- [ ] `applySignalKernel('smoothstep', [0, 1, 0.5])` returns `0.5`
- [ ] `applySignalKernel('step', [0.5, 0.6])` returns `1`
- [ ] `applySignalKernel('noise', [42])` returns deterministic value in [0,1)

### P2: Header Comment Updated

- [ ] Lines 1-30 contain clear layer contract
- [ ] No mention of abs/floor/sqrt/etc. as valid signal kernels
- [ ] Categories listed: oscillators, easing, shaping, noise

### P3: No Stale IR References

```bash
# Should return no matches:
grep -rn "kind: 'kernel'" --include="*.ts" src/compiler/ | grep -E "'abs'|'floor'|'ceil'|'round'|'sqrt'|'exp'|'log'|'pow'|'min'|'max'|'clamp'|'mix'|'fract'|'sign'"
```

### Verification

```bash
# Type check
npx tsc --noEmit

# Test suite
npm test

# Manual verification: removed kernels should not appear in switch statement
grep -n "case 'abs':\|case 'floor':\|case 'sqrt':" src/runtime/SignalEvaluator.ts
# Should return no matches
```
