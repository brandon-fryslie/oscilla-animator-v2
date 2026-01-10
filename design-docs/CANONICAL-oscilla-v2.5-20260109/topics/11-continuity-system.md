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

Continuity operates on **every materialized buffer** for **every continuity target** on **every frame**. This must be:
- Allocation-free (pooled buffers)
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
- Looping finite time at boundary
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
t_model     // time after TimeModel mapping (finite, infinite, etc)

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

### 1.2 State Model

The runtime maintains persistent time gauge state:

```typescript
interface TimeState {
  prevBasePhase: float;   // Last frame's base phase
  phaseOffset: float;     // Cumulative phase offset (gauge term)
}
```

**This state is:**
- Preserved across frames
- Preserved across hot-swap
- Preserved across export stepping
- **Never** reset except by explicit user action

**Storage location**: `RuntimeState.timeState` (one per TimeRoot)

---

### 1.3 Phase Reconciliation Rule

When a time discontinuity is detected (TimeModel emits `wrapEvent = true`):

```typescript
// Capture old effective phase
const oldEff = wrap(prevBasePhase + phaseOffset);

// Compute new base phase
const newBase = φ_base(new_t);

// Adjust offset to preserve effective phase
phaseOffset += oldEff - newBase;
```

**Mathematical guarantee:**
```
wrap(prevBasePhase + oldOffset) == wrap(newBase + newOffset)
```

Therefore: **φ_eff remains continuous across the discontinuity.**

---

### 1.4 Per-Frame Update (timeDerive Step)

Every frame, the `timeDerive` schedule step:

```typescript
// 1. Check for discontinuity
if (timeModel.wrapEvent) {
  // Reconcile phase offset (see §1.3)
  reconcilePhaseOffset();
}

// 2. Update state
timeState.prevBasePhase = φ_base(current_t);

// 3. Compute effective phase
const phaseA = wrap(φ_base_A + phaseOffset_A);
const phaseB = wrap(φ_base_B + phaseOffset_B);

// 4. Expose to SignalExpr graph
// phaseA and phaseB enter the schedule as continuous signals
```

**Critical**: This happens **before** any SignalExpr evaluation. The patch never sees discontinuous phase.

---

### 1.5 Multi-Phase Support

Each TimeRoot produces independent phase rails (`phaseA`, `phaseB`). Each has its own offset:

```typescript
interface TimeState {
  prevBasePhase_A: float;
  phaseOffset_A: float;

  prevBasePhase_B: float;
  phaseOffset_B: float;
}
```

They are reconciled **independently** using the same rule.

---

### 1.6 What The Compiler Sees

**Nothing.**

Phase continuity is a **runtime gauge transform** applied inside `timeDerive` before any SignalExpr runs.

- The IR never changes
- The schedule never changes
- Only the mapping from `t_model → phase` changes

This is what makes it a **gauge**: a coordinate transformation that preserves observables.

---

### 1.7 Determinism Guarantee

Offline export uses **the exact same rule**.

Given:
- Same seed
- Same TimeModel
- Same discontinuity events

Then:
```
φ_eff(frame N) is bit-identical between live and export
```

**No drift is permitted.**

**Implementation requirement**: Export must replay discontinuity events at the same `t_model` values as live playback.

---

### 1.8 Forbidden Patterns

These **will** cause jank and are forbidden:

❌ Resetting phase on hot-swap
❌ Recomputing phase from wall time
❌ Deriving phase from frame index
❌ Re-zeroing phase on loop
❌ Skipping reconciliation
❌ Letting blocks see φ_base directly

Any implementation that violates these rules produces visible pops.

---

## Part 2: Value Continuity (Parameter Gauge)

### Problem Statement

When patches are edited (hot-swap), compiled constants or upstream values change. Without compensation, downstream signals/fields jump.

**Examples:**
- User edits `radius` from 10 → 15
- User changes color from red → blue
- User adjusts opacity from 0.8 → 1.0

Without continuity, these changes **pop** instantly. With continuity, they **transition** smoothly.

