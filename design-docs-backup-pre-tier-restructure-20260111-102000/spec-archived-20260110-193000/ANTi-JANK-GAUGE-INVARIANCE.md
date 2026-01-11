
## Response:
You are referring to **phase continuity offset**, not domain phase spreading.

This is a **time-space translation invariant** that keeps oscillators from jumping when the TimeModel is discontinuous.

The rule is:

```
phase(t) = frac( basePhase(t) + phaseOffset )
```

Where:

• `basePhase(t)` comes from the TimeRoot  
• `phaseOffset` is a persistent state value  
• `phase(t)` is what blocks actually see

* * *

What problem this solves
------------------------

Without this, these operations cause hard discontinuities:

• scrubbing  
• jumping the playhead  
• switching time roots  
• swapping patches  
• looping finite time  
• hot-reloading

Because `basePhase(t)` jumps.

The phase offset makes phase **gauge-invariant** under time remapping.

* * *

How it works
------------

When the TimeRoot reports a discontinuity (wrap, jump, seek, hot-swap), the system does:

```
phaseOffset += oldPhase - newBasePhase
```

So the effective phase stays continuous:

```
oldEffectivePhase = frac(oldBasePhase + oldOffset)
newEffectivePhase = frac(newBasePhase + newOffset)
old == new
```

Nothing jumps.

* * *

What state it lives in
----------------------

This offset is not per-oscillator.  
It is **global per TimeRoot** and stored in `RuntimeState.timeState`.

Conceptually:

```
timeState = {
  prevBasePhase
  phaseOffset
}
```

* * *

Why this is mandatory
---------------------

Without it:

• Offline export cannot match live playback  
• Scrubbing breaks animation continuity  
• Hot-swap creates visible pops  
• Loops jump at boundaries  
• Phase-based motion becomes unusable for editing

With it:

• Time becomes re-parameterized instead of reset  
• Phase behaves like a conserved quantity  
• All oscillators become time-transport invariant

* * *

Relationship to phaseA / phaseB
-------------------------------

`phaseA` is always:

```
phaseA = frac(basePhase + phaseOffset)
```

`phaseB` is the same for its own base phase.

Everything in the patch consumes **the corrected phase**, never the raw clock.

* * *

What the compiler sees
----------------------

Nothing.

This is a **runtime gauge transform** applied inside `timeDerive` before any SignalExpr runs.

The IR never changes.  
Only the mapping from time → phase does.

* * *

One-sentence definition
-----------------------

**Phase offset is a conserved gauge that makes phase continuous across time discontinuities while preserving determinism.**

That is the system.

## Prompt:
Give me the whole anti-jank perfectly phase offset never jumps comprehensive spec

## Response:
Below is the **complete, closed-form, engineering-grade specification** for the **Phase Continuity System** used by Oscilla to guarantee zero-jank animation under scrubbing, looping, hot-swap, export, and time-root changes.

This spec is **normative**.  
Any implementation that violates it will produce visual pops or nondeterminism.

* * *

Phase Continuity System
=======================

**(Anti-Jank Time Gauge Specification)**

1\. Definitions
---------------

Let:

```
t_abs       = absolute time in milliseconds from TimeRoot
t_model     = time after TimeModel mapping (finite, infinite, etc)
φ_base(t)   = raw phase in ℝ, computed from t_model
φ_eff(t)    = effective phase seen by the patch
Δφ          = phase offset (persistent state)
wrap(x)     = x mod 1  (range [0,1))
```

The TimeRoot produces **base phase**:

```
φ_base(t) = t_model / period
```

The system exposes **effective phase**:

```
φ_eff(t) = wrap( φ_base(t) + Δφ )
```

All blocks consume **φ\_eff**, never φ\_base.

* * *

2\. Invariant
-------------

For all frames, under all operations:

> **Effective phase must be continuous in time unless explicitly reset by user action.**

Formally:

```
lim(t→t0⁻) φ_eff(t) = lim(t→t0⁺) φ_eff(t)
```

even when `t_model` jumps.

