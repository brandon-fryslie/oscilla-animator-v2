# Research: Instance Identity Preservation (Spec-Aligned)

## Problem Statement

When a parameter changes (e.g., Const from 10 to 11), Array blocks that depend on it produce 11 instances instead of 10. We need:
- Instances 0-9 to preserve identity and accumulated state
- Instance 10 to be created new
- Animation phase, positions, etc. to NOT reset for preserved instances

**Why This Matters:**
- Animation continuity (instance 5 doesn't jump/reset mid-animation)
- Stable IDs for debugging/inspection
- Deterministic behavior (same edit → same result)
- Smooth visual transitions during live editing

## The Spec Already Defines This

The canonical spec in `design-docs/CANONICAL-oscilla-v2.5-20260109/` already fully specifies how this should work. This is not a new architecture problem - it's an **implementation gap**.

### Relevant Invariants

| Invariant | Rule | Applies To |
|-----------|------|------------|
| **I2** | Gauge Invariance | Effective values are continuous across discontinuities |
| **I3** | State Continuity with Stable IDs | StateIds enable migration: copy, transform, or reset |
| **I11** | Stable Element Identity | Domains provide stable element IDs, not "array indices we hope stay stable" |
| **I30** | Continuity is Deterministic | All continuity operations use `t_model_ms` and deterministic algorithms |
| **I31** | Export Matches Playback | No divergence between live and export |

### Topic 11: Continuity System (The Full Solution)

The spec defines a complete **Continuity System** covering:

1. **Phase Continuity** (Time Gauge) - Already understood
2. **Value Continuity** (Parameter Gauge) - When params change, slew/crossfade
3. **Topology Continuity** (Element Projection) - **THIS IS WHAT WE NEED**

## Topology Continuity (Spec Section 3)

### Domain Identity Contract

From spec §3.1:
```typescript
interface DomainInstance {
  count: number;
  elementId?: Uint32Array;  // Optional only if identityMode="none"
  identityMode: 'stable' | 'none';
  posHintXY?: Float32Array; // Spatial hints for fallback mapping
}
```

**Key constraint:** Domains that claim `identityMode="stable"` **must** emit deterministic `elementId` given domain parameters and seed.

### ElementId Semantics

From spec §3.2:

> **ElementId is stable across edits** that preserve the conceptual element set.
>
> When user changes domain count:
> - Existing IDs **must persist** where possible
> - New IDs are allocated deterministically (seeded counter stream)

**Example (Grid Domain):**
```typescript
// Grid 3x3 → elementId = [0,1,2,3,4,5,6,7,8]
// User edits to 4x4 → elementId = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
// Elements 0-8 are SAME elements, 9-15 are NEW
```

This is exactly what the user requested.

### Mapping State

From spec §3.3:
```typescript
type MappingState =
  | { kind: 'identity', count: number }         // Same indices (fast path)
  | { kind: 'byId', newToOld: Int32Array }     // -1 if unmapped
  | { kind: 'byPosition', newToOld: Int32Array }; // Fallback using posHintXY
```

### byId Mapping Build Algorithm

From spec §3.4:
```typescript
// 1. Build hash map oldId → oldIndex
const oldIdMap = new Map<number, number>();
for (let i = 0; i < old.count; i++) {
  oldIdMap.set(old.elementId[i], i);
}

// 2. Compute newToOld mapping
const newToOld = new Int32Array(new.count);
for (let i = 0; i < new.count; i++) {
  const oldIdx = oldIdMap.get(new.elementId[i]);
  newToOld[i] = oldIdx !== undefined ? oldIdx : -1;
}

return { kind: 'byId', newToOld };
```

**Performance constraint:** Mapping computed **only when domain identity changed**, not every frame.

### New Element Initialization ("Birth")

From spec §3.6:
```typescript
// For gauge
Δ[i] = 0;  // Start at base value

// For slew
y[i] = X_new_base[i];  // Start at base, will relax from there

// For project+slew with posHint
y[i] = inheritNearestMappedNeighbor(i);  // Optional: smoother birth
```

**No randomness** unless explicitly seeded.

## Value Continuity Integration

### Continuity Policies

From spec §2.2:
```typescript
type ContinuityPolicy =
  | { kind: 'none' }
  | { kind: 'preserve', gauge: GaugeSpec }
  | { kind: 'slew', gauge: GaugeSpec, tauMs: number }
  | { kind: 'crossfade', windowMs: number, curve: CurveSpec }
  | { kind: 'project', projector: ProjectorSpec, post: PostSpec };
```

### Canonical Defaults

From spec §2.3:

| Target | Policy | Notes |
|--------|--------|-------|
| `position` | `project + post:slew(tau=120ms)` | Map by element ID, then slew |
| `radius` | `slew(tau=120ms)` | Direct slew |
| `opacity` | `slew(tau=80ms)` | Fast response |
| `color` | `slew(tau=150ms)` | Linear RGBA slew |
| `custom/untyped` | `crossfade(150ms)` | Safe fallback |

### Slew Filter

From spec §4.1:
```typescript
const dt = t_model_ms - last_t_model_ms;
const α = 1 - Math.exp(-dt / tauMs);
y[i] = y[i] + α * (target[i] - y[i]);
```

## Where Continuity Runs

From spec §5.1:

> Continuity is a **post-materialization pass** operating on buffers referenced by ValueSlots.

Explicit schedule steps:
```typescript
// Rare (on swap / domain-change)
StepContinuityMapBuild {
  oldDomain: DomainKey;
  newDomain: DomainKey;
  output: MappingState;
}

// Per-frame (for targets with policy != none)
StepContinuityApply {
  targetKey: StableTargetId;
  policy: ContinuityPolicy;
  baseSlot: ValueSlot;
  outputSlot: ValueSlot;
}
```

## Implementation Gap Analysis

### What Exists Today (Current Codebase)

Based on exploration of `src/compiler/` and `src/runtime/`:

| Component | Status |
|-----------|--------|
| InstanceDecl with count | ✅ Exists |
| Instance IDs (string) | ✅ Exists (`instance_0`, etc.) |
| BufferPool | ✅ Exists |
| Materialization loop | ✅ Exists |
| DomainInstance with elementId | ❌ Missing |
| identityMode in domains | ❌ Missing |
| MappingState/reconciliation | ❌ Missing |
| ContinuityPolicy system | ❌ Missing |
| StepContinuityMapBuild | ❌ Missing |
| StepContinuityApply | ❌ Missing |
| Per-instance state storage | ❌ Missing |
| Slew filter implementation | ❌ Missing |

### What Needs Implementation

**Phase 1: Domain Identity Infrastructure**
1. Add `elementId: Uint32Array` to domain materialization
2. Add `identityMode: 'stable' | 'none'` to DomainInstance
3. Implement deterministic elementId generation for Array, Grid domains
4. Ensure elementIds persist across count changes (IDs 0-9 stay for count 10→11)

**Phase 2: Continuity State Storage**
1. Add `ContinuityState` to RuntimeState
2. Per-target gauge buffers (Δ)
3. Per-target slew buffers (y)
4. Target keying by StableTargetId

**Phase 3: Mapping/Reconciliation**
1. Implement `buildMapping()` function (byId, byPosition, identity)
2. Hook into hot-swap boundary
3. Compute mapping only when domain identity changes

**Phase 4: Schedule Integration**
1. Add `StepContinuityMapBuild` step type
2. Add `StepContinuityApply` step type
3. Integrate into schedule generation
4. Ensure deterministic execution order

**Phase 5: Slew/Gauge Implementation**
1. Implement additive gauge: `x_eff = x_base + Δ`
2. Implement first-order slew filter
3. Apply per-element using mapping
4. Handle new elements (birth) and removed elements (cleanup)

## Answers to Original Questions

### 1. When animation phase completes?

The spec doesn't prescribe phase completion semantics - that depends on the animation block. But **continuity preserves whatever phase value exists**. If an animation block internally wraps phase, continuity preserves the wrapped value.

### 2. When should state reset?

From spec §3.6 and invariant I2:
> Unless explicitly reset by user action

State preserves across all automatic changes. Reset only when:
- User explicitly requests reset
- Element is removed (state garbage collected)
- Incompatible topology change (crossfade fallback)

### 3. Dynamic count per-frame?

The spec supports this via the `'dynamic'` count in InstanceDecl, but:
- Current implementation: count at compile boundary
- Future: count from signal expression (requires schedule step for reconciliation per-frame)

For MVP, count changes at compile boundary is sufficient.

### 4. Other per-instance state?

The spec mentions:
- Animation phase (primary concern)
- Completion flags
- Any buffer targeted by continuity policy

The system is generic - any FieldTarget can have continuity.

## Effort Estimate (Spec-Aligned)

| Phase | Days | Focus |
|-------|------|-------|
| 1. Domain Identity | 1.5 | elementId, identityMode, generation |
| 2. Continuity State | 1.0 | RuntimeState extension, buffers |
| 3. Mapping/Reconciliation | 1.5 | byId algorithm, hot-swap hook |
| 4. Schedule Integration | 1.0 | New step types, generation |
| 5. Slew/Gauge | 1.0 | Filter implementation |
| **Total** | **6.0** | **Spec-compliant continuity** |

This is more than my original estimate because the spec is comprehensive. But it's the right approach.

## Implementation Order

1. **Domain Identity** first - this is the foundation
2. **Mapping** next - can test with console logs
3. **Continuity State** - storage for gauge/slew
4. **Schedule Steps** - make it observable
5. **Slew/Gauge** - the actual smoothing

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Spec drift | Implement exactly as spec describes |
| Performance | Spec mandates allocation-free, SIMD-friendly |
| Correctness | Spec provides determinism guarantees |
| Scope creep | Stick to spec; it's already designed |

## Conclusion

This is not a design problem. The spec already defines the complete solution. The work is implementation:

1. Add `elementId` to domain materialization
2. Implement mapping algorithm from spec §3.4
3. Add continuity state storage
4. Add schedule steps for continuity
5. Implement slew filter from spec §4.1

The spec even provides the algorithms. This is pure implementation work against a well-defined spec.

## References

- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/11-continuity-system.md` (full spec)
- `design-docs/CANONICAL-oscilla-v2.5-20260109/INVARIANTS.md` (I2, I3, I11, I30, I31)
- `design-docs/CANONICAL-oscilla-v2.5-20260109/GLOSSARY.md` (Domain, Gauge, Continuity)
