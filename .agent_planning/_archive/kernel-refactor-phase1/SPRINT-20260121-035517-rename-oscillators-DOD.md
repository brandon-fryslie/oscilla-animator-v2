# Sprint: rename-oscillators - Definition of Done

**Generated:** 2026-01-21T03:55:17Z

## Acceptance Criteria

### P0: Kernel Names Updated in SignalEvaluator.ts

- [ ] `applySignalKernel('oscSin', [0.25])` returns `1` (sin at π/2)
- [ ] `applySignalKernel('oscCos', [0])` returns `1` (cos at 0)
- [ ] `applySignalKernel('oscTan', [0])` returns `0` (tan at 0)
- [ ] Old names `sin`/`cos`/`tan` either throw or emit deprecation warning

### P1: Comments Updated

- [ ] Comments at lines 210-213 reference `oscSin` not `sin`
- [ ] Comments at lines 218-219 reference `oscCos` not `cos`
- [ ] Comments at line 227 reference `oscTan` not `tan`

### P2: IR Builder Updated

- [ ] No occurrences of `{ kind: 'kernel', name: 'sin' }` in compiler/ (grep returns empty)
- [ ] All references use `{ kind: 'kernel', name: 'oscSin' }` instead

### P3: Blocks Updated

- [ ] Oscillator blocks emit `oscSin`/`oscCos`/`oscTan` kernel references
- [ ] All patches using oscillator blocks still work

### P4: Backward Compatibility (if implemented)

- [ ] Old kernel names produce deprecation warning in console
- [ ] Old kernel names still produce correct output (fallback to new names)

### Verification

```bash
# Verify no stale references
grep -rn "'sin'" --include="*.ts" src/ | grep -v "oscSin" | grep "kernel"
grep -rn "'cos'" --include="*.ts" src/ | grep -v "oscCos" | grep "kernel"
grep -rn "'tan'" --include="*.ts" src/ | grep -v "oscTan" | grep "kernel"

# Should return no matches (or only the deprecated shims)

# Run type check
npx tsc --noEmit

# Run tests
npm test
```
