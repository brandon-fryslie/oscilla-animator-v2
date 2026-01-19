# PLAN: Continuity System Implementation

> **Status**: READY FOR IMPLEMENTATION
> **Created**: 2026-01-18
> **Spec Reference**: `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/11-continuity-system.md`
> **Research**: `.agent_planning/RESEARCH-identity-preservation-20260118.md`

---

## Executive Summary

This plan implements the **Continuity System** (Topic 11) from the canonical spec to enable instance identity preservation across domain count changes. This system prevents visual "jank" when parameters change and is the **complete and immutable foundation** for smooth animation continuity in Oscilla.

### The Problem

When `Const(10) → Const(11)`, Array blocks produce 11 instances instead of 10. Without identity preservation:
- All 11 instances are recreated fresh
- Animation state is lost
- Visual discontinuity ("pop") occurs

### The Solution

With the Continuity System:
- Instances 0-9 **preserve identity and state**
- Instance 10 is **created new** (starts at base value)
- Animation phase, positions, etc. do **not reset** for preserved instances

### Key Architectural Insight

**Both shapes AND array blocks are domain identity sources.** The concept of "domain identity" is separate from shape definitions. Any block that creates or multiplies elements (Array, Grid, etc.) participates in domain identity, as do shape-producing blocks.

---

## Relevant Invariants

| Invariant | Rule | Enforcement |
|-----------|------|-------------|
| **I2** | Gauge Invariance - effective values continuous across discontinuities | Phase offset, value reconciliation |
| **I3** | State Continuity with Stable IDs - StateIds enable migration | Copy, transform, or reset |
| **I11** | Stable Element Identity - domains provide stable element IDs | elementId arrays, not indices |
| **I30** | Continuity is Deterministic - uses t_model_ms only | No wall time, no frame index |
| **I31** | Export Matches Playback - same schedule/steps | No "simplified" export |

---

## Current State Analysis

### What Exists

| Component | Status | Location |
|-----------|--------|----------|
| InstanceDecl with count | ✅ Exists | `src/compiler/ir/types.ts:317-323` |
| Instance IDs (string) | ✅ Exists | `src/compiler/ir/Indices.ts` |
| BufferPool | ✅ Exists | `src/runtime/BufferPool.ts` |
| Materialization loop | ✅ Exists | `src/runtime/Materializer.ts` |
| TimeState with phase offsets | ✅ Exists | `src/runtime/timeResolution.ts:38-53` |
| Step types | ✅ Exists | `src/compiler/ir/types.ts:338-375` |

### Implementation Gaps

| Component | Status | Required By Spec |
|-----------|--------|------------------|
| DomainInstance.elementId | ❌ Missing | §3.1 |
| DomainInstance.identityMode | ❌ Missing | §3.1 |
| MappingState type | ❌ Missing | §3.3 |
| ContinuityState in RuntimeState | ❌ Missing | §5.1 |
| StepContinuityMapBuild | ❌ Missing | §5.1 |
| StepContinuityApply | ❌ Missing | §5.1 |
| Slew filter implementation | ❌ Missing | §4.1 |
| ContinuityPolicy system | ❌ Missing | §2.2 |

---

## Phase 1: Domain Identity Infrastructure (1.5 days)

**Goal**: All domain identity sources (shapes, array blocks) emit stable elementIds that persist across count changes.

### Task 1.1: Define DomainInstance Type

**File**: `src/compiler/ir/types.ts`

```typescript
/**
 * Runtime domain instance with identity information.
 * Used by continuity system for element mapping.
 */
export interface DomainInstance {
  /** Number of elements in this domain */
  readonly count: number;

  /** Stable element IDs - required when identityMode='stable' */
  readonly elementId: Uint32Array;

  /** Identity mode - 'stable' enables per-element continuity */
  readonly identityMode: 'stable' | 'none';

  /** Optional spatial hints for fallback position-based mapping */
  readonly posHintXY?: Float32Array;
}
```

### Task 1.2: Extend InstanceDecl

**File**: `src/compiler/ir/types.ts`

Update existing InstanceDecl:

```typescript
export interface InstanceDecl {
  readonly id: string;
  readonly domainType: string;
  readonly count: number | 'dynamic';
  readonly layout: LayoutSpec;
  readonly lifecycle: 'static' | 'dynamic' | 'pooled';

  // NEW: Identity specification
  readonly identityMode: 'stable' | 'none';
  readonly elementIdSeed?: number;  // For deterministic ID generation
}
```

