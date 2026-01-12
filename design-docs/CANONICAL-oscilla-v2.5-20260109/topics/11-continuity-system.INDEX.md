---
index_type: topic
source_file: 11-continuity-system.md
source_hash: f5c07ebcbcff
parent: ../INDEX.md
tier: T1
last_generated: 2026-01-12
---

# INDEX: Continuity System (Anti-Jank Architecture)

**Tier**: T1 (Foundational)
**Source**: `topics/11-continuity-system.md`
**Hash**: f5c07ebcbcff

---

## 1. Structural Map

### Top-Level Sections
1. **Overview** (§0) - Problem statement: preventing jank across time discontinuities, patch edits, and domain changes
2. **Why This Is Non-Optional** (§1-2) - Necessity of continuity for usable animation system
3. **Architecture Principles** (§3) - Invisibility, determinism, performance
4. **Part 1: Phase Continuity** (§4) - Time gauge mechanism
5. **Part 2: Value Continuity** (§5) - Parameter gauge and smoothing strategies
6. **Part 3: Topology Continuity** (§6) - Element projection and mapping
7. **Part 4: Slew** (§7) - Continuous relaxation filter
8. **Part 5: Performance Architecture** (§8) - Buffer pools, caching, work scaling
9. **Part 6: Integration Points** (§9) - Stable keys, debugger observability, hot-swap, export
10. **Part 7: Rendering-Specific Notes** (§10) - Particles, paths, shaders
11. **Part 8: Hard Constraints** (§11) - Non-negotiable architectural rules

### Primary Concepts
- **Phase Continuity**: Time gauge offset (Δφ) ensuring effective phase remains continuous across time discontinuities
- **Value Continuity**: Parameter gauge (Δ) ensuring field values transition smoothly on hot-swap
- **Topology Continuity**: Element identity and mapping for handling domain changes
- **Slew**: First-order low-pass filter for smooth relaxation toward new values

---

## 2. Core Invariants

| Invariant | Reference | Meaning |
|-----------|-----------|---------|
| I2 | §3.2 | Gauge invariance: effective values stay continuous despite discontinuities |
| I30 | §3.1-3.2 | Continuity is deterministic: same seed/events → bit-identical export |
| I31 | §6.4 | Export matches playback: identical schedule and continuity steps |

---

## 3. Key Definitions & Terminology

### Time Concepts
- `t_abs`: Absolute time in milliseconds from TimeRoot
- `t_model`: Time after TimeModel mapping (finite, infinite, or infinite-looping)
- `φ_base(t)`: Raw phase from TimeRoot (`t_model / period`)
- `φ_eff(t)`: Effective phase seen by patch (`wrap(φ_base(t) + Δφ)`)
- `Δφ` (delta-phi): Phase offset gauge state, preserves continuity across jumps
- `wrapEvent`: Signal from TimeModel indicating time discontinuity detected

### Value Concepts
- **FieldTarget**: Materialized buffer set from a FieldExpr at materialization step
- **FieldTargetKey**: Stable identifier for a field target (stepId, outSlot, semantic role)
- **ContinuityPolicy**: Declarative rule for smoothing a target (none | preserve | slew | crossfade | project)
- **Gauge**: Operation composing with base value to produce effective value (add | mul | affine | phaseOffset01)
- **Slew**: First-order low-pass filter applying continuous relaxation

### Topology Concepts
- **DomainInstance**: Materialized domain with count, stable elementId, identity mode
- **ElementId**: Stable identifier for conceptual element across edits
- **MappingState**: Computed correspondence between old and new domains (identity | byId | byPosition)
- **newToOld[i]**: Array mapping new element index to old element index (-1 if unmapped)

---

## 4. Algorithms & Data Structures

### Phase Reconciliation (§1.3)
```
When wrapEvent detected:
  oldEff = wrap(prevBasePhase + phaseOffset)
  newBase = φ_base(new_t)
  phaseOffset += oldEff - newBase
Guarantees: φ_eff remains continuous
```

### Additive Gauge Initialization (§2.5)
```
For each element i:
  if i_old = map(i_new) ≥ 0:
    Δ[i_new] = X_old_eff[i_old] - X_new_base[i_new]
  else:
    Δ[i_new] = 0  (or inherit nearest if posHint available)
```

### byId Mapping Build (§3.4)
```
1. Hash map oldId → oldIndex
2. For each new element, look up its ID in old set
3. newToOld[i] = oldIdx or -1 if not found
```

### byPosition Fallback (§3.5)
```
Build spatial hash of old positions
For each new element, find nearest neighbor in old set
Return -1 if too far
```

### Slew Filter (§4.1)
```
For each component/element:
  α = 1 - exp(-dt / tauMs)
  y[i] = y[i] + α * (target[i] - y[i])
```

### Stable Target Key Derivation (§6.1)
```
stableTargetId = hash(
  role,                      // "position" | "radius" | etc.
  block.stableId,            // Stable block identifier
  port.name,                 // Output port name
  domain.bindingIdentity     // Domain binding
)
```

---

## 5. Data Flow & State Management