---

### 2.1 Continuity Targets

Continuity is only defined for specific target classes. Each has a canonical representation, allowed gauge, and smoothing strategy.

#### Field Targets

A **FieldTarget** is a materialized buffer set produced from a FieldExpr at a materialization step:

```typescript
// Scalar per-element
type ScalarField = Float32Array;  // f32[N]

// Vector per-element (SoA layout)
type Vec2Field = { x: Float32Array, y: Float32Array };
type Vec3Field = { x: Float32Array, y: Float32Array, z: Float32Array };

// Color per-element (SoA layout)
type ColorField = {
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  a: Float32Array
};

// Event-like per-element
// Events are discrete → explicitly NOT smoothed
```

#### Field Target Keys

Field targets are addressed by stable keys:

```typescript
interface FieldTargetKey {
  kind: 'field-buffer';
  producer: {
    stepId: StepId;
    outSlot: ValueSlot;  // or outSlots[] for multi-channel
  };
  semantic?: {
    role: 'position' | 'radius' | 'opacity' | 'color' | 'custom';
    name?: string;
  };
}
```

**The `semantic` field is required** whenever multiple buffers share the same shape (e.g., two different `Float32Array[100]` fields).

#### Signal Targets

Signals are treated as degenerate fields of arity 1 (or broadcast fields). The same machinery applies; runtime may special-case for speed.

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

#### Policy Definitions

**`none`**: No continuity applied. Value jumps instantly (default for internal fields).

**`preserve`**: Hard continuity at boundary. Inject gauge offset so effective value is continuous, then hold it forever.

**`slew`**: Continuous at boundary + relax to new value over time. Uses first-order low-pass filter.

**`crossfade`**: Fallback for unmappable topology. Blend old/new buffers over time window.

**`project`**: Topology-aware continuity. Map old elements to new elements by stable ID, then apply post-processing (usually slew).

---

### 2.3 Canonical Defaults (Engine-Wide)

These defaults apply when no UI override exists:

| Target | Policy | Notes |
|--------|--------|-------|
| `position` | `project + post:slew(tau=120ms)` | Map by element ID, then slew |
| `radius` | `slew(tau=120ms)` | Direct slew |
| `opacity` | `slew(tau=80ms)` | Fast response, clamped [0,1] |
| `color` | `slew(tau=150ms)` | Linear RGBA slew |
| `custom/untyped` | `crossfade(150ms)` | Safe fallback |

**These are not "optional"** - they are the system defaults.

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

For fields, gauge state is **per-element** unless you have a valid reduction (broadcast).

---

### 2.5 Additive Gauge (Canonical for Scalars/Vectors)

For a numeric/vector/color field buffer `X_base[i]`, produce:

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
    // OR inherit nearest neighbor if posHint available
  }
}
```

**Constraints:**
- For clamped domains (opacity [0,1]), clamp **after** gauge: `clamp01(x_base + Δ)`
- For angles/phase, use `phaseOffset01` gauge (wrap-aware)
- For non-additive types, gauge doesn't apply (fallback to crossfade)

---

## Part 3: Topology Continuity (Element Projection)

### Problem Statement

When domain count changes, elements are reordered, or topology changes, "smooth transition" requires **matching old elements to new elements**.

Without stable element identity, there's no principled continuity - only dissolve/crossfade.

---

### 3.1 Domain Identity Contract

Every Domain materialization must provide:

```typescript
interface DomainInstance {
  count: number;
  elementId?: Uint32Array;  // Optional only if identityMode="none"
  identityMode: 'stable' | 'none';
  posHintXY?: Float32Array; // Spatial hints for fallback mapping
}
```

**Constraint**: Domains that claim `identityMode="stable"` **must** emit deterministic `elementId` given:
- Domain parameters
- Seed
- (if stateful domain) its own preserved state

If `identityMode="none"`, the system **must not** attempt per-element projection; it must use crossfade (§3.5).

---

### 3.2 ElementId Semantics

**ElementId is stable across edits** that preserve the conceptual element set.

When user changes domain count:
- Existing IDs **must persist** where possible
- New IDs are allocated deterministically (seeded counter stream)

When user changes a mapper that reorders elements:
- IDs stay attached to the **conceptual element**, not the index

**Example (Grid Domain):**
```typescript
// Grid 3x3 → elementId = [0,1,2,3,4,5,6,7,8]
// User edits to 4x4 → elementId = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
// Elements 0-8 are SAME elements, 9-15 are NEW
```

This is what makes "edit radius smoothly" meaningful for fields.

---

### 3.3 Mapping State

```typescript
type MappingState =
  | { kind: 'identity', count: number }         // Same indices (fast path)
  | { kind: 'byId', newToOld: Int32Array }     // -1 if unmapped
  | { kind: 'byPosition', newToOld: Int32Array }; // Fallback using posHintXY