### Task 1.3: Create DomainIdentity Module

**File**: `src/runtime/DomainIdentity.ts` (NEW)

```typescript
/**
 * Domain Identity Module
 *
 * Generates and manages stable element IDs for domain instances.
 * Both shapes and array blocks are domain identity sources.
 */

/**
 * Generate deterministic element IDs for a domain.
 * IDs are monotonic integers starting from seed.
 *
 * @param count - Number of elements
 * @param seed - Starting ID (default 0)
 * @returns Uint32Array of stable element IDs
 */
export function generateElementIds(
  count: number,
  seed: number = 0
): Uint32Array {
  const ids = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    ids[i] = seed + i;
  }
  return ids;
}

/**
 * Create a DomainInstance with stable identity.
 */
export function createStableDomainInstance(
  count: number,
  seed: number = 0,
  posHintXY?: Float32Array
): DomainInstance {
  return {
    count,
    elementId: generateElementIds(count, seed),
    identityMode: 'stable',
    posHintXY,
  };
}

/**
 * Create a DomainInstance without identity tracking.
 * Continuity will fall back to crossfade.
 */
export function createUnstableDomainInstance(
  count: number
): DomainInstance {
  return {
    count,
    elementId: new Uint32Array(0),  // Empty - no identity
    identityMode: 'none',
  };
}
```

### Task 1.4: Update Array Block

**File**: `src/blocks/array-blocks.ts`

Modify `lower` function to declare identity mode:

```typescript
// In ArrayBlock.lower():
const instanceId = ctx.b.createInstance(
  DOMAIN_CIRCLE,
  count,
  { kind: 'unordered' },
  'static',
  'stable'  // NEW: Enable identity tracking
);
```

### Task 1.5: Update Shape Blocks

**Files**: `src/blocks/shape-blocks.ts` (or equivalent)

All shape-producing blocks also declare identity:

```typescript
// Shapes are also domain identity sources
const instanceId = ctx.b.createInstance(
  domainType,
  count,
  layout,
  lifecycle,
  'stable'  // Shapes participate in identity
);
```

### Task 1.6: Update IRBuilder.createInstance

**File**: `src/compiler/ir/IRBuilderImpl.ts`

```typescript
createInstance(
  domainType: DomainTypeId,
  count: number,
  layout: LayoutSpec,
  lifecycle: 'static' | 'dynamic' | 'pooled' = 'static',
  identityMode: 'stable' | 'none' = 'stable'  // Default to stable
): InstanceId {
  const id = instanceId(`instance_${this.instances.size}`);
  this.instances.set(id, {
    id,
    domainType,
    count,
    layout,
    lifecycle,
    identityMode,  // NEW
  });
  return id;
}
```

### Acceptance Criteria

- [ ] `DomainInstance` type defined with all fields
- [ ] `InstanceDecl` includes `identityMode` field
- [ ] Array blocks produce `identityMode: 'stable'`
- [ ] Shape blocks produce `identityMode: 'stable'`
- [ ] `generateElementIds()` produces deterministic IDs
- [ ] IDs 0-9 remain stable when count goes 10→11
- [ ] `npm run typecheck` passes
- [ ] Unit test: ElementId generation for various counts

---

## Phase 2: Continuity State Storage (1.0 days)

**Goal**: RuntimeState stores per-target gauge/slew buffers with proper lifecycle.

### Task 2.1: Define ContinuityState Type

**File**: `src/runtime/ContinuityState.ts` (NEW)

