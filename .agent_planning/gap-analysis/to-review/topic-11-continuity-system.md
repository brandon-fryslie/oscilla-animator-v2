---
topic: 11
name: continuity-system
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/11-continuity-system.md
category: to-review
audited: 2026-01-24T22:00:00Z
item_count: 6
---

# Topic 11: Continuity System - Gap Analysis

## Primary Category: TO-REVIEW (6 items)

The continuity system is substantially implemented with gauge, slew, project, and crossfade policies. However, the architecture DIFFERS from spec in important ways -- notably, the spec describes Phase Continuity (time gauge) as the PRIMARY mechanism, while the implementation focuses on Field Continuity (domain-change smoothing). The implementation appears to work well for its use case but deviates from spec on several points.

### 1. Phase Continuity (Time Gauge) - spec Part 1
- **Spec**: `TimeState { prevBasePhase, phaseOffset }` with phase reconciliation on time discontinuities. Phase offset gauge that preserves `phi_eff` across scrub/loop/seek. `timeDerive` step runs before SignalExpr.
- **Implementation**: The IR has `phaseOffset` in ContinuityPolicy and `prevBasePhase` concept exists in time resolution code. However, the full per-TimeRoot `TimeState` with reconciliation rule is not clearly isolated as described.
- **Assessment**: TO-REVIEW - Phase continuity seems partially handled through the time resolution system but not via the exact architecture the spec describes. Need to verify if scrub/loop causes discontinuities.

### 2. Per-TimeRoot TimeState storage
- **Spec**: One TimeState per TimeRoot, preserved across hot-swap
- **Implementation**: Time state is in RuntimeState.time but structured differently (tMs-based rather than phase-based)
- **Assessment**: TO-REVIEW - May be functionally equivalent but architecturally different

### 3. Multi-phase support (phaseA, phaseB independent offsets)
- **Spec**: Each TimeRoot produces independent phase rails with independent offsets
- **Implementation**: Time resolution handles phases but unclear if independent phase offset reconciliation exists per rail
- **Assessment**: TO-REVIEW

### 4. Field continuity stride handling
- **Spec**: Stride concept for vec2 (position) vs float (radius/opacity)
- **Implementation**: stride = 2 for position, 1 for others in ContinuityApply.ts
- **Assessment**: TO-REVIEW - Implementation exists but hard-coded rather than derived from type system

### 5. Decay exponent configuration
- **Spec**: Gauge decay uses exponential with configurable tau
- **Implementation**: Uses `decayExponent` from `continuityConfig` (rooted exponential: `exp(-dt/tau)^exponent`)
- **Assessment**: TO-REVIEW - Implementation adds an exponent concept not in spec. May be an improvement.

### 6. Test pulse injection
- **Spec**: No explicit test pulse mechanism described
- **Implementation**: `testPulseRequest` in continuityConfig allows injecting gauge offsets for testing
- **Assessment**: TO-REVIEW - Implementation adds debugging capability not in spec. Useful but non-spec.

## Also

### DONE (10 items)
1. Additive gauge: x_eff = x_base + Delta (spec section 2.5)
2. Gauge initialization on domain change (preserves effective value)
3. Slew filter: first-order low-pass with time-correct alpha (spec section 4.1)
4. ContinuityPolicy types: none, preserve, slew, project, crossfade
5. StableTargetId (branded type, survives across recompiles)
6. Mapping algorithms: byId (stable IDs) and byPosition (spatial nearest-neighbor)
7. MappingState types: identity, byId, byPosition
8. Domain change detection (detectDomainChange)
9. Crossfade blending with smoothstep curve (spec section 3.7)
10. Allocation-free per-frame operation (pooled buffers via getOrCreateTargetState)

### UNIMPLEMENTED (4 items)
1. **wrapEvent detection**: Spec says TimeModel emits wrapEvent=true on discontinuity. Implementation doesn't use this mechanism.
2. **SIMD-friendly layouts**: Spec mentions SoA layouts for performance. Implementation uses AoS Float32Arrays.
3. **Export frame stepping**: Spec requires continuity to work identically during export. Not verified.
4. **Trace events for continuity**: Spec mentions measurable/traceable. No trace event emission in continuity code.