```

---

### 3.4 byId Mapping Build

**Inputs:**
- `old.elementId: Uint32Array`
- `new.elementId: Uint32Array`

**Algorithm:**

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

**Performance constraint**: Mapping is computed **only when domain identity changed**, not every frame.

**Cache key**: `hash(oldDomainKey, newDomainKey, mappingVersion)`

---

### 3.5 byPosition Fallback

If either side lacks `elementId` but provides `posHintXY`, build nearest-neighbor mapping:

```typescript
// 1. Build spatial hash of old positions (uniform grid in normalized space)
const spatialHash = buildSpatialHash(old.posHintXY);

// 2. For each new element, search neighboring cells
const newToOld = new Int32Array(new.count);
for (let i = 0; i < new.count; i++) {
  const pos = new.posHintXY[i];
  newToOld[i] = spatialHash.findNearest(pos); // or -1 if too far
}

return { kind: 'byPosition', newToOld };
```

**This is still deterministic and bounded** (max search radius).

---

### 3.6 New Element Initialization ("Birth")

When `newToOld[i] = -1` (unmapped element), deterministic initialization:

```typescript
// For gauge
Δ[i] = 0;  // Start at base value

// For slew
y[i] = X_new_base[i];  // Start at base, will relax from there

// For project+slew with posHint
y[i] = inheritNearestMappedNeighbor(i);  // Optional: smoother birth
```

**No randomness** unless explicitly seeded.

---

### 3.7 Crossfade (Fallback When Identity Broken)

Crossfade operates on **materialized buffers** or **assembled render frames**.

#### Buffer Crossfade (Preferred)

If base buffers have same format and count:

```typescript
X_out[i] = lerp(X_old_eff[i], X_new_base[i], w(t));

