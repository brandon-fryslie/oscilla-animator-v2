Option B is the correct interpretation for the “Shift preview” requirement, and it does not contradict “camera as kernel” as long as “kernel” is defined as a canonical, table-driven pure function with a strict contract, not “a user-graph node that must appear inside the compiled schedule.”

Here’s the clean, non-muddy model.

Canonical placement of projection

Projection is a mandatory RenderAssembler stage that runs after schedule execution and after continuity has produced the final world-space buffers.
	•	The compiled graph produces (at minimum) worldPosition: Field<vec3> aligned by instanceId.
	•	The RenderAssembler runs one of:
	•	projectWorldToScreenOrtho(...)
	•	projectWorldToScreenPerspective(...)
	•	The projection stage outputs:
	•	screenPosition: Field<vec2>
	•	depth: Field<float>
	•	visible: Field<bool>

This is “camera as kernel” in the only sense that matters architecturally: projection is expressed as a kernel with crisp inputs/outputs and deterministic math, but it is executed in RenderAssembler, not as a patch-authored node.

Where camera parameters come from

Camera parameters are sourced in a strict priority order, without mutating the compiled graph:
	1.	Explicit camera override provided by the patch, if present (e.g., a Camera block feeding a dedicated camera sink / rail bundle that the RenderAssembler reads as values for this frame).
	2.	Otherwise default camera values, as defined in the spec.

“Shift preview” is then simply:
	•	If Shift not held: RenderAssembler uses orthographic camera parameter set.
	•	If Shift held: RenderAssembler uses perspective camera parameter set.

Critically: this changes only which parameter set the RenderAssembler uses, not graph structure, not slot allocation, not continuity, not state.

Why not Option A (viewer-level signal override inside graph)

Option A forces you to implement and maintain a “viewer overrides runtime signal values feeding compiled kernels” mechanism. That becomes a general-purpose escape hatch and will get abused, and it also creates hidden coupling between UI state and the compiled execution semantics.

Option B keeps the patch graph honest: the patch computes world-space, the system computes view-space, and the boundary is explicit and invariant.

What this implies for your earlier “default sources” wording

Default camera values should be described as RenderAssembler defaults, not graph default-source blocks. The patch can still expose camera control by writing to a dedicated camera input channel the assembler reads, but the default itself is not a graph artifact.

Determinism and export

Because projection is a RenderAssembler stage:
	•	Export can be deterministic by pinning the camera parameter set explicitly (“export with ortho defaults” / “export with current camera override”), never by reading transient “Shift is held” UI state.

That statement.