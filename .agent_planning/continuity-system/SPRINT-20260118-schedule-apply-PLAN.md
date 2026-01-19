# Sprint: schedule-apply - Schedule Integration & Apply

> **Generated**: 2026-01-18
> **Confidence**: HIGH
> **Status**: READY FOR IMPLEMENTATION
> **Depends On**: identity-foundation, state-mapping

---

## Sprint Goal

Integrate continuity into the execution schedule with explicit step types and implement the gauge/slew application logic that produces smooth transitions.

---

## Scope

### Deliverables
1. New `Step` types: `StepContinuityMapBuild`, `StepContinuityApply`
2. Schedule pass modifications to emit continuity steps
3. Continuity default policies
4. `applyContinuity()` implementation with gauge and slew
5. Integration tests for end-to-end continuity

---

## Work Items

### P0: Define New Step Types

**File**: `src/compiler/ir/types.ts`

**Changes**:
```typescript
// Add to Step union

/**
 * Step to build element mapping when domain changes (spec §5.1).
 * Executed rarely (only at hot-swap boundaries).
 */
export interface StepContinuityMapBuild {
  readonly kind: 'continuityMapBuild';
  readonly instanceId: string;  // InstanceId
  readonly outputMapping: string;  // Key to store mapping result
}

/**
 * Step to apply continuity policy to a field target (spec §5.1).
 * Executed per-frame for targets with policy != none.
 */
export interface StepContinuityApply {
  readonly kind: 'continuityApply';
  readonly targetKey: string;  // StableTargetId
  readonly instanceId: string;  // InstanceId
  readonly policy: ContinuityPolicy;
  readonly baseSlot: ValueSlot;
  readonly outputSlot: ValueSlot;
  readonly semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom';
}

// Update Step union
export type Step =
  | StepEvalSig
  | StepMaterialize
  | StepRender
  | StepStateWrite
  | StepContinuityMapBuild
  | StepContinuityApply;
```

**Acceptance Criteria**:
- [ ] `StepContinuityMapBuild` interface defined
- [ ] `StepContinuityApply` interface defined with all required fields
- [ ] `Step` union includes both new types
- [ ] `npm run typecheck` passes

---

### P0: Implement Continuity Defaults

**File**: `src/runtime/ContinuityDefaults.ts` (NEW)

**Implementation**:
```typescript
/**
 * Canonical default continuity policies (spec §2.3).
 * These are engine-wide defaults when no UI override exists.
 */

import type { ContinuityPolicy } from '../compiler/ir/types';

export const CANONICAL_CONTINUITY_POLICIES: Record<string, ContinuityPolicy> = {
  position: { kind: 'project', projector: 'byId', post: 'slew', tauMs: 120 },
  radius: { kind: 'slew', gauge: { kind: 'add' }, tauMs: 120 },
  opacity: { kind: 'slew', gauge: { kind: 'add' }, tauMs: 80 },
  color: { kind: 'slew', gauge: { kind: 'add' }, tauMs: 150 },
  custom: { kind: 'crossfade', windowMs: 150, curve: 'smoothstep' },
};

/**
 * Get continuity policy for a semantic role (spec §2.3).
 */
export function getPolicyForSemantic(
  semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom'
): ContinuityPolicy {
  return CANONICAL_CONTINUITY_POLICIES[semantic] ?? CANONICAL_CONTINUITY_POLICIES.custom;
}
```

**Acceptance Criteria**:
- [ ] All canonical policies defined per spec §2.3
- [ ] `getPolicyForSemantic()` returns correct policy
- [ ] TypeScript types align with ContinuityPolicy

---

### P0: Implement Continuity Application

**File**: `src/runtime/ContinuityApply.ts` (NEW)

