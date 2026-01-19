# Evaluation: Continuity System Alignment

> **Generated**: 2026-01-18
> **Topic**: continuity-system
> **Purpose**: Align existing plan with updated canonical spec

---

## 1. Canonical Spec Review

The canonical specification (`design-docs/CANONICAL-oscilla-v2.5-20260109/topics/11-continuity-system.md`) defines the Continuity System with these key elements:

### Core Architecture (Spec §Overview)
- **Runtime-only system** - compiler never sees it, IR never changes
- **Gauge invariance** - observable values continuous across discontinuities
- **Deterministic** - export must match playback bit-for-bit

### Key Types Required (Spec §3.1, §5.1)

| Type | Description | Status in Codebase |
|------|-------------|-------------------|
| `DomainInstance` | Runtime domain instance with elementId, identityMode | ❌ Missing |
| `MappingState` | Element mapping (identity/byId/byPosition) | ❌ Missing |
| `ContinuityPolicy` | none/preserve/slew/crossfade/project | ❌ Missing |
| `StableTargetId` | Stable key for continuity targets | ❌ Missing |
| `ContinuityState` | Per-runtime continuity buffers | ❌ Missing |
| `StepContinuityMapBuild` | Schedule step (rare) | ❌ Missing |
| `StepContinuityApply` | Schedule step (per-frame) | ❌ Missing |

### Existing Infrastructure in Codebase

| Component | Location | Alignment |
|-----------|----------|-----------|
| `InstanceDecl` | `src/compiler/ir/types.ts:317-323` | ⚠️ Missing `identityMode` |
| `LayoutSpec` | `src/compiler/ir/types.ts:304-311` | ✅ Complete |
| `TimeModel` | `src/compiler/ir/types.ts:330-332` | ✅ Complete |
| `Step` types | `src/compiler/ir/types.ts:338-374` | ⚠️ Missing continuity steps |
| `BufferPool` | Exists | ✅ Can reuse |
| Phase offset in TimeState | `src/runtime/timeResolution.ts` | ✅ Already exists |

---

## 2. Gap Analysis: Plan vs Spec

### Alignment Issues in Original Plan

| Plan Element | Spec Element | Alignment Status |
|--------------|--------------|------------------|
| `DomainInstance` type | §3.1 | ✅ Correct |
| `elementId` as `Uint32Array` | §3.1 | ✅ Correct |
| `identityMode: 'stable' \| 'none'` | §3.1 | ✅ Correct |
| `MappingState` discriminated union | §3.3 | ✅ Correct |
| `ContinuityPolicy` types | §2.2 | ⚠️ Missing `curve: CurveSpec` in crossfade |
| `GaugeSpec` types | §2.4 | ❌ Missing (plan uses simplified inline) |
| `buildMappingById` algorithm | §3.4 | ✅ Correct |
| `buildMappingByPosition` algorithm | §3.5 | ✅ Correct |
| Slew filter formula | §4.1 | ✅ Correct |
| Canonical time constants | §4.2 | ✅ Correct |
| `StepContinuityMapBuild` | §5.1 | ⚠️ Missing `output: MappingState` |
| `StepContinuityApply` | §5.1 | ⚠️ Missing `outputSlot` (spec has baseSlot/outputSlot) |

### Terminology Alignment

| Plan Term | Spec Term | Action |
|-----------|-----------|--------|
| "Array Block" as identity source | §3.1 mentions Domain, not Array | ⚠️ Clarify: Array creates instances |
| "DomainIdentity module" | Spec doesn't name modules | ✅ OK (implementation detail) |

---

## 3. Recent Spec Changes Impact

### 01-type-system.md Updates

**Domain vs Instance clarification:**
- **Domain** = ontological classification (what kind of thing)
- **Instance** = specific collection with count (how many, which pool)

**Impact on Plan:**
- Plan correctly uses `InstanceDecl` for collection management
- Plan correctly associates `elementId` with instances
- No changes needed

