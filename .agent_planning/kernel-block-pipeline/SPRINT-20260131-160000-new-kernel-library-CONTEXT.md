# Implementation Context: new-kernel-library
Generated: 2026-01-31-160000

## Key Files

### Must Read
- `src/runtime/kernels/KernelRegistry.ts` — From Sprint 2
- `src/runtime/kernels/defaultRegistry.ts` — From Sprint 2
- `src/runtime/SignalKernelLibrary.ts` — Existing kernel implementations
- `src/runtime/FieldKernels.ts` — Existing field kernel implementations
- `src/runtime/__tests__/phase7-kernel-sanity.test.ts` — Existing kernel tests

### Must Create
- `src/runtime/kernels/__tests__/kernel-properties.test.ts` — Property tests

## Property Test Pattern

```typescript
import { getDefaultRegistry } from '../defaultRegistry';

const registry = getDefaultRegistry();
const allKernels = registry.listAll();
const scalarKernels = allKernels.filter(k => registry.hasScalar(k.id));

describe('kernel type invariants', () => {
  describe.each(scalarKernels)('$id', (kernel) => {
    it('produces finite output for bounded inputs', () => {
      const inputs = Array.from({ length: kernel.argCount === 'variadic' ? 3 : kernel.argCount },
        () => Math.random() * 2 - 1);
      const result = registry.getScalar(kernel.id)(inputs);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('is deterministic', () => {
      const inputs = [0.5, 0.3, 0.7].slice(0, kernel.argCount === 'variadic' ? 3 : kernel.argCount);
      const r1 = registry.getScalar(kernel.id)(inputs);
      const r2 = registry.getScalar(kernel.id)(inputs);
      expect(r1).toBe(r2);
    });
  });

  describe.each(oscillatorKernels)('$id range', (kernel) => {
    it('output in [-1, 1] for phase input [0, 1)', () => {
      for (let phase = 0; phase < 1; phase += 0.01) {
        const result = registry.getScalar(kernel.id)([phase]);
        expect(result).toBeGreaterThanOrEqual(-1);
        expect(result).toBeLessThanOrEqual(1);
      }
    });
  });

  describe.each(easingKernels)('$id range', (kernel) => {
    it('output in [0, 1] for t input [0, 1]', () => {
      for (let t = 0; t <= 1; t += 0.01) {
        const result = registry.getScalar(kernel.id)([t]);
        expect(result).toBeGreaterThanOrEqual(-0.1); // elastic may slightly undershoot
        expect(result).toBeLessThanOrEqual(1.1);      // elastic may slightly overshoot
      }
    });
  });
});
```

## Canonical Kernel Set — Implementation Source

All implementations already exist. This sprint just registers them:

| Kernel | Current Implementation | Lines |
|--------|----------------------|-------|
| oscSin | SignalKernelLibrary.ts | `Math.sin(wrapPhase(phase) * TAU)` |
| triangle | SignalKernelLibrary.ts | piecewise linear |
| sawtooth | SignalKernelLibrary.ts | `2 * wrapPhase(phase) - 1` |
| square | SignalKernelLibrary.ts | `wrapPhase(phase) < 0.5 ? 1 : -1` |
| smoothstep | SignalKernelLibrary.ts | `t*t*(3 - 2*t)` |
| easeInOutCubic | SignalKernelLibrary.ts | piecewise cubic |
| combine_sum | SignalKernelLibrary.ts | `values.reduce((a,b) => a+b, 0)` |
| combine_average | SignalKernelLibrary.ts | sum / length |
| circleLayout | FieldKernels.ts | cos/sin * radius + center |
| lineLayout | FieldKernels.ts | lerp between endpoints |

No new math needed. Just registration and testing.