```typescript
/**
 * Continuity State
 *
 * Stores all state needed for smooth transitions across
 * domain changes and parameter edits.
 */

import type { DomainInstance } from './DomainIdentity';

/**
 * Mapping from new element indices to old element indices.
 * Used to transfer state when domain count changes.
 */
export type MappingState =
  | { readonly kind: 'identity'; readonly count: number }
  | { readonly kind: 'byId'; readonly newToOld: Int32Array }  // -1 = unmapped (new element)
  | { readonly kind: 'byPosition'; readonly newToOld: Int32Array };

/**
 * Branded type for stable target identification.
 * Survives across recompiles unlike raw slot indices.
 */
export type StableTargetId = string & { readonly __brand: 'StableTargetId' };

/**
 * Compute stable target ID from semantic information.
 */
export function computeStableTargetId(
  semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom',
  instanceId: string,
  portName: string
): StableTargetId {
  return `${semantic}:${instanceId}:${portName}` as StableTargetId;
}

/**
 * Per-target continuity buffers.
 */
export interface TargetContinuityState {
  /** Gauge offset buffer (Δ) - x_eff = x_base + Δ */
  gaugeBuffer: Float32Array;

  /** Slew state buffer (y) - current smoothed value */
  slewBuffer: Float32Array;

  /** Current element count */
  count: number;
}

/**
 * Complete continuity state for runtime.
 */
export interface ContinuityState {
  /** Per-target continuity buffers, keyed by StableTargetId */
  targets: Map<StableTargetId, TargetContinuityState>;

  /** Current mapping state per instance */
  mappings: Map<string, MappingState>;

  /** Previous domain instances (for change detection) */
  prevDomains: Map<string, DomainInstance>;

  /** Last t_model_ms for slew delta computation */
  lastTModelMs: number;

  /** Flag indicating domain change occurred this frame */
  domainChangeThisFrame: boolean;
}

/**
 * Create initial continuity state.
 */
export function createContinuityState(): ContinuityState {
  return {
    targets: new Map(),
    mappings: new Map(),
    prevDomains: new Map(),
    lastTModelMs: 0,
    domainChangeThisFrame: false,
  };
}

/**
 * Get or create target continuity state.
 */
export function getOrCreateTargetState(
  continuity: ContinuityState,
  targetId: StableTargetId,
  count: number
): TargetContinuityState {
  let state = continuity.targets.get(targetId);

  if (!state || state.count !== count) {
    // Allocate new buffers
    state = {
      gaugeBuffer: new Float32Array(count),
      slewBuffer: new Float32Array(count),
      count,
    };
    continuity.targets.set(targetId, state);
  }

  return state;
}
```

### Task 2.2: Add ContinuityState to RuntimeState

**File**: `src/runtime/RuntimeState.ts`

```typescript
import type { ContinuityState } from './ContinuityState';
import { createContinuityState } from './ContinuityState';

export interface RuntimeState {
  // ... existing fields ...

  /** Continuity state for smooth transitions */
  continuity: ContinuityState;
}

// In createRuntimeState():
export function createRuntimeState(...): RuntimeState {
  return {
    // ... existing ...
    continuity: createContinuityState(),
  };
}
```

### Acceptance Criteria

- [ ] `ContinuityState` type fully defined
- [ ] `MappingState` discriminated union complete
- [ ] `StableTargetId` branded type works
- [ ] `RuntimeState` includes `continuity` field
- [ ] `createContinuityState()` factory works
- [ ] `getOrCreateTargetState()` manages buffer lifecycle
- [ ] `npm run typecheck` passes

---

## Phase 3: Mapping and Reconciliation (1.5 days)

**Goal**: Compute element mappings when domain count changes.

### Task 3.1: Implement buildMappingById

**File**: `src/runtime/ContinuityMapping.ts` (NEW)

```typescript
/**
 * Continuity Mapping Module
 *
 * Implements the mapping algorithms from spec §3.3-3.5.
 * Computes how old elements map to new elements when domain changes.
 */

import type { DomainInstance } from './DomainIdentity';
import type { MappingState } from './ContinuityState';

/**
 * Build element mapping using stable IDs (spec §3.4).
 *
 * Algorithm:
 * 1. Build hash map: oldId → oldIndex
 * 2. For each new element, look up its ID in old map
 * 3. Result: newToOld[i] = oldIndex, or -1 if new element
 */
export function buildMappingById(
  oldDomain: DomainInstance,
  newDomain: DomainInstance
): MappingState {
  // Validate inputs
  if (oldDomain.identityMode !== 'stable' || newDomain.identityMode !== 'stable') {
    throw new Error('byId mapping requires stable identity mode');
  }

  // Fast path: identical domains
  if (oldDomain.count === newDomain.count &&
      arraysEqual(oldDomain.elementId, newDomain.elementId)) {
    return { kind: 'identity', count: newDomain.count };
  }

  // Build hash map: oldId → oldIndex
  const oldIdMap = new Map<number, number>();
  for (let i = 0; i < oldDomain.count; i++) {
    oldIdMap.set(oldDomain.elementId[i], i);
  }

  // Compute newToOld mapping
  const newToOld = new Int32Array(newDomain.count);
  for (let i = 0; i < newDomain.count; i++) {
    const oldIdx = oldIdMap.get(newDomain.elementId[i]);
    newToOld[i] = oldIdx !== undefined ? oldIdx : -1;
  }

  return { kind: 'byId', newToOld };
}

/**
 * Check if two Uint32Arrays are equal.
 */
function arraysEqual(a: Uint32Array, b: Uint32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
```