**Implementation**:
```typescript
/**
 * Continuity Application Module
 *
 * Implements gauge and slew filters from spec §2.5 and §4.1.
 */

import type { ContinuityPolicy, StepContinuityApply } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import type { MappingState, StableTargetId } from './ContinuityState';
import { getOrCreateTargetState } from './ContinuityState';

/**
 * Apply additive gauge: x_eff = x_base + Δ (spec §2.5)
 */
export function applyAdditiveGauge(
  baseBuffer: Float32Array,
  gaugeBuffer: Float32Array,
  outputBuffer: Float32Array,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    outputBuffer[i] = baseBuffer[i] + gaugeBuffer[i];
  }
}

/**
 * First-order low-pass slew filter (spec §4.1).
 *
 * y[i] = y[i] + α * (target[i] - y[i])
 * where α = 1 - exp(-dt / tau)
 */
export function applySlewFilter(
  targetBuffer: Float32Array,
  slewBuffer: Float32Array,
  outputBuffer: Float32Array,
  tauMs: number,
  dtMs: number,
  count: number
): void {
  // Compute alpha (time-based blend factor)
  const alpha = 1 - Math.exp(-dtMs / tauMs);

  for (let i = 0; i < count; i++) {
    const y = slewBuffer[i];
    const target = targetBuffer[i];
    const newY = y + alpha * (target - y);
    slewBuffer[i] = newY;
    outputBuffer[i] = newY;
  }
}

/**
 * Initialize gauge buffer on domain change (spec §2.5).
 * Preserves effective value for mapped elements.
 * New elements start at base value (Δ = 0).
 */
export function initializeGaugeOnDomainChange(
  oldEffective: Float32Array | null,
  newBase: Float32Array,
  gaugeBuffer: Float32Array,
  mapping: MappingState | null,
  count: number
): void {
  if (!oldEffective || !mapping) {
    // No previous state - all elements start at base
    gaugeBuffer.fill(0);
    return;
  }

  if (mapping.kind === 'identity') {
    // Same indices - preserve Δ so x_eff stays continuous
    for (let i = 0; i < count; i++) {
      gaugeBuffer[i] = oldEffective[i] - newBase[i];
    }
  } else if (mapping.kind === 'byId' || mapping.kind === 'byPosition') {
    // Mapped indices
    for (let i = 0; i < count; i++) {
      const oldIdx = mapping.newToOld[i];
      if (oldIdx >= 0 && oldIdx < oldEffective.length) {
        // Mapped element: preserve effective value
        gaugeBuffer[i] = oldEffective[oldIdx] - newBase[i];
      } else {
        // New element: start at base (no jump)
        gaugeBuffer[i] = 0;
      }
    }
  }
}

/**
 * Initialize slew buffer - start at current value.
 */
export function initializeSlewBuffer(
  currentBuffer: Float32Array,
  slewBuffer: Float32Array,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    slewBuffer[i] = currentBuffer[i];
  }
}

/**
 * Apply continuity policy to a field target (spec §5.1).
 * Called per-frame for targets with policy != none.
 */
export function applyContinuity(
  step: StepContinuityApply,
  state: RuntimeState,
  getBuffer: (slot: ValueSlot) => Float32Array
): void {
  const { targetKey, instanceId, policy, baseSlot, outputSlot } = step;
  const targetId = targetKey as StableTargetId;

  // Get current base buffer
  const baseBuffer = getBuffer(baseSlot);
  const count = baseBuffer.length;

  // Get or create continuity state for this target
  const targetState = getOrCreateTargetState(state.continuity, targetId, count);

  // Compute dt for slew
  const tModelMs = state.time?.tMs ?? 0;
  const dtMs = Math.max(0, tModelMs - state.continuity.lastTModelMs);

  // Get mapping if domain changed
  const mapping = state.continuity.mappings.get(instanceId) ?? null;

  // Handle domain change - reinitialize gauge
  if (state.continuity.domainChangeThisFrame) {
    const oldEffective = targetState.slewBuffer.length > 0
      ? new Float32Array(targetState.slewBuffer)  // Copy before modification
      : null;
    initializeGaugeOnDomainChange(
      oldEffective,
      baseBuffer,
      targetState.gaugeBuffer,
      mapping,
      count
    );
    initializeSlewBuffer(baseBuffer, targetState.slewBuffer, count);
  }

  // Get output buffer (may be same as base for in-place)
  const outputBuffer = baseSlot === outputSlot ? baseBuffer : getBuffer(outputSlot);

  // Apply policy
  switch (policy.kind) {
    case 'none':
      // Pass through unchanged
      if (outputBuffer !== baseBuffer) {
        outputBuffer.set(baseBuffer);
      }
      break;

    case 'preserve':
      // Apply gauge only (hard continuity)
      applyAdditiveGauge(
        baseBuffer,
        targetState.gaugeBuffer,
        outputBuffer,
        count
      );
      break;

    case 'slew':
      // Slew toward base value
      applySlewFilter(
        baseBuffer,
        targetState.slewBuffer,
        outputBuffer,
        policy.tauMs,
        dtMs,
        count
      );
      break;

    case 'project':
      // Apply gauge then slew (for position)
      applyAdditiveGauge(
        baseBuffer,
        targetState.gaugeBuffer,
        outputBuffer,
        count
      );
      applySlewFilter(
        outputBuffer,
        targetState.slewBuffer,
        outputBuffer,
        policy.tauMs,
        dtMs,
        count
      );
      break;

    case 'crossfade':
      // TODO: Implement crossfade for unmappable cases
      // For now, pass through
      if (outputBuffer !== baseBuffer) {
        outputBuffer.set(baseBuffer);
      }
      break;
  }
}

/**
 * End-of-frame cleanup (spec §5.1).
 */
export function finalizeContinuityFrame(state: RuntimeState): void {
  state.continuity.lastTModelMs = state.time?.tMs ?? 0;
  state.continuity.domainChangeThisFrame = false;
}
```

