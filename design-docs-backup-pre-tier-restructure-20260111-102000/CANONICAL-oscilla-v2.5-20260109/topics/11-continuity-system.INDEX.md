# Continuity System (Anti-Jank Architecture) - Indexed Summary

**Tier**: T2 (Runtime Architecture)
**Status**: Fundamental, invisible to users
**Size**: 1009 lines → ~160 lines (16% compression) [Note: complex topic]

## Overview [L19-51]
**Anti-jank mechanism** across:
- Time discontinuities (scrub, loop, seek, rate change)
- Patch edits (hot-swap, parameter change)
- Domain changes (count, reorder)

**Gauge invariance** - entirely runtime-only. Compiler never sees it. Only mapping changes.

**Critical**: Without this, edits break motion, loops pop, export doesn't match playback.

## Architecture Principles [L55-82]
1. **Invisible by Design**: Should "just work"
2. **Deterministic**: Same seed + TimeModel + edits + events → bit-identical output
3. **Performance-Critical**: Every materialized buffer, every target, every frame
   - Allocation-free (pooled)
   - SIMD-friendly (SoA)
   - Cacheable (stable keys)
   - Measurable (trace)

## Part 1: Phase Continuity (Time Gauge) [L85-280]

**Problem**: Time discontinuities cause phase jumps

**Operations causing discontinuities** [L91-99]:
- Scrubbing, seeking, looping, hot-swap, switching TimeRoots, playback speed, export stepping

**Solution**: Phase offset gauge

### Definitions [L114-128]
```
t_abs        - Absolute time from TimeRoot
t_model      - Time after TimeModel mapping
φ_base(t)    - Raw phase from t_model / period
φ_eff(t)     - Effective phase = wrap(φ_base(t) + Δφ)
Δφ           - Phase offset (persistent state)
wrap(x)      - x mod 1
```

### State Model [L144-162]
```typescript
interface TimeState {
  prevBasePhase: float;
  phaseOffset: float;    // Cumulative gauge term
}
```
Preserved across frames, hot-swap, export. Never reset except explicit action.

### Phase Reconciliation Rule [L165-186]
When discontinuity detected:
```
oldEff = wrap(prevBasePhase + phaseOffset)
newBase = φ_base(new_t)
phaseOffset += oldEff - newBase
```
**Guarantee**: φ_eff remains continuous [L185]

### Per-Frame Update [L189-211]
timeDerive step:
1. Check discontinuity
2. Reconcile offset (if wrapEvent)
3. Update prevBasePhase
4. Compute effective phase
5. Expose to SignalExpr
**Before** any evaluation [L211]

### Multi-Phase Support [L215-230]
Each TimeRoot: independent offset (phaseA_offset, phaseB_offset), reconciled independently

### What Compiler Sees [L233-244]
**Nothing**. Runtime gauge transform before timeDerive. IR unchanged.

### Determinism Guarantee [L247-263]
Export uses exact same rule. Given same seed/TimeModel/events → bit-identical phase

### Forbidden Patterns [L267-279]
❌ Reset phase on hot-swap
❌ Recompute from wall time
❌ Derive from frame index
❌ Re-zero on loop
❌ Skip reconciliation
❌ Let blocks see φ_base

## Part 2: Value Continuity (Parameter Gauge) [L282-447]

**Problem**: Hot-swap edits cause downstream jumps (e.g., radius 10→15 pops)

**Solution**: Additive gauge on materialized buffers

### Continuity Targets [L300-349]
**Field Targets**: Materialized buffers (scalar, vec2/vec3 SoA, color SoA)

**Field Target Keys**:
```typescript
interface FieldTargetKey {
  producer: { stepId, outSlot };
  semantic?: { role: 'position'|'radius'|'opacity'|'color'|'custom', name };
}
```

### Continuity Policies [L351-390]
```typescript
type ContinuityPolicy =
  | { kind: 'none' }
  | { kind: 'preserve', gauge: GaugeSpec }
  | { kind: 'slew', gauge, tauMs }
  | { kind: 'crossfade', windowMs, curve }
  | { kind: 'project', projector, post };
```

**Canonical Defaults**:
| Target | Policy |
|--------|--------|
| position | project+slew(120ms) |
| radius | slew(120ms) |
| opacity | slew(80ms) |
| color | slew(150ms) |
| custom | crossfade(150ms) |