### Task 3.2: Implement buildMappingByPosition

**File**: `src/runtime/ContinuityMapping.ts`

```typescript
/**
 * Build element mapping using spatial position hints (spec §3.5).
 * Fallback when stable IDs are not available.
 *
 * Uses nearest-neighbor search with bounded radius.
 */
export function buildMappingByPosition(
  oldDomain: DomainInstance,
  newDomain: DomainInstance,
  maxSearchRadius: number = 0.1
): MappingState {
  if (!oldDomain.posHintXY || !newDomain.posHintXY) {
    throw new Error('byPosition mapping requires posHintXY');
  }

  const newToOld = new Int32Array(newDomain.count);
  const usedOld = new Set<number>();

  // For each new element, find nearest old element
  for (let i = 0; i < newDomain.count; i++) {
    const newX = newDomain.posHintXY[i * 2];
    const newY = newDomain.posHintXY[i * 2 + 1];

    let bestOldIdx = -1;
    let bestDist = maxSearchRadius * maxSearchRadius;

    for (let j = 0; j < oldDomain.count; j++) {
      if (usedOld.has(j)) continue;

      const oldX = oldDomain.posHintXY[j * 2];
      const oldY = oldDomain.posHintXY[j * 2 + 1];
      const dx = newX - oldX;
      const dy = newY - oldY;
      const distSq = dx * dx + dy * dy;

      if (distSq < bestDist) {
        bestDist = distSq;
        bestOldIdx = j;
      }
    }

    newToOld[i] = bestOldIdx;
    if (bestOldIdx >= 0) {
      usedOld.add(bestOldIdx);
    }
  }

  return { kind: 'byPosition', newToOld };
}
```

### Task 3.3: Implement Domain Change Detection

**File**: `src/runtime/ContinuityMapping.ts`

```typescript
/**
 * Detect domain changes and compute mapping.
 * Called at hot-swap boundary, not every frame.
 */
export function detectDomainChange(
  instanceId: string,
  newDomain: DomainInstance,
  prevDomains: Map<string, DomainInstance>
): { changed: boolean; mapping: MappingState | null } {
  const oldDomain = prevDomains.get(instanceId);

  // First time seeing this domain
  if (!oldDomain) {
    return { changed: true, mapping: null };
  }

  // Check for identity (fast path)
  if (oldDomain.count === newDomain.count &&
      oldDomain.identityMode === 'stable' &&
      newDomain.identityMode === 'stable' &&
      arraysEqual(oldDomain.elementId, newDomain.elementId)) {
    return {
      changed: false,
      mapping: { kind: 'identity', count: newDomain.count }
    };
  }

  // Compute appropriate mapping
  if (newDomain.identityMode === 'stable' && oldDomain.identityMode === 'stable') {
    const mapping = buildMappingById(oldDomain, newDomain);
    return { changed: true, mapping };
  }

  if (newDomain.posHintXY && oldDomain.posHintXY) {
    const mapping = buildMappingByPosition(oldDomain, newDomain);
    return { changed: true, mapping };
  }

  // No mapping possible - crossfade fallback
  return { changed: true, mapping: null };
}
```

### Acceptance Criteria

- [ ] `buildMappingById()` correctly maps old→new indices
- [ ] Identity mapping fast path works
- [ ] Unmapped elements (new) get -1
- [ ] `buildMappingByPosition()` works as fallback
- [ ] `detectDomainChange()` detects changes correctly
- [ ] Test: 10→11 maps 0-9 correctly, 10 is -1
- [ ] Test: 11→10 maps 0-9 correctly
- [ ] Test: Identity mapping when unchanged