**Acceptance Criteria**:
- [ ] `applyAdditiveGauge()` implements x_eff = x_base + Δ
- [ ] `applySlewFilter()` uses correct exponential formula
- [ ] Alpha calculation matches spec (1 - exp(-dt/tau))
- [ ] `initializeGaugeOnDomainChange()` preserves effective values
- [ ] New elements start at base value (Δ = 0, no jump)
- [ ] Mapped elements preserve their effective value
- [ ] `applyContinuity()` dispatches all policy types

---

### P1: Update Schedule Pass

**File**: `src/compiler/passes-v2/pass7-schedule.ts`

**Changes**:
Add continuity step emission after materialize steps:

```typescript
// In schedule generation, after materialize steps

function emitContinuitySteps(
  instances: Map<InstanceId, InstanceDecl>,
  materializeSteps: StepMaterialize[]
): Step[] {
  const steps: Step[] = [];

  // Emit map build for each stable instance
  for (const [id, decl] of instances) {
    if (decl.identityMode === 'stable') {
      steps.push({
        kind: 'continuityMapBuild',
        instanceId: id,
        outputMapping: `mapping:${id}`,
      });
    }
  }

  // Emit apply for each continuity target
  // (This requires semantic info from materialization - may need IR enhancement)
  // For MVP: emit for known semantics like position, color, radius

  return steps;
}
```

**Acceptance Criteria**:
- [ ] Schedule includes continuity steps in correct order
- [ ] Map build steps emitted for stable instances
- [ ] Apply steps emitted for continuity targets
- [ ] Schedule order: evalSig → materialize → continuityMapBuild → continuityApply → render

---

### P1: Update Schedule Executor

**File**: `src/runtime/ScheduleExecutor.ts`

**Changes**:
Add execution handlers for continuity steps:

```typescript
case 'continuityMapBuild': {
  // Get current domain instance (from materialization)
  const newDomain = materializeDomainInstance(step.instanceId, state);
  const { changed, mapping } = detectDomainChange(
    step.instanceId,
    newDomain,
    state.continuity.prevDomains
  );

  if (changed) {
    if (mapping) {
      state.continuity.mappings.set(step.instanceId, mapping);
    }
    state.continuity.prevDomains.set(step.instanceId, newDomain);
    state.continuity.domainChangeThisFrame = true;
  }
  break;
}

case 'continuityApply': {
  applyContinuity(step, state, (slot) => getBufferForSlot(slot, state));
  break;
}
```

**Acceptance Criteria**:
- [ ] `continuityMapBuild` step executes correctly
- [ ] `continuityApply` step executes correctly
- [ ] Map build only runs when domain changes
- [ ] Apply runs every frame for non-none policies

---

### P2: Integration Tests

**File**: `src/compiler/__tests__/continuity-integration.test.ts` (NEW)