### Additive Gauge [L410-446]
At hot-swap boundary:
```
X_eff[i] = X_base[i] + Δ[i]

Δ[i_new] = (mapped ? X_old_eff[i_old] - X_new_base[i_new] : 0)
```

## Part 3: Topology Continuity (Element Projection) [L449-586]

**Problem**: Domain count/reorder changes break element identity

**Solution**: Stable element IDs + mapping

### Domain Identity Contract [L461-477]
```typescript
interface DomainInstance {
  count: number;
  elementId?: Uint32Array;
  identityMode: 'stable'|'none';
  posHintXY?: Float32Array;
}
```

### ElementId Semantics [L481-501]
Stable across edits that preserve conceptual elements. New IDs allocated deterministically.

### Mapping State [L506-537]
- `identity` (fast path)
- `byId` (from oldId map → newId map)
- `byPosition` (nearest-neighbor fallback using posHint)

**Cache**: Mapping computed only when domain changed (not every frame)

### Crossfade Fallback [L587-614]
If identity broken or topology differs:
- **Buffer crossfade** (preferred): `lerp(old_eff[i], new_base[i], w(t))`
- **RenderFrame crossfade** (last resort): Keep old frame frozen, blend alpha

## Part 4: Slew (Continuous Relaxation) [L617-667]

Applied after gauge. Smooth transition toward new values.

**First-order low-pass**:
```
α = 1 - exp(-dt / tauMs)
y[i] = y[i] + α * (target[i] - y[i])
```

**Time constants**:
| Target | tauMs |
|--------|-------|
| opacity | 80ms |
| radius | 120ms |
| position | 120ms |
| color | 150ms |

**Vectorized**: SoA layout enables auto-vectorization

## Part 5: Performance Architecture [L670-762]

### Where Continuity Runs [L674-694]
Post-materialization pass as explicit scheduled steps:
- `StepContinuityMapBuild` (on swap/domain-change)
- `StepContinuityApply` (per-frame, targets with policy != none)

**Observable** by debugger [L697]

### Buffer Layout Canonicalization [L701-714]
| Type | Layout | Rationale |
|------|--------|-----------|
| Scalar | Float32Array | SIMD-friendly |
| vec2/vec3 | SoA {x[], y[], z[]} | Auto-vectorization |
| Color | SoA {r[], g[], b[], a[]} | Renderer layout |

### Buffer Pools [L717-737]
**Must never allocate per frame**. Continuity holds pooled buffers (Δ, y, target).

### Work Scaling [L765-777]
Per-frame: O(total_elements) with tight loops
**Typical**: 10k elements × 4 fields = 40k values/frame = 0.1-0.2ms

## Part 6: Integration Points [L780-857]

### Stable Target Keys [L783-803]
Key by semantic hash (role + block.stableId + port.name + domain.bindingIdentity)
Not by raw slot indices

### Debugger Observability [L807-824]
Emit ContinuityTraceEvent: mapping type, elements mapped, elements unmapped, maxJump, bufferOpsTimeUs

### Hot-Swap Integration [L827-855]
Evaluate old + new program at same t_model, rebind targets, build mapping, apply gauge/crossfade

### Export Integration [L858-878]
Export uses exact schedule + continuity steps. Determinism guarantee: export matches playback.

## Part 7: Hard Constraints [L920-999]

**Non-negotiable** (breaks determinism/perf if violated):

### 8.1 Time Source [L924-935]
**All continuity uses t_model_ms**, never wall time/frame index/external timestamps

### 8.2 Scheduled Steps [L938-947]
Continuity is explicit steps, not hidden inside evaluation

### 8.3 Element Identity [L950-960]
Either stable IDs or crossfade deterministically. No heuristics without fallback.

### 8.4 No Per-Frame Allocations [L963-973]
All buffers pooled. Never allocate/grow/shrink per frame.

### 8.5 Stable Keys [L976-986]
Continuity keys persist across recompiles. Not raw slot index/address.

### 8.6 Export Parity [L989-999]
Export uses same schedule + continuity. Never skip or simplify.

## Related
- [03-time-system](./03-time-system.md) - TimeRoot
- [05-runtime](./05-runtime.md) - RuntimeState
- [04-compilation](./04-compilation.md) - Schedule, materialization
- [Invariants](../INVARIANTS.md) - I2, I30, I31
