Here’s the real list of “if you don’t bake this in, you will fight the system forever” concepts for your kind of tool (live-editable, deterministic, field/signal, no-jank, eventual Rust/WASM/server-authoritative).

I’m going to be blunt and concrete. These aren’t features; they’re structural laws.

⸻

A. Time, continuity, and edit-safety

1) Phase continuity / retiming (what we just discussed)

If you allow speed/period changes without phase-matching, live control feels broken.

2) Transport continuity across hot-swap

When you recompile, tAbs continues, and derived rails continue unless explicitly “reset”.
If recompiling resets the world, it’s a toy.

3) State continuity rules with stable IDs

Stateful nodes (integrators, delays, physics, accumulators) must have stable StateIds and explicit migration rules:
•	same StateId + same type/layout → copy
•	same StateId + compatible layout → transform
•	else → reset + surface as a diagnostic

If state becomes “whatever closure happened to persist,” you’ll never have determinism, debugging, or Rust.

4) Deterministic event ordering

Anything “event-ish” (pulse/wrap/cue/trigger) needs stable ordering across:
•	combine
•	within-frame scheduling

If “sometimes it triggers, sometimes not” happens, it dies in performance contexts.

5) Time topology must be single-authority

No “player loops” competing with patch loops. One authority produces time, everything else derives.
Otherwise you’ll be forever explaining “why does it jump on bar boundaries?”

⸻

B. Graph semantics that scale past toys

6) Explicit cycle semantics (SCC with memory boundary)

If feedback is allowed at all, it must be:
•	detected structurally
•	validated (crosses a memory boundary)
•	scheduled deterministically

Otherwise any “cool” patch becomes a random bug generator.

7) A real ValueStore and slot-addressed execution

Names are for UI; runtime uses indices.
If you keep lookups by string, closures, and object graphs in hot loops, you’ll never hit perf targets and Rust will be miserable.

8) No hidden evaluation: schedule is data

If runtime behavior lives in incidental traversal order or ad-hoc calls, debugging is impossible.
You need a schedule IR you can inspect, diff, and trace.

9) Uniform transform semantics (adapters/lenses are not “special cases”)

Transforms must be table-driven and type-driven:
•	scalar transforms produce scalars
•	signal transforms produce signal plans
•	field transforms produce field expr nodes
•	reductions (field→signal) are explicit and diagnosable

If transforms are “whatever each block does,” you can’t reason about patches.

⸻

C. Fields, identity, and “no jank”

10) Stable element identity + domain anchoring

If elements don’t have stable IDs, you can’t do:
•	temporal effects (trails, history)
•	physics
•	per-element state
•	coherent selection / mapping UI
•	partial renders and caches

A “domain” must be a first-class identity handle, not “an array index we hope stays stable.”

11) Lazy fields + explicit materialization points

If every field becomes an array “because it’s easiest,” you will hit a wall fast.
Materialization must be:
•	scheduled
•	cached
•	attributable (“who forced this buffer and why?”)

12) Structural sharing / hash-consing for expr DAGs

If your FieldExpr / SignalExpr graphs duplicate constantly, compilation and runtime explode.
You want canonicalization so identical subexpressions share nodes (and caches).

13) Cache keys that are explicit and correct

You need a formal cache key model:
•	depends on (time, domain, upstream slots, params, state version)
•	expresses “stable across frames” vs “changes each frame”
•	supports cross-hot-swap reuse when StepIds persist

Without this, you’ll oscillate between “slow” and “wrong.”

⸻

D. Rendering that isn’t a toy

14) Renderer is a sink, not an engine

The renderer should:
•	accept render commands / instances
•	batch, sort, cull, rasterize
•	do zero “creative logic”

All “creative” motion/layout/color comes from the patch.

If the renderer grows bespoke inputs like “radius,” “wobble,” “spiral mode,” it turns into a second patch system and you’ll hate yourself.

15) A real Render IR (render commands, instances, materials)

You need a generic render intermediate:
•	instances (geometry id + transform + style refs)
•	paths/meshes/text as geometry assets
•	materials/shaders/effects as refs
•	layering/z-order rules

Otherwise every new visual idea requires new renderer code.

16) Batching is planned, not accidental

Canvas/WebGL performance lives and dies by:
•	minimizing state changes
•	minimizing path building
•	minimizing draw calls
•	grouping by material/style

If your patch model can’t express batching-friendly output, you’ll always be CPU-bound.

17) Temporal stability in rendering (no flicker on edits)

When patches edit live:
•	old program renders until new program is ready
•	swap is atomic
•	optional crossfade or state carryover where meaningful
•	field buffers can persist if compatible

Otherwise live editing feels like “glitching a web demo.”

⸻

E. Debuggability and user trust

18) First-class error taxonomy with locality

Not “something went wrong.” You need:
•	type mismatch: from/to, suggested adapters
•	cycle illegal: show the loop and the missing memory edge
•	bus conflict: show publishers + combine semantics
•	forced materialization: show culprit sink and expr chain

If errors are vague, only programmers can use it.

19) Traceability by stable IDs (causal links)

Every value should be attributable:
•	produced by NodeId/StepId
•	transformed by lens chain
•	combined on BusId
•	materialized due to SinkId

If you can’t answer “why is this 0?” quickly, it feels like a toy.

20) Deterministic replay

Given PatchRevision + Seed + external inputs record, you must be able to replay.
This is foundational for:
•	bug reports
•	performance tuning
•	collaboration
•	server authority

⸻

F. Live performance realities

~~21) Parameter smoothing / slew everywhere it matters~~ **[POST-MVP]**

~~If you allow discontinuous parameter changes into visible outputs, it will "zipper" and stutter.~~
~~This is the visual equivalent of audio clicks. Slew/lag is not a garnish.~~

22) Safe modulation ranges and "unit discipline"

You don’t need SI units everywhere, but you need:
•	normalized domains (0..1, phase 0..1, timeMs)
•	explicit unit tags where critical (px, deg, ms)
•	clamps at boundaries that are deliberate

Otherwise patches become fragile “magic numbers” and nobody can reuse anything.

23) Input mapping that’s stable and composable (MIDI/OSC)

Live systems need:
•	mapping layers
•	scaling curves
•	dead zones
•	takeover modes (for knobs)
•	bidirectional feedback

If you bolt this on later, you’ll redesign half the system.

⸻

G. Scaling beyond a single browser tab

24) Separation of authored patch vs runtime instance

A patch is a spec. A runtime instance has:
•	time state
•	state cells
•	caches
•	external inputs
•	render target

If you conflate these, multi-client and server-authoritative becomes painful.

25) Snapshot/transaction model for edits

If live edits aren’t transactional, multi-client will desync and undo/redo will be impossible to make trustworthy.

26) Asset system (geometry, fonts, SVGs) with stable IDs

If assets are “whatever the client has loaded,” collaboration and deployment break.

⸻

H. The “toy detector” meta-rule

27) If behavior depends on UI order, object identity, or incidental evaluation order — it’s a toy.

So you must ensure:
•	execution order is explicit
•	identity is explicit
•	state is explicit
•	transforms are explicit
•	time topology is explicit

That’s the through-line.

⸻

If you want, I can turn this into a prioritized checklist with:
•	“must bake in now” vs “can layer later without redesign”
•	explicit acceptance criteria per item
•	where it lives (IR/compiler/runtime/UI) and what it costs.