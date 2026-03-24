You’re right that those problems exist in “real 3D,” but the orthographic default isn’t about hiding them so you can procrastinate; it’s about preserving a crisp semantic floor while you add 3D semantics explicitly, instead of making 3D semantics leak into every patch by default.

Here’s the clean causal distinction.

What orthographic buys you that isn’t “hiding”

1) A stable baseline meaning for most patches

Most patches will live in “layout emits positions, renderer draws” territory. If the default projection is orthographic top-down with [0,1]^2 mapping, then:
	•	A 2D patch has an exact, camera-independent meaning.
	•	Debugging is localized: if dots are wrong, it’s your layout/modulation, not “some projection nuance.”

When you go perspective-only, the camera becomes a permanent global transform that can always be implicated.

2) “3D semantics” become opt-in, not ambient

In a modular synth, ambient semantics are poison: users can’t tell what’s fundamental vs incidental. Orthographic makes “depth changes size/order/parallax” something you enable intentionally by switching to perspective projection, not something that can happen because z jittered or a camera default moved.

That’s not hiding complexity; it’s containing it.

3) No fork is required

You don’t need “2D mode” vs “3D mode” as two systems. You need two projection kernels (or two render passes), which is not a fork of the architecture. Everything upstream—types, instance alignment, field kernels, continuity, render IR—stays identical. Only the projection stage differs.

That’s the key: projection is a view transform, not a different world model.

Why “perspective everywhere” is not symmetric with “3D already has these issues”

Because in 3D scenes, those issues are part of the contract. In 2D patches, they’re not, and forcing them in makes your simplest use case dependent on:
	•	camera tuning,
	•	depth ordering decisions,
	•	screen-space vs world-space thickness rules,
	•	matrix precision,
	•	and accidental z noise.

You can absolutely design a system that is always perspective, but then you must also accept that:
	•	“2D” is only a convention, not a semantic guarantee, and
	•	the camera becomes a first-class modulation input in essentially every patch (even if the user never touches it).

That’s a big UX tax.

The minimal non-fork compromise

If your real goal is “no mental model switch,” you can still keep one conceptual system by making this the rule:
	•	World is always 3D (vec3 positions).
	•	Default camera/projection is orthographic top-down.
	•	Perspective is enabled by explicit wiring to a PerspectiveCamera block (or by swapping the projection kernel in the RenderAssembler based on a declared camera resource).

Users don’t think in modes; they think in “I wired a camera.” The engine doesn’t fork; it composes.

So yes: perspective-only is viable, but orthographic-default doesn’t force a redesign later and doesn’t create a fork; it preserves a clean baseline while keeping 3D as a deliberate add-on at the projection stage.

That statement.

------
It's not that i am trying to avoid a mental model switch.  what I'm trying to avoid is "2d is working great, lets pull in the 3d work.  Oh, continuity doesn't work.  Oh the camera is fundamentally broken.  Oh all of the kernel was just a bunch of stubs and someone implemented a data model that is fundamentally incompatible, so now we're trying to undo a bunch of 2d work and redesign it while keeping the system working somehow"
------


That failure mode is real, and it doesn’t come from “orthographic default” vs “perspective default.” It comes from letting 2D decisions leak into core contracts instead of treating “2D” as a degenerate case of the 3D contracts from day one.

If you want to avoid the “we shipped 2D, now 3D breaks everything” trap, you lock these invariants now, even if the initial UX is 2D-ish.

The core rule

World is always 3D. Projection is always explicit. Continuity operates in world-space, not screen-space.
If you enforce that, then adding perspective later is not a redesign; it’s swapping which projection is used (or adding camera controls), while the upstream data model stays valid.

Concrete “no-stub / no-redesign” contracts you lock today

1) Positions are always vec3
	•	Layout outputs Field<vec3> positions (z defaults to 0 for “2D layouts”).
	•	All motion/modulation kernels that touch position operate on vec3.
	•	Anything that only “thinks in 2D” is just a kernel that writes z=0.

This prevents the classic trap where “position is vec2 everywhere” and later you bolt on z by inventing a second pipeline.

2) Camera is a first-class resource with a stable identity
	•	There is a canonical camera instance id (or camera referent) for the patch, just like any other instance-aligned concept.
	•	Camera parameters are signals with stable wiring and stable IDs across recompiles (same rule as state ids and debug edge ids).
	•	The render pipeline consumes camera outputs and does not invent camera state.

This prevents “camera is a viewer thing” that later gets jammed into the patch and breaks determinism/continuity.

3) Projection is a dedicated stage with a fixed contract

You always have an explicit step:

worldPos(vec3) + camera(params) → screenPos(vec2) + depth(float)

Whether the camera is orthographic or perspective is an implementation choice inside that stage, but the stage exists from day 1 and is tested from day 1.

This prevents “we didn’t need projection in 2D” → later you add it and discover everything assumed screen==world.

4) Continuity policies bind to world-space targets, never screen-space
	•	Continuity for position is applied to Field<vec3> in world space.
	•	If you ever need continuity in screen space (rare, usually UI-driven), it’s a separate explicit target with separate semantics.

This prevents “continuity looked great in 2D” because it was effectively screen-space, then falls apart when projection changes.

5) Depth semantics are defined upfront

Even if you don’t use them heavily in “2D”:
	•	Define depth as output of projection.
	•	Define sorting rule (or explicitly “no sorting” rule) and stick to it.
	•	If you later introduce painter’s algorithm / z-buffer-like behavior, that’s a deliberate renderer change, not an accidental side effect.

This prevents “3D is broken” being code for “we never defined ordering.”

6) Local space is real from day 1

You already started this with “local space transition.”
	•	Shapes are authored in local space.
	•	Instances carry world transforms via position/rotation/scale fields (even if rotation/scale are initially constants).
	•	Renderer applies local→world→view→clip consistently.

This prevents “we drew everything in screen space” and later have to rip it apart for camera transforms.

How you keep it “working great” while building real 3D

You don’t hide 3D; you test 3D semantics from day one even if the default patch experience is flat.

Minimum test harness that prevents regressions:
	•	A golden patch where z is nonzero (e.g., two planes at different z) and the expected depth ordering and projected motion is asserted.
	•	A continuity swap test where camera stays fixed and positions change, and you assert continuity behavior is consistent in world space.
	•	A determinism replay test with camera wired and modulated (seeded) so you can’t “accidentally” make camera stateful/viewer-only.

The key insight

Orthographic as default does not cause the trap you’re afraid of if you still:
	•	use vec3 everywhere,
	•	keep camera + projection explicit and real,
	•	define depth + ordering,
	•	and run 3D tests continuously.

The trap happens when “2D” is treated as a different model instead of “3D with z=0 and a trivial camera.”

That statement.