* * *

3\. Time Discontinuity
----------------------

A **time discontinuity** is any event where:

```
t_model(new) ≠ t_model(old) + Δt
```

This occurs when:

• scrubbing  
• jumping the playhead  
• looping finite time  
• hot-swapping patches  
• switching TimeRoots  
• changing playback speed  
• export stepping  
• time window resizing

The TimeModel must emit a flag:

```
timeDerive.out.wrapEvent = true
```

whenever a discontinuity occurs.

* * *

4\. State
---------

The runtime maintains a persistent time gauge:

```
timeState = {
  prevBasePhase : float
  phaseOffset   : float
}
```

This state is:

• preserved across frames  
• preserved across hot-swap  
• preserved across export stepping

* * *

5\. Phase Reconciliation Rule
-----------------------------

When a discontinuity occurs:

```
oldEff = wrap( prevBasePhase + phaseOffset )
newBase = φ_base(new_t)

phaseOffset += oldEff - newBase
```

This guarantees:

```
wrap(prevBasePhase + oldOffset)
==
wrap(newBase + newOffset)
```

Therefore:

```
φ_eff remains continuous
```

* * *

6\. Per-Frame Update
--------------------

Every frame:

```
if wrapEvent:
    reconcile phaseOffset

prevBasePhase = φ_base(current_t)
```

Then:

```
phaseA = wrap( φ_base + phaseOffset )
```

This is what enters the SignalExpr graph.

* * *

7\. Multi-Phase Support (phaseA / phaseB)
-----------------------------------------

Each TimeRoot produces independent clocks:

```
φ_baseA(t)
φ_baseB(t)
```

Each has its own offset:

```
Δφ_A
Δφ_B
```

They are reconciled independently.

* * *

8\. Determinism Guarantee
-------------------------

Offline export uses the exact same rule.

Given:

• same seed  
• same TimeModel  
• same discontinuity events

Then:

```
φ_eff(frame N) is bit-identical between live and export
```

No drift is permitted.

* * *

9\. What Is Not Allowed
-----------------------

These are forbidden:

• Resetting phase on hot-swap  
• Recomputing phase from wall time  
• Deriving phase from frame index  
• Re-zeroing phase on loop  
• Skipping reconciliation  
• Letting blocks see φ\_base

Any of these causes jank.

* * *

10\. Why This Is Non-Optional
-----------------------------

This is not a visual trick.  
This is a **gauge invariance**.

Time is being re-parameterized.  
Phase is a conserved quantity under that transform.

Without this:

• animation continuity is impossible  
• scrubbing cannot work  
• loops pop  
• patch edits break motion  
• export cannot match playback

* * *

11\. Where It Lives
-------------------

This logic exists **only** in:

```
timeDerive step
RuntimeState.timeState
```

It is not in the compiler.  
It is not in blocks.  
It is not in IR.

It is part of the **time → phase mapping**.

* * *

12\. One-Line Rule
------------------

> **Phase is invariant under time remapping. We enforce that by maintaining a global phase offset that absorbs all discontinuities.**

That is the complete system.

## Prompt:
How can I absorb other kinds of jank?  I'd like to find some way to have a smooth transition between various patch edits, like if I change the radius or opacity of a field of elements, rather than 'jump', the shift is continuous

2/2

## Response:
You absorb “edit jank” the same way you absorbed time-jank: introduce a **gauge layer** that preserves a chosen observable across a discontinuity by injecting a compensating state term, and make that layer part of runtime hot-swap—not the patch.

There are three distinct classes of edit-jank, and they need three different mechanisms.

* * *

1) Parameter discontinuity (same topology, same domain): use **Value Reconciliation**
-------------------------------------------------------------------------------------

**Problem state change:** a compiled constant or upstream value jumps at hot-swap (radius/opacity/color), so downstream signal/field jumps.

**Runtime state to add (per affected slot or per “semantic parameter”):**

```
reconcileState[paramKey] = {
  prevValue: number | vec | color,
  offset:    number | vec | color
}
```