// w(t) is blend weight over time window
// Typical curve: smoothstep or ease-in-out over 150-250ms
```

#### RenderFrame Crossfade (Last Resort)

If buffer shapes differ:

```typescript
// 1. Keep last render frame frozen as FrameA
// 2. Render new frame as FrameB
// 3. Renderer draws both with alpha weights:
//    draw(FrameA, alpha = 1 - w(t))
//    draw(FrameB, alpha = w(t))
```

**Constraint**: Must be implemented in renderer with explicit pass ordering to remain deterministic.

---

## Part 4: Slew (Continuous Relaxation)

Slew is applied **after gauge** (or as its own policy). It provides smooth transition toward new target values.

### 4.1 First-Order Low-Pass Filter

For each element/component:

```typescript
const dt = t_model_ms - last_t_model_ms;
const α = 1 - Math.exp(-dt / tauMs);
y[i] = y[i] + α * (target[i] - y[i]);
```

Where:
- `target[i]` is the post-gauge base (or new base, depending on policy)
- `y[i]` is stored in continuity buffer state
- `tauMs` is time constant (smaller = faster response)

**Performance constraint**: Slew must be **vectorized** and operate over SoA buffers.

---

### 4.2 Canonical Time Constants

| Target | `tauMs` | Response |
|--------|---------|----------|
| `opacity` | 80ms | Fast (responsive to edits) |
| `radius` | 120ms | Medium (smooth but not sluggish) |
| `position` | 120ms | Medium (natural motion) |
| `color` | 150ms | Slow (avoid jarring color shifts) |

**These are defaults.** UI can override per-target.

---

### 4.3 Multi-Component Slew

For vector fields (vec2, vec3, color):

```typescript
// Slew each component independently (SoA layout)
for (let i = 0; i < count; i++) {
  x[i] = x[i] + α * (target_x[i] - x[i]);
  y[i] = y[i] + α * (target_y[i] - y[i]);
  z[i] = z[i] + α * (target_z[i] - z[i]);
}
```

**SoA layout enables auto-vectorization** (compiler or SIMD intrinsics).

---

## Part 5: Performance Architecture

If everything is fields, we must avoid per-node overhead and extra allocations.

### 5.1 Where Continuity Runs

Continuity is a **post-materialization pass** operating on buffers referenced by ValueSlots.

It is scheduled as explicit steps:

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

This keeps the model **deterministic** and **observable** by debugger.

---

### 5.2 Buffer Layout Canonicalization

To make continuity cheap:

| Type | Layout | Rationale |
|------|--------|-----------|
| Scalar | `Float32Array` | Linear scan, SIMD-friendly |
| vec2/vec3 | SoA `{ x[], y[], z[] }` | Auto-vectorization |
| Color | SoA `{ r[], g[], b[], a[] }` | Matches renderer layout |

**This enables:**
- Linear scans
- Minimal branching
- Easy SIMD/WASM later

---

### 5.3 Buffer Ownership and Pools

Continuity **must never allocate per frame**.

**Required infrastructure:**

```typescript
class BufferPool<T> {
  acquire(length: number, tag: string): TypedArray;
  release(buffer: TypedArray): void;
}
```

**Continuity state holds stable pooled buffers for:**
- `Δ` gauge buffers (if policy uses gauge)
- `y` slew buffers (if policy uses slew)
- `target` scratch (optional; can read directly from base buffer)

Materialization produces base buffers (also pooled). Continuity writes to **output buffers** (also pooled), then stores output slots pointing at those.

---

### 5.4 Cache Keys and Invalidations

Continuity depends on:
- Program identity (patch revision)
- Time continuity state
- Domain identity keys
- Policy parameters

**Cache key:**

```typescript
const cacheKey = hash(
  targetKey,
  policy,
  oldDomainKey,
  newDomainKey,
  mappingVersion,
  timeDiscontinuityVersion
);
```

**Mapping builds are cached.** Apply steps are per-frame but allocation-free.

---

### 5.5 Work Scaling

Per-frame cost: `O(total_elements_in_targets)` with tight loops.

**Control scope by:**
- Only marking continuity targets that are **user-visible** (position, color, radius, opacity, stroke width, etc.)
- Leaving internal fields as-is (no continuity overhead)
- Fusing operations (gauge + slew in one pass over buffers)

**Typical budget:**
- 10,000 elements × 4 fields (pos, radius, color, opacity) = 40k values/frame
- With vectorized slew: ~0.1-0.2ms on modern CPU

---

## Part 6: Integration Points

### 6.1 Stable Target Keys Under Graph Churn

**Problem**: Cannot key continuity to raw slot indices if slots renumber frequently.

**Solution**: Stable derivation

```typescript
const stableTargetId = hash(
  semantic.role,          // "position" | "radius" | etc.
  block.stableId,         // Stable block identifier
  port.name,              // Output port name
  domain.bindingIdentity  // Domain binding (if field)
);
```

**Compiler must emit** `sourceMap` / `slotMeta.debugName` sufficient to construct this deterministically.

**Runtime maintains:**
- `StableTargetId → current ValueSlot(s)` mapping per program
- Continuity state keyed by `StableTargetId`, not raw slot

**Slots become an implementation detail.** Continuity state persists across recompiles.

---

### 6.2 Debugger Observability

Continuity steps must emit trace events:

```typescript
interface ContinuityTraceEvent {
  timestamp: number;
  target: StableTargetId;
  mapping: 'identity' | 'byId' | 'byPosition' | 'crossfade';
  elementsMapped: number;        // Count of mapped elements
  elementsUnmapped: number;      // Count of new/unmapped elements
  maxJumpPrevented: number;      // L∞ norm (max value change absorbed)
  bufferOpsTimeUs: number;       // Performance timing
}
```

This is how power users **verify** it's doing the right thing.

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
  // Rebind target keys (sourceMap/slotMeta) old→new
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

```typescript
// Export loop
for (let frame = 0; frame < totalFrames; frame++) {
  const t_model_ms = frame * frameIntervalMs;

  // Execute same schedule as live playback
  executeSchedule(program, t_model_ms);

  // Continuity steps run as part of schedule
  // (StepContinuityApply for each target)

  // Capture output
  captureFrame(frame);
}
```

**Determinism guarantee**: Export is exact if:
- Same seed
- Same discontinuity events at same `t_model_ms`
- Same continuity policies

---

## Part 7: Rendering-Specific Notes

### 7.1 Particles (Instances)

Continuity targets are instance buffers:

```typescript
const targets = [
  { semantic: { role: 'position' }, policy: 'project+slew(120ms)' },
  { semantic: { role: 'radius' }, policy: 'slew(120ms)' },
  { semantic: { role: 'color' }, policy: 'slew(150ms)' },
  { semantic: { role: 'opacity' }, policy: 'slew(80ms)' }
];
```

**Layout**: SoA for GPU upload efficiency.

---

### 7.2 Paths

Continuity targets are usually **control fields** (path params, stroke width, color), not command buffers.

**Exception**: If you have stable path IDs and a path correspondence model, you can apply continuity to control points.

---

### 7.3 Shaders

Treat uniforms as signals and textures/buffers as fields. The same continuity system applies at uniform buffer and SSBO-equivalent layers.

---

## Part 8: Hard Constraints (Non-Negotiable)

These are **architectural invariants**. Violations break determinism or performance.

### 8.1 Time Source

**All continuity math uses `t_model_ms`.**

Never use:
- Wall time
- Frame index
- Timestamps from external sources

**Rationale**: Ensures export matches playback.

---

### 8.2 Scheduled Steps

**Continuity is expressed as explicit scheduled steps.**

Never:
- Apply continuity inside SignalExpr evaluation
- Apply continuity in "hidden" places
- Skip continuity steps

**Rationale**: Makes continuity observable, debuggable, and deterministic.

---

### 8.3 Element Identity

**Domains either provide stable element IDs or continuity degrades to crossfade deterministically.**

Never:
- Guess element correspondence
- Use heuristics without fallback
- Produce non-deterministic mappings

**Rationale**: Ensures export matches playback.

---

### 8.4 No Per-Frame Allocations

**All buffers are pooled.**

Never:
- Allocate new TypedArrays per frame
- Grow/shrink buffers dynamically
- Use non-pooled scratch space

**Rationale**: GC pauses kill frame timing.

---

### 8.5 Stable Keys

**Continuity keys must be stable across recompiles.**

Never:
- Key by raw slot index
- Key by memory address
- Key by compile-time-only identifiers

**Rationale**: Continuity state must persist across hot-swap.

---

### 8.6 Export Parity

**Export uses the same schedule and continuity steps.**

Never:
- Skip continuity in export
- Use different policies in export
- "Simplify" continuity for export

**Rationale**: Export must match playback bit-for-bit.

---

## See Also

- [03-time-system](./03-time-system.md) - TimeRoot and phase rails
- [05-runtime](./05-runtime.md) - RuntimeState and execution model
- [04-compilation](./04-compilation.md) - Schedule and materialization
- [INVARIANTS.md](../INVARIANTS.md) - I2, I30, I31
- [GLOSSARY.md](../GLOSSARY.md) - Gauge, Continuity, Hot-Swap