### Per-TimeRoot State (§1.2)
```typescript
interface TimeState {
  prevBasePhase: float        // Last frame's base phase
  phaseOffset: float          // Cumulative phase offset (gauge)
  prevBasePhase_A, _B: float  // Multi-phase support
  phaseOffset_A, _B: float    // Each phase rail independent
}
```

### Continuity State
```typescript
// One per FieldTarget
interface ContinuityState {
  policy: ContinuityPolicy
  gaugeBuffer?: Δ[]           // Additive gauge offsets
  slewBuffer?: y[]            // Slew output
  targetBufferPool: BufferPool
}
```

### Mapping Cache
```
Key: hash(oldDomainKey, newDomainKey, mappingVersion)
Value: MappingState (identity | byId | byPosition)
Invalidated on: domain identity change
```

### Per-Frame Schedule Steps
```
StepContinuityMapBuild
  inputs: oldDomain, newDomain
  output: MappingState
  frequency: on domain change

StepContinuityApply
  inputs: target, policy, baseSlot
  output: outputSlot with continuity applied
  frequency: every frame
```

---

## 6. Integration Points & Boundaries

### Runtime Schedule Integration (§5.1, 6.3-6.4)
- Phase reconciliation happens in `timeDerive` step **before** SignalExpr evaluation
- Continuity steps (`StepContinuityMapBuild`, `StepContinuityApply`) are explicit schedule entries
- Export uses identical schedule and continuity steps as live playback

### Hot-Swap Boundary (§6.3)
1. Evaluate old program at `t_model_ms`
2. Evaluate new program at same `t_model_ms`
3. Rebind target keys (sourceMap/slotMeta) old → new
4. Build domain mapping
5. Initialize/adjust continuity state (gauge or crossfade)

### Compiler/IR Boundary (§1.6, 1.8)
- Continuity is **runtime gauge transform only** - IR never changes
- Compiler emits sourceMap/slotMeta for stable target key derivation
- No continuity logic embedded in SignalExpr

### Buffer/Field Interface (§2.1, 5.2-5.3)
- Input: FieldExpr evaluated to base buffers (SoA layout)
- Continuity: Apply gauge/slew operations in-place or to pooled output buffers
- Output: Materialized field buffers with continuity applied

---

## 7. Constraints & Non-Negotiables

### Hard Constraints (§8)
| Rule | Violation Consequence | Enforcement |
|------|----------------------|-------------|
| **Use t_model_ms only** | Export diverges from playback | Code review, invariant tests |
| **Express as scheduled steps** | Non-deterministic, non-observable | Architecture review |
| **Element identity stable** | Unprincipled continuity or crossfade | Domain contract enforcement |
| **No per-frame allocations** | GC pauses, frame timing failures | Pool architecture, code review |
| **Keys stable across recompiles** | Continuity state lost on hot-swap | Hash derivation rules |
| **Export parity required** | Visual mismatch between live and export | Unified schedule + invariant tests |

### Optional Overrides
- **Canonical time constants** (§4.2): Per-target slew tau (opacity: 80ms, radius/position: 120ms, color: 150ms)
- **Gauge types** (§2.4): UI can override gauge strategy (add | mul | affine)
- **Policy selection** (§2.2): UI can override policy (preserve | slew | crossfade | project)
- **Buffer layout**: Must be SoA for vec/color, but specific field assignments flexible

### Forbidden Patterns
❌ Resetting phase on hot-swap
❌ Recomputing phase from wall time
❌ Deriving phase from frame index
❌ Re-zeroing phase on loop
❌ Skipping reconciliation
❌ Letting blocks see φ_base directly
❌ Allocating new TypedArrays per frame
❌ Guessing element correspondence non-deterministically

---

## Index Metadata

| Attribute | Value |
|-----------|-------|
| Source File | `topics/11-continuity-system.md` |
| Source Hash | f5c07ebcbcff |
| Tier | T1 (Foundational) |
| Topic Order | 11 |
| Parent | `../INDEX.md` |
| Related Topics | 03-time-system, 05-runtime, 04-compilation |
| Key Invariants | I2, I30, I31 |
| Glossary Terms | Gauge, Continuity, Hot-Swap |
| Generated | 2026-01-12 |

---

## Cross-References

**Depends on**:
- [03-time-system](./03-time-system.md) - TimeRoot, phase rails, wrapEvent semantics
- [05-runtime](./05-runtime.md) - RuntimeState, schedule execution, materialization
- [04-compilation](./04-compilation.md) - Schedule structure, ValueSlot, sourceMap

**Referenced by**:
- Integration specifications for rendering systems
- UI layer specifications for continuity policy overrides
- Export specifications for determinism requirements

**Glossary**:
- [Gauge](../GLOSSARY.md#gauge) - Coordinate transformation preserving observables
- [Continuity](../GLOSSARY.md#continuity) - Lack of visual discontinuity under edit/time operations
- [Hot-Swap](../GLOSSARY.md#hot-swap) - Patch replacement while preserving effective state

**Invariants**:
- [I2: Gauge Invariance](../INVARIANTS.md#i2-gauge-invariance) - Effective values stay continuous
- [I30: Continuity is Deterministic](../INVARIANTS.md#i30-continuity-is-deterministic) - Export bit-identical
- [I31: Export Matches Playback](../INVARIANTS.md#i31-export-matches-playback) - Same observables in both modes