---

## Phase 4: Schedule Integration (1.0 days)

**Goal**: Add continuity steps to the execution schedule.

### Task 4.1: Define New Step Types

**File**: `src/compiler/ir/types.ts`

```typescript
/**
 * Continuity policy for a field target.
 */
export type ContinuityPolicy =
  | { readonly kind: 'none' }
  | { readonly kind: 'preserve'; readonly gauge: 'add' | 'mul' }
  | { readonly kind: 'slew'; readonly gauge: 'add' | 'mul'; readonly tauMs: number }
  | { readonly kind: 'crossfade'; readonly windowMs: number }
  | { readonly kind: 'project'; readonly post: 'slew'; readonly tauMs: number };

/**
 * Step to build element mapping when domain changes.
 * Executed rarely (only at hot-swap boundaries).
 */
export interface StepContinuityMapBuild {
  readonly kind: 'continuityMapBuild';
  readonly instanceId: string;
}

/**
 * Step to apply continuity policy to a field target.
 * Executed per-frame for targets with policy != none.
 */
export interface StepContinuityApply {
  readonly kind: 'continuityApply';
  readonly targetKey: string;  // StableTargetId
  readonly instanceId: string;
  readonly policy: ContinuityPolicy;
  readonly baseSlot: ValueSlot;
  readonly outputSlot: ValueSlot;
}

// Update Step union type
export type Step =
  | StepEvalSig
  | StepMaterialize
  | StepRender
  | StepStateWrite
  | StepContinuityMapBuild  // NEW
  | StepContinuityApply;     // NEW
```

### Task 4.2: Define Canonical Default Policies

**File**: `src/runtime/ContinuityDefaults.ts` (NEW)

```typescript
/**
 * Canonical default continuity policies (spec §2.3).
 * These are engine-wide defaults when no UI override exists.
 */

import type { ContinuityPolicy } from '../compiler/ir/types';

export const CANONICAL_CONTINUITY_POLICIES: Record<string, ContinuityPolicy> = {
  position: { kind: 'project', post: 'slew', tauMs: 120 },
  radius: { kind: 'slew', gauge: 'add', tauMs: 120 },
  opacity: { kind: 'slew', gauge: 'add', tauMs: 80 },
  color: { kind: 'slew', gauge: 'add', tauMs: 150 },
  custom: { kind: 'crossfade', windowMs: 150 },
};

/**
 * Get continuity policy for a semantic role.
 */
export function getPolicyForSemantic(
  semantic: string
): ContinuityPolicy {
  return CANONICAL_CONTINUITY_POLICIES[semantic] ??
         CANONICAL_CONTINUITY_POLICIES.custom;
}
```

### Task 4.3: Emit Continuity Steps in Schedule Pass

**File**: `src/compiler/passes-v2/pass7-schedule.ts`

Add continuity step generation:

```typescript
// Schedule phase order:
// 1. evalSig steps (signal computation)
// 2. materialize steps (field computation)
// 3. continuityMapBuild steps (rare - only on domain change)
// 4. continuityApply steps (per-frame for continuity targets)
// 5. render steps (output to renderer)
// 6. stateWrite steps (persist state)

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
      });
    }
  }

  // Emit apply for each continuity target
  for (const matStep of materializeSteps) {
    const policy = getPolicyForSemantic(matStep.semantic ?? 'custom');
    if (policy.kind !== 'none') {
      steps.push({
        kind: 'continuityApply',
        targetKey: computeStableTargetId(
          matStep.semantic ?? 'custom',
          matStep.instanceId,
          matStep.fieldId
        ),
        instanceId: matStep.instanceId,
        policy,
        baseSlot: matStep.outputSlot,
        outputSlot: matStep.outputSlot,  // In-place for now
      });
    }
  }

  return steps;
}
```

### Task 4.4: Execute Continuity Steps

**File**: `src/runtime/ScheduleExecutor.ts`

Add execution for new step types:

```typescript
case 'continuityMapBuild': {
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
  applyContinuity(step, state, pool);
  break;
}
```

### Acceptance Criteria

- [ ] New step types compile correctly
- [ ] Schedule includes continuity steps in correct phase order
- [ ] ScheduleExecutor handles both step types
- [ ] Map build only runs when domain changes
- [ ] Apply runs every frame for non-none policies
- [ ] `npm run typecheck` passes