**Rule (additive gauge, like phase):**  
Let `x_base(t)` be the newly computed value after the edit. Expose:

```
x_eff(t) = x_base(t) + Δx
```

On hot-swap boundary:

```
oldEff = old x_eff (evaluated just before swap)
newBase = new x_base (evaluated just after swap at same t_model)

Δx += oldEff - newBase
```

Then `x_eff` is continuous at the boundary.

**Constraints (must be explicit):**

*   Only valid for quantities where an additive offset is meaningful: scalar, vec2/vec3, maybe linear-light RGB.
*   For bounded values (opacity 0..1), you still do additive but clamp after:  
    `x_eff = clamp01(x_base + Δx)`.
*   This is a _preserve-current-value_ policy. If you want “blend to new value”, use section 2.

**Where this lives:**

*   Runtime hot-swap boundary, as a reconciliation step that installs/updates offsets for a defined set of keys.
*   Not inside the patch.

* * *

2) Intentional change that should _transition_: use **Edit Slew / Crossfade**
-----------------------------------------------------------------------------

Reconciliation preserves old value exactly at the boundary, but it doesn’t move toward the new value over time. For “radius changed → glide,” you want a controlled relaxation.

**State:**

```
slewState[paramKey] = {
  y: current smoothed value,
  target: newBase,
  tauMs: time constant,
  lastTModelMs: ...
}
```

**Update per frame (first-order low-pass):**

```
dt = t_model - lastT
α = 1 - exp(-dt / tauMs)
y = y + α * (target - y)
```

Expose `y` as the effective parameter.

**When an edit happens:**

*   Keep `y` as-is (so continuity is automatic).
*   Set `target = newBase`.
*   Optionally change `tauMs` based on what changed (UI can choose fast/slow).

**Constraints:**

*   Deterministic only if dt is deterministic. Your scheduled runtime already guarantees this if you drive it from `t_model` (not wall time).
*   For fields: you can slew _a control signal_ that drives the field, or you can slew per-element buffers (expensive). Prefer slewing upstream scalars/vectors and re-materializing.

**Where this lives:**

*   As a standard runtime “smoother” facility keyed by stable identifiers (below).

* * *

3) Topology / domain discontinuity (N changes, IDs change): use **State Projection**
------------------------------------------------------------------------------------

If you change the domain count, reorder particles, or swap a generator, “smooth” requires matching old elements to new elements.

**You need stable element identity**, not just indices. Without this, there is no principled continuity—only a dissolve.

### 3A) Minimal viable rule (works now): **Crossfade the whole render output**

When identity is unknown:

*   Keep last frame’s render buffers as `FrameA`
*   Compute new as `FrameB`
*   Crossfade in the renderer for `T_ms`:  
    `out = lerp(FrameA, FrameB, w(t))`

This produces continuity but not physically meaningful motion.

### 3B) Proper rule (next level): **Stable IDs + field reprojection**

Require domains optionally produce:

```
elementId[i] : u32  // stable across edits when possible
```

Then for any field you want continuity for (pos, radius, color):

*   Build a mapping oldId → oldIndex
*   For each new element id:
    *   if id existed: seed new smoothed state from old state
    *   else: initialize from defaults

This is the same mechanism as your `stateId→offset` layout idea, but lifted to element-granularity.

**Constraints:**

*   Domains must define how IDs are generated (grid: deterministic; particle sim: persistent; random: seeded).
*   If IDs change, fall back to 3A.

* * *

4) Keying: how the runtime knows what to reconcile/slew
-------------------------------------------------------

You need a canonical key space, or you’ll get non-reproducible behavior.

Define:

```
ReconcileKey =
  { kind: "slot", slot: ValueSlot }
| { kind: "port", blockId, portName }         // only if stable across compiles
| { kind: "semantic", namespace, name }       // e.g. "renderer.instances2d.opacity"
```

**Rule:** runtime reconciliation is keyed only by a stable identifier produced by the compiler/sourceMap. If you don’t have a stable key, you cannot guarantee continuity.

Given your direction, the simplest is:

