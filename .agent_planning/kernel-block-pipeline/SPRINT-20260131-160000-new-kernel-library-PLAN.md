# Sprint: new-kernel-library — New Kernel Library via Registry
Generated: 2026-01-31-160000 (Updated after review)
Confidence: HIGH: 1, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY (after Sprint 2+2.5 prerequisites)

## Sprint Goal
Build a minimal canonical kernel set through the new KernelRegistry. Add metadata-driven property tests that validate type invariants (not exact numerics). Everything not explicitly implemented fails via KernelNotFound.

## Scope
**Deliverables:**
1. Canonical kernel set with metadata (guaranteesFiniteForFiniteInputs, range, deterministic)
2. Metadata-driven property tests
3. Verify KernelNotFound enforcement

## Work Items

### WI-1: Implement canonical kernel set with metadata [HIGH]

**Minimal kernel set needed to render "something":**

**Oscillators** (phase [0,1) → output):
```typescript
registry.register({
  kind: 'scalar',
  id: 'oscSin' as KernelId,
  fn: (values) => Math.sin(wrapPhase(values[0]) * TAU),
  argCount: 1,
  purity: 'pure',
  guaranteesFiniteForFiniteInputs: true,
  range: { min: -1, max: 1 }
});

registry.register({
  kind: 'scalar',
  id: 'triangle' as KernelId,
  fn: triangleWave,
  argCount: 1,
  purity: 'pure',
  guaranteesFiniteForFiniteInputs: true,
  range: { min: -1, max: 1 }
});
```

**Shaping**:
```typescript
registry.register({
  kind: 'scalar',
  id: 'smoothstep' as KernelId,
  fn: (values) => { const t = clamp01(values[0]); return t*t*(3-2*t); },
  argCount: 1,
  purity: 'pure',
  guaranteesFiniteForFiniteInputs: true,
  range: { min: 0, max: 1 }
});

registry.register({
  kind: 'scalar',
  id: 'easeInOutCubic' as KernelId,
  fn: easeInOutCubicImpl,
  argCount: 1,
  purity: 'pure',
  guaranteesFiniteForFiniteInputs: true,
  range: { min: -0.1, max: 1.1 }  // Slight overshoot for elastic
});
```

**Combine**:
```typescript
registry.register({
  kind: 'scalar',
  id: 'combine_sum' as KernelId,
  fn: (values) => values.reduce((a,b) => a+b, 0),
  argCount: 'variadic',
  purity: 'pure',
  guaranteesFiniteForFiniteInputs: true
  // No range (unbounded)
});
```

**Layout** (field-level):
```typescript
registry.register({
  kind: 'zipSig',
  id: 'circleLayout' as KernelId,
  fn: circleLayoutImpl,
  signalArgCount: 3,  // radius, centerX, centerY
  purity: 'pure'
});
```

**Acceptance Criteria:**
- [ ] All kernels above registered with metadata
- [ ] Each kernel has dedicated unit test (input → expected output)
- [ ] A test patch compiles and renders using only registered kernels
- [ ] No hardcoded range assumptions in tests

**Technical Notes:**
- Metadata is KERNEL property, not global assumption
- If a kernel doesn't guarantee finiteness (e.g., `tan`, `divide`), set `guaranteesFiniteForFiniteInputs: false`
- If a kernel has unbounded range, omit `range` field

### WI-2: Metadata-driven property tests [MEDIUM]

**Test structure**:
```typescript
const registry = getDefaultRegistry();
const scalarKernels = registry.listAll().filter(k => k.kind === 'scalar');

describe('kernel type invariants', () => {
  describe.each(scalarKernels)('$id', (kernel) => {
    if (kernel.guaranteesFiniteForFiniteInputs) {
      it('produces finite output for bounded inputs', () => {
        const inputs = Array.from({ length: kernel.argCount === 'variadic' ? 3 : kernel.argCount },
          () => Math.random() * 2 - 1);
        const result = kernel.fn(inputs);
        expect(Number.isFinite(result)).toBe(true);
      });
    }

    if (kernel.range) {
      it(`output in [${kernel.range.min}, ${kernel.range.max}]`, () => {
        for (let i = 0; i < 100; i++) {
          const phase = Math.random();
          const result = kernel.fn([phase]);
          expect(result).toBeGreaterThanOrEqual(kernel.range.min);
          expect(result).toBeLessThanOrEqual(kernel.range.max);
        }
      });
    }

    if (kernel.purity === 'pure') {
      it('is deterministic', () => {
        const inputs = [0.5, 0.3, 0.7].slice(0, kernel.argCount === 'variadic' ? 3 : kernel.argCount);
        const r1 = kernel.fn(inputs);
        const r2 = kernel.fn(inputs);
        expect(r1).toBe(r2);
      });
    }
  });
});
```

**Acceptance Criteria:**
- [ ] Property tests parametrized over `registry.listAll()`
- [ ] Finiteness test only runs if `guaranteesFiniteForFiniteInputs` is true
- [ ] Range test only runs if `range` exists
- [ ] Determinism test only runs if `purity === 'pure'`
- [ ] Tests would catch a kernel with wrong metadata

**Technical Notes:**
- This is the correct pattern: metadata declares guarantees, tests validate them
- Do NOT hardcode "all kernels are finite" — some (like `tan`) are not

### WI-3: Verify KernelNotFound enforcement [MEDIUM]

**Test**:
```typescript
describe('missing kernel enforcement', () => {
  it('throws KernelNotFound for unregistered kernel', () => {
    const registry = new KernelRegistry();
    expect(() => registry.resolve('nonexistent' as KernelId))
      .toThrow(KernelNotFound);
  });

  it('includes kernel name in error message', () => {
    const registry = new KernelRegistry();
    try {
      registry.resolve('badKernel' as KernelId);
      fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(KernelNotFound);
      expect(e.message).toContain('badKernel');
    }
  });
});
```

**Acceptance Criteria:**
- [ ] Test for KernelNotFound on unknown kernel
- [ ] Error message includes kernel name for debugging
- [ ] No silent fallbacks in evaluation chain (verified by grep)

**Technical Notes:**
- This validates Sprint 2.5's enforcement: missing kernels fail at load, not runtime

## Dependencies
- Sprint 2 (kernel-registry) must be done (registry exists)
- Sprint 2.5 (kernel-validation) should be done (validates at load)

## Risks
- **Metadata accuracy**: If metadata is wrong, tests will pass but runtime will misbehave. Mitigation: Cross-check metadata against implementation during registration.
- **Layout kernel complexity**: Field-level kernels like circleLayout have complex signatures. May need special handling in property tests.