---

## Phase 5: Slew/Gauge Implementation (1.0 days)

**Goal**: Apply continuity policies to preserve values smoothly.

### Task 5.1: Implement Additive Gauge

**File**: `src/runtime/ContinuityApply.ts` (NEW)

```typescript
/**
 * Continuity Application Module
 *
 * Implements gauge and slew filters from spec §2.5 and §4.1.
 */

import type { ContinuityPolicy } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import type { MappingState, StableTargetId } from './ContinuityState';
import { getOrCreateTargetState } from './ContinuityState';

/**
 * Apply additive gauge: x_eff = x_base + Δ
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
```

### Task 5.2: Implement Slew Filter

**File**: `src/runtime/ContinuityApply.ts`

```typescript
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
```

### Task 5.3: Implement applyContinuity Dispatch

**File**: `src/runtime/ContinuityApply.ts`

```typescript
/**
 * Apply continuity policy to a field target.
 * Called per-frame for targets with policy != none.
 */
export function applyContinuity(
  step: StepContinuityApply,
  state: RuntimeState,
  pool: BufferPool
): void {
  const { targetKey, instanceId, policy, baseSlot } = step;
  const targetId = targetKey as StableTargetId;

  // Get current base buffer
  const baseBuffer = getBufferForSlot(baseSlot, state, pool);
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
      ? targetState.slewBuffer
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

  // Apply policy
  switch (policy.kind) {
    case 'none':
      // Pass through unchanged
      break;

    case 'preserve':
      // Apply gauge only (hard continuity)
      applyAdditiveGauge(
        baseBuffer,
        targetState.gaugeBuffer,
        baseBuffer,  // In-place
        count
      );
      break;

    case 'slew':
      // Slew toward base value
      applySlewFilter(
        baseBuffer,
        targetState.slewBuffer,
        baseBuffer,  // In-place
        policy.tauMs,
        dtMs,
        count
      );
      break;

    case 'project':
      // Apply gauge then slew
      applyAdditiveGauge(
        baseBuffer,
        targetState.gaugeBuffer,
        baseBuffer,
        count
      );
      applySlewFilter(
        baseBuffer,
        targetState.slewBuffer,
        baseBuffer,
        policy.tauMs,
        dtMs,
        count
      );
      break;

    case 'crossfade':
      // TODO: Implement crossfade for unmappable cases
      break;
  }
}

/**
 * End-of-frame cleanup.
 */
export function finalizeContinuityFrame(state: RuntimeState): void {
  state.continuity.lastTModelMs = state.time?.tMs ?? 0;
  state.continuity.domainChangeThisFrame = false;
}
```

### Acceptance Criteria

- [ ] Slew filter converges correctly (exponential decay)
- [ ] Alpha calculation matches spec formula
- [ ] Gauge preserves effective values across discontinuities
- [ ] New elements start at base value (Δ = 0, no jump)
- [ ] Mapped elements preserve their effective value
- [ ] Policy dispatch handles all cases
- [ ] `npm run typecheck` passes
- [ ] Test: Count 10→11 smooth for 0-9, fresh for 10

---

## Test Cases

### Unit Tests

**File**: `src/runtime/__tests__/DomainIdentity.test.ts`

```typescript
describe('generateElementIds', () => {
  it('generates deterministic IDs', () => {
    const ids = generateElementIds(10);
    expect(ids).toEqual(new Uint32Array([0,1,2,3,4,5,6,7,8,9]));
  });

  it('respects seed parameter', () => {
    const ids = generateElementIds(5, 100);
    expect(ids).toEqual(new Uint32Array([100,101,102,103,104]));
  });
});
```

**File**: `src/runtime/__tests__/ContinuityMapping.test.ts`