*   Use `slot` keys for signal outputs (fast, deterministic).
*   Use `stateLayout` keys for stateful things.
*   Use render sink input slots for “user facing knobs.”

* * *

5) What to implement first (minimal foundation)
-----------------------------------------------

To get “radius/opacity edits don’t jump” with high leverage:

1.  **Hot-swap boundary hook** that can evaluate old program and new program at the same `t_model` for a set of watched slots.
2.  **Additive reconciliation offsets** for a small set of scalar signal slots (opacity, radius, global hue, etc).
3.  **Slew** (one-pole) per reconciled key with a default `tauMs` (e.g. 80–200ms) and an override for UI gestures.
4.  **Renderer crossfade** fallback when keying fails (frame-level fade over 100–250ms).

This yields continuity for most UX-visible edits without requiring element identity.

* * *

6) Hard constraints to keep it sane
-----------------------------------

*   Reconciliation and slew operate on **t\_model**, not wall time.
*   They run in runtime, not compiler, not patch.
*   They must be keyed by stable identifiers; otherwise behavior is undefined.
*   They must be deterministic and replayable (export uses same logic).
*   They must not change global time; they only adjust exposed values.

That is the complete design space for absorbing non-time jank under patch edits.

## Prompt:
I don't want the 'minimal foundation'.  I want the complete elaboration.  Don't bother with minimal.  And so far, almost everything is a field.  Does that change anything?  How do I keep it performant?

## Response:
If “almost everything is a field,” the anti-jank system must operate primarily on **FieldExpr outputs and their materialized buffers**, not on scalar Signal slots. That changes two things:

1.  continuity is usually a **vector-valued function over a domain**, not a single value, so the “gauge” term becomes **per-element** (or at least per-domain-region), and
2.  performance hinges on doing continuity work **at materialization boundaries** (buffer-level, SIMD-friendly), not by wrapping every field evaluation.

Below is the complete, implementation-grade spec: states, transitions, constraints, and the performance architecture that makes it feasible.

* * *

Anti-Jank Continuity System
===========================

Scope
-----

*   Applies to all patch edits/hot-swaps and to transport discontinuities (scrub/seek/rate changes), **except Global Time authority** (TimeRoot remains authoritative).
*   Guarantees **deterministic** playback and export: same patch edit sequence + same time inputs → same output buffers.

Definitions
-----------

*   **t\_model\_ms**: simulator time used by scheduler and by all continuity mechanisms.
*   **Field**: `FieldExpr<T>` evaluated over a **Domain**.
*   **Materialization**: producing typed buffers from fields for render and downstream consumers.
*   **Continuity Key**: stable identifier for “the thing we want to not jump.”

* * *

1) Continuity Targets
   =====================

Continuity is only defined for specific target classes. Each has a canonical representation, an allowed gauge, and a smoothing strategy.

1.1 Field Targets
-----------------

A **FieldTarget** is a materialized buffer set produced from a field expression at a materialization step:

*   Scalar per-element: `f32[N]`, `f64[N]`
*   Vector per-element: `f32x2[N]`, `f32x3[N]`, `f32x4[N]` (stored as SoA or AoS; canonical below)
*   Color per-element: `RGBA_f32` stored as 4 SoA channels (per your Option C direction)
*   Event-like per-element: explicitly _not smoothed_ (events are discrete)

Field targets are addressed by:

```
FieldTargetKey = {
  kind: "field-buffer",
  producer: { stepId, outSlot | outSlots[] },   // materialize step output slot(s)
  semantic?: { role: "position"|"radius"|"opacity"|"color"|"custom", name?: string },
}
```

The `semantic` sub-key is required for correctness whenever multiple buffers share the same shape.

1.2 Signal Targets
------------------

Signals still exist, but are treated as degenerate fields of arity 1 or broadcast fields. The same machinery applies; the runtime may special-case for speed.

* * *

2) Continuity Policy Model (No Options at Runtime)
   ==================================================

Every target has exactly one declared policy. No “optional” behavior exists; the policy is always present (can be “none”).