**Test Cases**:
```typescript
describe('Continuity System Integration', () => {
  it('preserves instance identity across count change', () => {
    // Create patch: Const(10) → Array → Render
    // Compile, execute frame
    // Change: Const(11)
    // Recompile, execute frame
    // Verify: instances 0-9 have same effective values
    // Verify: instance 10 starts at base
  });

  it('slew converges to target value', () => {
    // Set up continuity target with slew policy
    // Run multiple frames
    // Verify exponential convergence
  });

  it('gauge preserves effective value across discontinuity', () => {
    // Set up continuity target
    // Trigger domain change
    // Verify effective value unchanged for mapped elements
  });

  it('produces identical output for export and playback', () => {
    // Run live playback with discontinuity
    // Run export with same seed/time
    // Compare outputs - must be bit-identical (I31)
  });
});
```

**Acceptance Criteria**:
- [ ] Identity preservation test passes
- [ ] Slew convergence test passes
- [ ] Gauge preservation test passes
- [ ] Export parity test passes (I31)

---

### P2: Unit Tests for Apply

**File**: `src/runtime/__tests__/ContinuityApply.test.ts` (NEW)

**Test Cases**:
```typescript
describe('ContinuityApply', () => {
  describe('applySlewFilter', () => {
    it('converges exponentially', () => {
      const target = new Float32Array([1.0]);
      const slew = new Float32Array([0.0]);
      const output = new Float32Array(1);

      // After tau ms, should be ~63% of the way
      applySlewFilter(target, slew, output, 100, 100, 1);
      expect(output[0]).toBeCloseTo(0.632, 2);
    });

    it('reaches target after many time constants', () => {
      const target = new Float32Array([1.0]);
      const slew = new Float32Array([0.0]);
      const output = new Float32Array(1);

      // After 5 tau, should be ~99.3% there
      for (let i = 0; i < 5; i++) {
        applySlewFilter(target, slew, output, 100, 100, 1);
      }
      expect(output[0]).toBeCloseTo(0.993, 2);
    });
  });

  describe('initializeGaugeOnDomainChange', () => {
    it('preserves effective value for mapped elements', () => {
      const oldEff = new Float32Array([10, 20, 30]);
      const newBase = new Float32Array([5, 15, 25, 0]);
      const gauge = new Float32Array(4);
      const mapping: MappingState = {
        kind: 'byId',
        newToOld: new Int32Array([0, 1, 2, -1])
      };

      initializeGaugeOnDomainChange(oldEff, newBase, gauge, mapping, 4);

      // Mapped elements: Δ = old_eff - new_base
      expect(gauge[0]).toBe(5);   // 10 - 5
      expect(gauge[1]).toBe(5);   // 20 - 15
      expect(gauge[2]).toBe(5);   // 30 - 25
      // New element: Δ = 0
      expect(gauge[3]).toBe(0);
    });

    it('sets all zeros when no previous state', () => {
      const newBase = new Float32Array([1, 2, 3]);
      const gauge = new Float32Array(3);

      initializeGaugeOnDomainChange(null, newBase, gauge, null, 3);

      expect(gauge[0]).toBe(0);
      expect(gauge[1]).toBe(0);
      expect(gauge[2]).toBe(0);
    });
  });
});
```

**Acceptance Criteria**:
- [ ] Slew convergence tests pass
- [ ] Gauge initialization tests pass
- [ ] All edge cases covered

---

## Dependencies

- **identity-foundation** - DomainInstance type, InstanceDecl with identityMode
- **state-mapping** - ContinuityState, MappingState, mapping algorithms

---

## Risks

| Risk | Mitigation |
|------|------------|
| Schedule ordering complexity | Well-defined phase order per spec §5.1 |
| Performance of per-frame apply | Vectorized loops, allocation-free |
| Crossfade not implemented | Fallback to passthrough, document as TODO |

---

## Technical Notes

### Spec References
- §2.5: Additive gauge (x_eff = x_base + Δ)
- §4.1: First-order low-pass filter (slew)
- §4.2: Canonical time constants
- §5.1: Where continuity runs (StepContinuityMapBuild, StepContinuityApply)

### Schedule Phase Order

Per spec §5.1:
1. `evalSig` steps (signal computation)
2. `materialize` steps (field computation)
3. `continuityMapBuild` steps (rare - only on domain change)
4. `continuityApply` steps (per-frame for continuity targets)
5. `render` steps (output to renderer)
6. `stateWrite` steps (persist state)

### Export Parity (I31)

Export uses the exact same schedule. The `applyContinuity()` function operates identically in both live and export modes because it uses only `t_model_ms` (not wall time or frame index).