```typescript
describe('buildMappingById', () => {
  it('maps 10→11 correctly', () => {
    const old = createStableDomainInstance(10);
    const new_ = createStableDomainInstance(11);
    const mapping = buildMappingById(old, new_);

    expect(mapping.kind).toBe('byId');
    if (mapping.kind === 'byId') {
      // 0-9 map to themselves
      for (let i = 0; i < 10; i++) {
        expect(mapping.newToOld[i]).toBe(i);
      }
      // 10 is new (unmapped)
      expect(mapping.newToOld[10]).toBe(-1);
    }
  });

  it('maps 11→10 correctly', () => {
    const old = createStableDomainInstance(11);
    const new_ = createStableDomainInstance(10);
    const mapping = buildMappingById(old, new_);

    expect(mapping.kind).toBe('byId');
    if (mapping.kind === 'byId') {
      // 0-9 map to themselves
      for (let i = 0; i < 10; i++) {
        expect(mapping.newToOld[i]).toBe(i);
      }
    }
  });

  it('returns identity for unchanged domain', () => {
    const domain = createStableDomainInstance(10);
    const mapping = buildMappingById(domain, domain);
    expect(mapping.kind).toBe('identity');
  });
});
```

**File**: `src/runtime/__tests__/ContinuityApply.test.ts`

```typescript
describe('applySlewFilter', () => {
  it('converges exponentially', () => {
    const target = new Float32Array([1.0]);
    const slew = new Float32Array([0.0]);
    const output = new Float32Array(1);

    // After tau ms, should be ~63% of the way
    applySlewFilter(target, slew, output, 100, 100, 1);
    expect(output[0]).toBeCloseTo(0.632, 2);
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
});
```

### Integration Tests

**File**: `src/compiler/__tests__/continuity-integration.test.ts`

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

  it('produces identical output for export and playback', () => {
    // Run live playback with discontinuity
    // Run export with same seed/time
    // Compare outputs - must be bit-identical (I31)
  });
});
```

---

## Effort Summary

| Phase | Days | Focus |
|-------|------|-------|
| 1. Domain Identity | 1.5 | elementId, identityMode, both shapes and arrays |
| 2. Continuity State | 1.0 | RuntimeState extension, buffer management |
| 3. Mapping/Reconciliation | 1.5 | byId algorithm, change detection |
| 4. Schedule Integration | 1.0 | New step types, schedule generation |
| 5. Slew/Gauge | 1.0 | Filter implementation, policy dispatch |
| **Total** | **6.0 days** | **Spec-compliant continuity system** |

---

## Dependencies and Sequencing

```
Phase 1 (Domain Identity) ←── Foundation, must complete first
    ↓
Phase 2 (State) ←→ Phase 3 (Mapping)  ←── Can parallelize
    ↓                ↓
      Phase 4 (Schedule)  ←── Depends on 1, 2, 3
           ↓
      Phase 5 (Slew/Gauge)  ←── Depends on 4
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Spec drift | Implement exactly as Topic 11 describes |
| Performance | Spec mandates allocation-free, vectorized (use typed arrays) |
| Determinism | Use only t_model_ms, seeded algorithms (I30) |
| Export parity | Same schedule/steps in export loop (I31) |
| Scope creep | Stick to spec; this is implementation, not design |

---

## Critical Files Summary

### New Files
- `src/runtime/DomainIdentity.ts` - Element ID generation
- `src/runtime/ContinuityState.ts` - State types and management
- `src/runtime/ContinuityMapping.ts` - Mapping algorithms
- `src/runtime/ContinuityApply.ts` - Slew/gauge implementation
- `src/runtime/ContinuityDefaults.ts` - Canonical policies

### Modified Files
- `src/compiler/ir/types.ts` - DomainInstance, InstanceDecl, Step types
- `src/runtime/RuntimeState.ts` - Add continuity field
- `src/compiler/passes-v2/pass7-schedule.ts` - Emit continuity steps
- `src/runtime/ScheduleExecutor.ts` - Execute continuity steps
- `src/blocks/array-blocks.ts` - Set identityMode
- `src/blocks/shape-blocks.ts` - Set identityMode
- `src/compiler/ir/IRBuilderImpl.ts` - Add identityMode param

---

## Success Criteria

When this plan is fully implemented:

1. **Identity Preservation**: Instances 0-9 preserve state when count goes 10→11
2. **Smooth Transitions**: No visual "pop" on parameter changes
3. **Determinism**: Export matches playback bit-for-bit
4. **Performance**: No per-frame allocations, vectorized operations
5. **Spec Compliance**: Implements Topic 11 exactly as specified
6. **Testable**: All phases have acceptance criteria and test cases

This is the **complete and immutable foundation** for animation continuity in Oscilla.