```
ContinuityPolicy =
  | { kind: "none" }
  | { kind: "preserve", gauge: GaugeSpec }                      // hard continuity at boundary
  | { kind: "slew", gauge: GaugeSpec, tauMs: number }           // continuous + relax to new
  | { kind: "crossfade", windowMs: number, curve: CurveSpec }   // fallback for unmappable topology
  | { kind: "project", projector: ProjectorSpec, post: PostSpec } // topology-aware
```

### Canonical defaults (engine-wide)

*   position: `project + post:slew(tau=120ms)`
*   radius: `slew(tau=120ms)`
*   opacity: `slew(tau=80ms)` (clamp 0..1)
*   color: `slew(tau=150ms)` (linear RGBA)
*   custom/untyped: `crossfade(150ms)`

These defaults are not “optional”; they are the system defaults when no UI override exists.

* * *

3) Stable Identity: The Non-Negotiable Requirement for Field Continuity
   =======================================================================

If you want continuity beyond “dissolve between frames,” you must define element identity.

3.1 Domain Identity Contract
----------------------------

Every Domain materialization must provide:

```
DomainInstance = {
  count: u32,
  elementId?: u32[count],          // optional only if the domain declares "identityMode=none"
  identityMode: "stable" | "none",
  // optional: spatial hints for fallback mapping
  posHintXY?: f32x2[count],
}
```

**Constraint:** domains that claim `identityMode="stable"` must emit deterministic elementId given:

*   domain parameters,
*   seed,
*   (if stateful domain) its own preserved state.

If `identityMode="none"`, the system may not attempt per-element projection; it must use crossfade (Section 7).

3.2 ElementId Semantics
-----------------------

*   ElementId is stable across edits that preserve the conceptual element set.
*   When the user changes domain count:
    *   existing ids must persist where possible,
    *   new ids are allocated deterministically (seeded counter stream).
*   When the user changes a mapper that reorders elements, ids stay attached to the conceptual element, not index.

This is what makes “edit radius smoothly” meaningful for fields.

* * *

4) The Continuity State Machine
   ===============================

Continuity is driven by **hotSwap** events and by **transport discontinuity** events.

4.1 States
----------

For each `FieldTargetKey`, runtime stores:

```
ContinuityState = {
  policy: ContinuityPolicy,
  // last-known resolved mapping between old/new domains for this target
  mapping: MappingState,
  // gauge state
  gauge: GaugeState,
  // smoothing state
  smooth: SmoothState,
  // snapshots
  prev: SnapshotRef,
  curr: SnapshotRef,
}
```

Snapshots are not “copies of everything”; they are references into the frame cache / buffer pool.

4.2 Transitions
---------------

### On each frame

1.  Execute schedule producing fresh materializations and assembled render IR.
2.  For each target with policy != none, apply continuity transform at the **buffer stage** (not at expression stage).
3.  Publish post-continuity buffers to consumers (renderer, downstream steps).

### On hotSwap(oldProgram → newProgram)

A “swap boundary” occurs at a specific `t_model_ms`. The runtime must produce:

*   `OldFrame`: evaluation of old program at `t_model_ms` (or last executed frame if you enforce swap at frame boundary).
*   `NewBaseFrame`: evaluation of new program at the same `t_model_ms`.

Then for each continuity target:

*   Rebind target keys (sourceMap/slotMeta) old→new.
*   Determine topology relation:
    *   same domain identity → allow `project`/`preserve`/`slew`
    *   identity lost → force `crossfade`
*   Initialize/adjust continuity state.

### On scrub/seek/rate change

Same mechanics as hotSwap, but the “old program” equals “new program”; the discontinuity is in time. This is where your phase-offset style “gauge” originated.

* * *

5) Gauge: How “Preserve” Works for Fields
   =========================================

For fields, “preserve” means: **the effective field output is continuous at the boundary**.

5.1 GaugeSpec
-------------

A gauge is an operation that composes with the base value:

