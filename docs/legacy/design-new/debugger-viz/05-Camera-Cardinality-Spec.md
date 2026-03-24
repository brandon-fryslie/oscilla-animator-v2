What produces the camera parameters

There are exactly three sources of camera parameters, and they are resolved by a strict priority rule:
1.	Momentary preview override (e.g. Shift held)
2.	User Camera block (if present in the patch)
3.	System defaults (when no Camera block exists)

The projection stage in RenderAssembler consumes the resolved camera parameters every frame.

⸻

What a “Camera block” is

A Camera block is a render-side declaration block (same category as a render sink), meaning:
•	It is placed in the patch by the user.
•	It may have normal input ports (so it can be modulated like anything else).
•	It does not output a value that can be wired into other nodes.
•	Its purpose is to declare “the camera parameter slots to read” for RenderAssembler.

Concretely: compilation finds the Camera block (if any) and emits a camera declaration into CompiledProgramIR (or equivalent IR), which RenderAssembler reads during frame assembly.

⸻

How many Camera blocks per patch

Exactly 0 or 1.
•	0 → camera uses system defaults (unless preview override is active).
•	1 → camera reads the block’s input slots every frame (unless preview override is active).
•	2+ → compile-time error (diagnostic), and compilation fails.

No “last one wins,” no ambiguity.

⸻

What the Camera block’s ports are

To keep this non-optional and fully explicit, the Camera block has a fixed required port set. Any port left unwired is still well-defined because GraphNormalization will attach DefaultSource blocks to those inputs (same rule as all other inputs in your architecture).

Recommended minimal set (sufficient for both ortho-default identity and perspective preview, and future expansion without redesign):
•	center : Signal<vec2> (world-space point the camera targets on the floor plane)
•	distance : Signal<float> (camera distance from target along view direction)
•	tilt : Signal<float> (radians; 0 = top-down, positive tilts toward horizon)
•	yaw : Signal<float> (radians; rotation around world up)
•	fovY : Signal<float> (radians; used by perspective projection)
•	near : Signal<float>
•	far : Signal<float>

And one explicit projection choice input, with no implicit mode-switching:
•	projection : Signal<int> where 0 = orthographic, 1 = perspective

If you don’t want a “mode” exposed in UX, the editor can provide a higher-level control that writes 0/1 into this port; the compiler and runtime stay explicit.

⸻

What gets emitted into IR

Compilation emits exactly one of these:

A) No camera block

program.render.cameraDecl = null

B) One camera block

program.render.cameraDecl = { centerSlot, distanceSlot, tiltSlot, yawSlot, fovYSlot, nearSlot, farSlot, projectionSlot }

Each *Slot is a ValueSlot holding the evaluated signal value for that input.

This is not a graph edge; it’s a render-side declaration record.

⸻

RenderAssembler camera resolution rule

Each frame, RenderAssembler resolves the camera parameters with this strict priority:
1.	Preview override active
•	Use the preview parameter set (hardcoded constants or a viewer-config struct).
•	Ignore the patch camera declaration for that frame.
2.	Camera declaration present
•	Read the declared slots and build camera parameters from their current signal values.
3.	No camera declaration
•	Use system default camera parameters.

This is purely a render-assembly concern: it does not mutate the compiled graph, schedule, state slots, or continuity.

⸻

What “system defaults” are (in this model)

“System defaults” are not DefaultSource blocks in the patch graph. They are RenderAssembler-owned constants used only when there is no Camera block.

If your doc establishes “orthographic identity defaults,” then those constants are the default camera parameter set.

If your direction changes later (always perspective), the same architecture still holds: only the default constant set changes.

⸻

How Shift preview fits without breaking determinism

Shift preview is a viewer-only override of RenderAssembler’s camera parameter selection.
•	It must not change compilation.
•	It must not change state migration.
•	It must not change continuity mapping.
•	It must not affect export unless export explicitly declares it is using preview mode (by default, export uses the patch camera block if present, else system defaults).

⸻

“Multiple cameras someday”

The forward-compatible path is: keep the patch invariant “0 or 1 camera per patch,” and later introduce View instances (e.g., named cameras) only when you also have a multi-view render target model. Until then, multiple cameras are an error.

That is the complete, unambiguous camera-signal production model for this architecture.