### 02-block-system.md Updates

**Three-Stage Architecture (Primitive → Array → Layout):**
- **Primitive blocks** create single elements
- **Array block** transforms Signal → Field (cardinality transform)
- **Layout blocks** compute positions

**Impact on Plan:**
- Plan Phase 1.4 correctly targets Array block for `identityMode`
- Plan Phase 1.5 mentions "shape blocks" - should clarify as "Primitive blocks"
- Both Primitive and Array blocks participate in identity (Primitive creates the domain type, Array creates the instance with stable IDs)

### INVARIANTS.md Updates

**Relevant invariants:**
- **I2**: Gauge invariance (plan addresses this fully)
- **I3**: State continuity with stable IDs (plan addresses this)
- **I11**: Stable element identity (plan addresses this)
- **I30**: Continuity is deterministic - t_model_ms only (plan addresses this)
- **I31**: Export matches playback (plan addresses this)

**Impact on Plan:**
- No changes needed - plan already aligns with invariants

---

## 4. Verdict

**CONTINUE** - The existing plan is well-aligned with the canonical spec. Minor adjustments needed:

### Required Adjustments

1. **Add `GaugeSpec` type** (spec §2.4) - currently inlined in plan
2. **Add `CurveSpec` to crossfade policy** (spec §2.2)
3. **Update `StepContinuityMapBuild`** to include `output: MappingState` field
4. **Update `StepContinuityApply`** to have distinct `baseSlot` and `outputSlot`
5. **Rename "shape blocks" to "Primitive blocks"** in Task 1.5 for spec alignment

### No Changes Needed

- Core architecture (runtime-only gauge system)
- `DomainInstance` type definition
- Mapping algorithms (byId, byPosition)
- Slew filter implementation
- Phase integration

---

## 5. Recommendations

### High-Confidence Elements (Ready for Implementation)
1. Phase 1: Domain Identity Infrastructure
2. Phase 2: Continuity State Storage
3. Phase 3: Mapping and Reconciliation

### Medium-Confidence Elements (Minor Research)
4. Phase 4: Schedule Integration - need to verify schedule pass structure
5. Phase 5: Slew/Gauge Implementation - straightforward but depends on 1-4

### Sprint Structure Recommendation

Given the dependencies and the fact that this is core infrastructure:

**Sprint 1: Foundation Types & Identity** (HIGH confidence)
- DomainInstance type
- InstanceDecl extension (add identityMode)
- DomainIdentity module
- Unit tests for identity generation

**Sprint 2: Continuity State & Mapping** (HIGH confidence)
- ContinuityState type
- MappingState type
- StableTargetId type
- Mapping algorithms (byId, byPosition)
- Integration with RuntimeState

**Sprint 3: Schedule & Apply** (HIGH confidence)
- New Step types
- Schedule pass modifications
- Apply implementations (gauge, slew)
- Integration tests

---

## 6. File Impact Summary

### New Files
```
src/runtime/DomainIdentity.ts       # Element ID generation
src/runtime/ContinuityState.ts      # State types and management
src/runtime/ContinuityMapping.ts    # Mapping algorithms
src/runtime/ContinuityApply.ts      # Slew/gauge implementation
src/runtime/ContinuityDefaults.ts   # Canonical policies
```

### Modified Files
```
src/compiler/ir/types.ts            # Add continuity types, extend InstanceDecl, add Steps
src/runtime/RuntimeState.ts         # Add continuity field
src/compiler/passes-v2/pass7-schedule.ts  # Emit continuity steps
src/runtime/ScheduleExecutor.ts     # Execute continuity steps
src/blocks/array.ts (or equiv)      # Set identityMode
```

### Test Files
```
src/runtime/__tests__/DomainIdentity.test.ts
src/runtime/__tests__/ContinuityMapping.test.ts
src/runtime/__tests__/ContinuityApply.test.ts
src/compiler/__tests__/continuity-integration.test.ts
```