```
GaugeSpec =
  | { kind: "add" }                         // scalar/vec/linear RGBA
  | { kind: "mul" }                         // scale continuity (rare)
  | { kind: "affine" }                      // x ↦ a*x + b (for opacity/radius)
  | { kind: "phaseOffset01" }               // specialized for phase
```

For fields, gauge state is per-element unless you have a valid reduction.

5.2 Field Additive Gauge (canonical)
------------------------------------

For a numeric/vector/color field buffer `X_base[i]`, produce:

`X_eff[i] = X_base[i] + Δ[i]`

At swap boundary:

*   Evaluate old effective output: `X_old_eff[i_old]`
*   Evaluate new base output: `X_new_base[i_new]`
*   Using mapping `i_old = map(i_new)`:
    *   if mapped: set `Δ[i_new] = X_old_eff[i_old] - X_new_base[i_new]`
    *   if unmapped (new element): set `Δ[i_new] = 0` or “inherit nearest” (see 6.4)

**Constraints:**

*   For clamped domains (opacity), clamp after gauge.
*   For angles/phase, do not use add on wrapped values unless you normalize with unwrap logic.

* * *

6) Projection: How to Map Old Field → New Field When Topology Changes
   =====================================================================

Projection is the core of non-toy continuity for fields.

6.1 MappingState
----------------

```
MappingState =
  | { kind: "identity", count: u32 }                    // same indices
  | { kind: "byId", newToOld: i32[newCount] }          // -1 if none
  | { kind: "byPosition", newToOld: i32[newCount] }    // fallback using posHintXY
```

6.2 byId Mapping Build
----------------------

Inputs:

*   old.elementId\[u32\], new.elementId\[u32\]  
    Build:
*   hash map oldId → oldIndex (open addressing, u32 keys)  
    Compute:
*   newToOld\[i\] = oldIndex or -1

**Performance constraint:** mapping is computed only when domain identity changed, not every frame. Cache key: `(oldDomainKey, newDomainKey)`.

6.3 byPosition Fallback
-----------------------

If either side lacks elementId but provides `posHintXY`, you may build nearest-neighbor mapping:

*   Build grid hash of old positions (uniform grid in normalized space).
*   For each new element, search neighboring cells.

This is still deterministic and bounded.

6.4 New Element Initialization (“Birth”)
----------------------------------------

When `newToOld[i] = -1`, you need deterministic initialization for continuity state:

*   For gauge: `Δ[i]=0`
*   For slew: set `y[i]=X_new_base[i]` (starts at base)
*   For project+slew: set `y[i]=X_new_base[i]` unless you choose to inherit nearest mapped neighbor (requires posHint)

No randomness here unless explicitly seeded.

* * *

7) Crossfade: The Correct Fallback When Identity Is Broken
   ==========================================================

Crossfade operates on **materialized buffers** and/or on **assembled render frame**.

7.1 Buffer Crossfade (preferred)
--------------------------------

If base buffers have same format and count:  
`X_out = lerp(X_old_eff, X_new_base, w(t))`

7.2 RenderFrame Crossfade (last resort)
---------------------------------------

If buffer shapes differ:

*   Keep last render frame’s passes/buffers frozen as FrameA.
*   Render new frame as FrameB.
*   Renderer draws both with alpha weights.

**Constraint:** this must be implemented in the renderer with explicit pass ordering to remain deterministic.

* * *

8) Slew: The Continuous Relaxation Mechanism for Fields
   =======================================================

Slew is applied after gauge (or as its own policy).

For each element/component:

```
dt = t_model_ms - last_t_model_ms
α = 1 - exp(-dt / tauMs)
y[i] = y[i] + α * (target[i] - y[i])
```

Where:

*   `target[i]` is the post-gauge base, or the new base (depending on policy)
*   `y[i]` is stored in continuity buffer state

**Performance constraint:** slew must be vectorized and operate over SoA buffers.

* * *

9) Performance Architecture (How This Stays Fast)
   =================================================

If everything is fields, you must avoid per-node overhead and avoid extra allocations.

9.1 Where Continuity Runs
-------------------------

