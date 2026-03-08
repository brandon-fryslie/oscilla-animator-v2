---
parent: ../INDEX.md
topic: continuity-system
order: 11
---

# Continuity System (Anti-Jank Architecture)

> **The invisible foundation that makes Oscilla feel alive.**
>
> Users should be able to scrub, edit, loop, and hot-swap for a week without ever realizing this system exists. That's the goal.

**Related Topics**: [03-time-system](./03-time-system.md), [05-runtime](./05-runtime.md), [04-compilation](./04-compilation.md)
**Key Terms**: [Gauge](../GLOSSARY.md#gauge), [Continuity](../GLOSSARY.md#continuity), [Hot-Swap](../GLOSSARY.md#hot-swap)
**Relevant Invariants**: [I2](../INVARIANTS.md#i2-gauge-invariance), [I30](../INVARIANTS.md#i30-continuity-is-deterministic), [I31](../INVARIANTS.md#i31-export-matches-playback)

---

## Overview

The **Continuity System** is Oscilla's mechanism for preventing visual discontinuities ("jank") across:
- **Time discontinuities**: scrubbing, looping, seeking, rate changes
- **Patch edits**: hot-swap, parameter changes, topology changes
- **Domain changes**: element count changes, reordering

This is not a feature. This is a **gauge invariance** - a fundamental architectural property that makes the system usable.

**Critical**: This system is entirely **runtime-only**. The compiler never sees it. The IR never changes. Only the mapping from compiled values to exposed values changes.

---

## Why This Is Non-Optional

### Without Continuity

- Animation continuity is impossible
- Scrubbing cannot work
- Loops pop at boundaries
- Patch edits break motion
- Export cannot match playback
- Live editing becomes frustrating

### With Continuity

- Time becomes re-parameterized instead of reset
- Phase behaves like a conserved quantity
- All oscillators become time-transport invariant
- Edits feel responsive, not jarring
- The system feels alive

**This is what separates Oscilla from tools that feel mechanical.**

---

## Architecture Principles

### 1. Invisible by Design

Users should never think about continuity. It should be so well-integrated that:
- Scrubbing feels natural
- Edits feel smooth
- Loops are seamless
- The system "just works"

### 2. Deterministic

Given:
- Same seed
- Same TimeModel
- Same patch edit sequence
- Same discontinuity events

Output is **bit-identical** between live playback and export. No drift permitted.

### 3. Performance-Critical

Continuity operates on **every materialized channel** for **every continuity target** on **every frame**. This must be:
- Allocation-free (Arena-based)
- SIMD-friendly (SoA layouts)
- Cacheable (stable keys)
- Measurable (trace events)

---

## Part 1: Phase Continuity (Time Gauge)

### Problem Statement

When time discontinuities occur (scrub/loop/seek/hot-swap), the raw phase from TimeRoot jumps. Without compensation, all phase-driven animation jumps too.

**Operations that cause time discontinuities:**
- Scrubbing the playhead
- Jumping to a time position
- Hot-swapping patches
- Switching TimeRoots
- Changing playback speed
- Export frame stepping
- Time window resizing

### Solution: Phase Offset Gauge

**Core Invariant**: Effective phase must be continuous in time unless explicitly reset by user action.

Formally:
```
lim(t→t0⁻) φ_eff(t) = lim(t→t0⁺) φ_eff(t)
```

Even when `t_model` jumps.

---

### 1.1 Definitions

```typescript
// Time values
t_abs       // absolute time in milliseconds from TimeRoot
t_model     // time after TimeModel mapping ( infinite, etc)

// Phase values
φ_base(t)   // raw phase in ℝ, computed from t_model
φ_eff(t)    // effective phase seen by the patch
Δφ          // phase offset (persistent state)

// Operations
wrap(x)     // x mod 1  (range [0,1))
```

**TimeRoot produces base phase:**
```typescript
φ_base(t) = t_model / period
```

**System exposes effective phase:**
```typescript
φ_eff(t) = wrap( φ_base(t) + Δφ )
```

**All blocks consume φ_eff, never φ_base.**

---

## Part 2: Value Continuity (Parameter Gauge)

### Problem Statement

When patches are edited (hot-swap), compiled constants or upstream values change. Without compensation, downstream values jump.

**Examples:**
- User edits `radius` from 10 → 15
- User changes color from red → blue
- User adjusts opacity from 0.8 → 1.0

Without continuity, these changes **pop** instantly. With continuity, they **transition** smoothly.

---

### 2.1 Continuity Targets

Continuity is only defined for specific target classes. Each has a canonical representation, allowed gauge, and smoothing strategy.

#### Channel Targets

A **ChannelTarget** is a set of materialized Arena offsets produced from a ValueExpr:

```typescript
// Scalar (cardinality: one)
type ScalarValue = f32;

// Vector (SoA layout)
type Vec2Value = { x: f32, y: f32 };
type Vec3Value = { x: f32, y: f32, z: f32 };

// Color (SoA layout)
type ColorValue = {
  r: f32,
  g: f32,
  b: f32,
  a: f32
};
```

#### Channel Target Keys

Channel targets are addressed by stable keys:

```typescript
interface ChannelTargetKey {
  kind: 'arena-channel';
  producer: {
    blockId: BlockId;
    portId: PortId;
  };
  semantic?: {
    role: 'position' | 'radius' | 'opacity' | 'color' | 'custom';
    name?: string;
  };
}
```

**The `semantic` property is required** whenever multiple channels share the same shape.

#### Multi-Lane Targets

For many-lane instances, the same machinery applies across the entire SoA range. Runtime may special-case for speed.

---

### 2.2 Continuity Policies

Every target has **exactly one** declared policy. No "optional" behavior exists; the policy is always present (can be `"none"`).

```typescript
type ContinuityPolicy =
  | { kind: 'none' }
  | { kind: 'preserve', gauge: GaugeSpec }
  | { kind: 'slew', gauge: GaugeSpec, tauMs: number }
  | { kind: 'crossfade', windowMs: number, curve: CurveSpec }
  | { kind: 'project', projector: ProjectorSpec, post: PostSpec };
```

---

### 2.3 Canonical Defaults (Engine-Wide)

These defaults apply when no UI override exists:

| Target | Policy | Notes |
|--------|--------|-------|
| `position` | `project + post:slew(120ms)` | Map by element ID, then slew |
| `radius` | `slew(120ms)` | Direct slew |
| `opacity` | `slew(80ms)` | Fast response, clamped [0,1] |
| `color` | `slew(150ms)` | Linear RGBA slew |
| `custom/untyped` | `crossfade(150ms)` | Safe fallback |

---

### 2.4 Gauge Specifications

A gauge is an operation that composes with the base value to produce the effective value.

```typescript
type GaugeSpec =
  | { kind: 'add' }           // scalar/vec/linear RGBA: x_eff = x_base + Δ
  | { kind: 'mul' }           // scale continuity (rare): x_eff = x_base * Δ
  | { kind: 'affine' }        // x_eff = a*x_base + b (for clamped values)
  | { kind: 'phaseOffset01' } // specialized for phase (wrap-aware)
```

For many-lane instances, gauge state is **per-lane** unless you have a valid reduction (broadcast).

---

### 2.5 Additive Gauge (Canonical for Scalars/Vectors)

For a numeric/vector/color channel range `X_base[i]`, produce:

```typescript
X_eff[i] = X_base[i] + Δ[i]
```

**At hot-swap boundary:**

```typescript
// 1. Evaluate old effective output
const X_old_eff = evaluateOldProgram(t_model);

// 2. Evaluate new base output
const X_new_base = evaluateNewProgram(t_model);

// 3. Using mapping i_old = map(i_new):
for (let i_new = 0; i_new < newCount; i_new++) {
  const i_old = mapping.newToOld[i_new];

  if (i_old >= 0) {
    // Mapped: preserve old effective value
    Δ[i_new] = X_old_eff[i_old] - X_new_base[i_new];
  } else {
    // Unmapped (new element): start at base
    Δ[i_new] = 0;
  }
}
```

---

## Part 3: Topology Continuity (Element Projection)

### 3.2 ElementId Semantics

**ElementId is stable across edits** that preserve the conceptual element set.

When user changes domain count:
- Existing IDs **must persist** where possible.
- New IDs are allocated deterministically (seeded counter stream).

This is what makes "edit radius smoothly" meaningful for many-lane instances.

---

## Part 4: Slew (Continuous Relaxation)

---

## Part 5: Performance Architecture

If everything is data channels, we must avoid per-node overhead and extra allocations.

### 5.1 Where Continuity Runs

Continuity is a **GPU compute pass** operating on Arena offsets.

It is scheduled as explicit Naga blocks:

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
  baseOffset: number;
  outputOffset: number;
}
```

---

### 5.2 Buffer Layout Canonicalization

To make continuity cheap:

| Type | Layout | Rationale |
|------|--------|-----------|
| Scalar | `f32` | Linear scan, GPU-friendly |
| vec2/vec3 | SoA `{ x[], y[], z[] }` | Coalesced access |
| Color | SoA `{ r[], g[], b[], a[] }` | Matches renderer layout |

---

### 5.5 Work Scaling

Per-frame cost: `O(total_lanes_in_targets)` with parallel kernels.

---

## Part 6: Integration Points

### 6.1 Stable Target Keys Under Graph Churn

**Solution**: Stable derivation

```typescript
const stableTargetId = hash(
  semantic.role,          // "position" | "radius" | etc.
  block.stableId,         // Stable block identifier
  port.name,              // Output port name
  domain.bindingIdentity  // Domain binding
);
```

**Compiler must emit** `SourceMap` / `GpuLayout` metadata sufficient to construct this deterministically.

---

### 6.3 Hot-Swap Integration

**Hot-swap boundary** occurs at specific `t_model_ms`. Runtime must produce:

```typescript
// 1. Evaluate old program at t_model_ms
const oldFrame = evaluateProgram(oldProgram, t_model_ms);

// 2. Evaluate new program at same t_model_ms
const newFrame = evaluateProgram(newProgram, t_model_ms);

// 3. For each continuity target:
for (const target of continuityTargets) {
  // Rebind target keys old→new
  rebindTargetKey(target, oldProgram, newProgram);

  // Determine topology relation
  const mapping = buildMapping(
    oldFrame.getDomain(target),
    newFrame.getDomain(target)
  );

  // Initialize/adjust continuity state
  if (mapping.kind === 'identity' || mapping.kind === 'byId') {
    applyGauge(target, oldFrame, newFrame, mapping);
  } else {
    applyCrossfade(target, oldFrame, newFrame);
  }
}
```

---

### 6.4 Export Integration

**Export uses the exact same schedule and continuity steps.**

---

## Part 7: Rendering-Specific Notes

Treat uniforms as scalars and textures/buffers as channel ranges. The same continuity system applies at uniform buffer and storage buffer layers.

---

## Part 8: Hard Constraints (Non-Negotiable)

### 8.1 Time Source

**All continuity math uses `t_model_ms`.**

### 8.2 Scheduled Steps

**Continuity is expressed as explicit scheduled Naga blocks.**

### 8.3 Element Identity

**Domains either provide stable element IDs or continuity degrades to crossfade deterministically.**

### 8.4 No Per-Frame Allocations

**All state exists in the Arena.**

---

## See Also

- [03-time-system](./03-time-system.md) - TimeRoot and phase rails
- [05-runtime](./05-runtime.md) - Arena and execution model
- [04-compilation](./04-compilation.md) - Naga lowering and GpuLayout
- [INVARIANTS.md](../INVARIANTS.md) - I2, I30, I31
- [GLOSSARY.md](../GLOSSARY.md) - Gauge, Continuity, Hot-Swap