Continuity is a **post-materialization pass** operating on buffers referenced by ValueSlots.

It is scheduled as explicit steps:

*   `StepContinuityMapBuild` (rare, on swap / domain-change)
*   `StepContinuityApply` (per frame for targets with policy != none)

This keeps the model deterministic and observable by debugger.

9.2 Buffer Layout Canonicalization
----------------------------------

To make continuity cheap:

*   Numeric scalars: `Float32Array` (unless you explicitly need f64)
*   vec2/vec3: SoA (`x[]`, `y[]`, `z[]`)
*   color: SoA (`r[] g[] b[] a[]`) per your renderer plan

This enables:

*   linear scans,
*   minimal branching,
*   easy SIMD/WASM later.

9.3 Buffer Ownership and Pools
------------------------------

Continuity should never allocate per frame.

You need:

*   `BufferPool<f32>` keyed by `(length, tag)`
*   continuity state holds **stable pooled buffers** for:
    *   `Δ` gauge buffers (if needed)
    *   `y` slew buffers
    *   `target` scratch (optional; you can read target directly from base buffer)

Materialization produces base buffers (also pooled). Continuity writes to **output buffers** (also pooled), then stores output slots pointing at those.

9.4 Cache Keys and Invalidations
--------------------------------

Continuity depends on:

*   program identity (patch revision)
*   time continuity state
*   domain identity keys
*   policy params

Define:

```
ContinuityCacheKey = hash(
  targetKey,
  policy,
  oldDomainKey,
  newDomainKey,
  mappingVersion,
  timeDiscontinuityVersion
)
```

Mapping builds are cached; apply steps are per-frame but are allocation-free.

9.5 Work Scaling
----------------

Per frame cost is `O(total_elements_in_targets)` with tight loops.

You control scope by:

*   only marking continuity targets that are user-visible (position, color, radius, opacity, stroke width, etc)
*   leaving internal fields as-is
*   fusing operations (gauge + slew in one pass over buffers)

* * *

10) Integration with Hot-Swap and Debug History
    ===============================================

10.1 Stable Target Keys Under Graph Churn
-----------------------------------------

You cannot key continuity to raw slot indices if slots renumber frequently. You need a stable derivation:

```
StableTargetId = hash(
  semantic role + producing block stable id + output port name + domain binding identity
)
```

Compiler must emit `sourceMap` / `slotMeta.debugName` sufficient to construct this deterministically.

Runtime then maintains:

*   `StableTargetId → current ValueSlot(s)` mapping per program
*   continuity state keyed by StableTargetId, not raw slot

Slots become an implementation detail; continuity state persists across recompiles.

10.2 Debugger Observability
---------------------------

Continuity steps must emit trace events:

*   mapping chosen (identity/byId/byPos/crossfade)
*   % elements mapped
*   buffer ops time
*   max jump prevented at boundary (L∞ norm before vs after)

This is how power users verify it’s doing the right thing.

* * *

11) Rendering-Specific Notes (Particles, Paths, Shaders)
    ========================================================

*   Particles: continuity targets are instance buffers: `posXY`, `radius`, `colorRGBA`, `opacity`.
*   Paths: continuity targets are usually _control fields_ (path params, stroke width, color), not the command buffers unless you have stable path IDs and a path correspondence model.
*   Shaders: treat uniforms as signals and textures/buffers as fields. The exact same continuity system applies at uniform buffer and SSBO-equivalent layers.

* * *

12) Hard Constraints (Non-negotiable)
    =====================================

1.  All continuity math uses `t_model_ms`.
2.  Continuity is expressed as explicit scheduled steps.
3.  Domains either provide stable element IDs or continuity degrades to crossfade deterministically.
4.  No per-frame allocations in continuity; all buffers are pooled.
5.  Continuity keys must be stable across recompiles; slots are not stable identifiers.
6.  Export uses the same schedule and continuity steps; therefore export is exact.

That is the complete elaboration for field-dominant anti-jank continuity with a performance model that remains viable as element counts grow.
