WebGL Renderer Architecture Spec

Scope: Replace (or sit alongside) Canvas2DRenderer/SVGRenderer with a GPU-backed renderer that consumes the existing sink-only RenderFrameIR (v2) produced by RenderAssembler. This spec is intentionally strict: one data model, one render pipeline, one buffer layout, one shader set, one batching policy.

⸻

0. Non-Negotiable Invariants
    1.	Renderer is a sink. It does not interpret graph semantics, does not evaluate signals/fields, and does not resolve topology IDs. It only consumes RenderFrameIR.
    2.	World→screen projection is upstream. RenderAssembler produces screen-space instance position (vec2, normalized [0,1]), size (radius/scale), and optional rotation/scale2, already depth-sorted (painter’s order) inside each DrawOp.
    3.	No per-frame allocations in hot path. Every per-frame GPU upload uses pre-allocated CPU staging buffers and persistent GL buffers sized with growth strategy.
    4.	One canonical GPU format. All instance attributes are uploaded in a fixed interleaved layout. No alternate layouts. No “special cases” per topology.
    5.	Correctness-first ordering. Draw order is exactly frame.ops order (and within op, instance order). No renderer-side sorting.

⸻

1. Inputs and Contracts

1.1 Render Input

Renderer entrypoint consumes:
•	frame: RenderFrameIR (must be version: 2)
•	widthPx: number
•	heightPx: number

RenderFrameIR.ops contains ops of:
•	DrawPathInstancesOp
•	DrawPrimitiveInstancesOp

Each op contains:
•	geometry (topologyId + data)
•	instances:
•	count: number
•	position: Float32Array (stride 2, normalized [0,1])
•	size: Float32Array | number (screen-space radius / scale; when array: length = count)
•	rotation?: Float32Array (radians, length = count)
•	scale2?: Float32Array (stride 2, length = count*2)
•	depth?: Float32Array (length = count; optional, not required for rendering order)
•	style:
•	fillColor: Uint8ClampedArray (either 4 bytes uniform or 4*count)
•	(future stroke fields ignored in v1)

1.2 Required Upstream Constraints (enforced by assembler)

The WebGL renderer assumes:
•	Positions are already projected to screen-space [0,1] with y-up consistent across renderers (current 2D renderers treat [0,1] as viewport normalized).
•	fillColor is always Uint8ClampedArray RGBA (matches RenderAssembler.ts behavior).
•	geometry is fully resolved:
•	Primitives: parameters are present (geometry.params)
•	Paths: geometry.verbs and geometry.points are present and consistent

If any of these are violated, renderer throws a hard error.

⸻

2. Coordinate System

2.1 Viewport mapping

Screen-space instance positions are normalized; GPU uses NDC.

Convert in vertex shader:
•	x_ndc = position.x * 2 - 1
•	y_ndc = position.y * 2 - 1
•	no additional camera in WebGL renderer

2.2 Pixel ratio handling

The renderer owns canvas sizing:
•	canvas.width  = floor(clientWidth  * devicePixelRatio)
•	canvas.height = floor(clientHeight * devicePixelRatio)
•	GL viewport matches canvas pixel dimensions

No other part of the system sets GL viewport.

⸻

3. Batching and Draw Strategy

WebGL v1 draws two pipelines:
1.	Primitive Instances Pipeline (instanced)
•	Renders ellipse/rect/etc. as instanced quads with a signed-distance fragment shader (SDF-style) based on primitive topology + params.
•	One draw call per DrawPrimitiveInstancesOp.
2.	Path Instances Pipeline (triangulated, non-instanced initially)
•	Paths are rendered by CPU tessellation of each path topology into triangles in local space, then transformed per-instance on GPU.
•	v1 tessellates each topology once into a triangle mesh in local space, then draws instanced if feasible.
•	One draw call per DrawPathInstancesOp.

Strict requirement: The renderer must not do per-instance CPU path building. It tessellates per-topology, caches by (topologyId, pointsBufferIdentity, flags, pointsCount).

⸻

4. GPU Data Model

4.1 Instance Attribute Layout (interleaved, canonical)

All instance streams are uploaded as one interleaved buffer per op.

Per instance struct (packed to 32-bit multiples):

Attribute	Type	Bytes	Notes
a_pos	vec2 float32	8	normalized [0,1]
a_size	float32	4	radius/scale
a_rot	float32	4	radians; 0 if absent
a_scale2	vec2 float32	8	(1,1) if absent
a_color	u8vec4 normalized	4	RGBA 0..255 normalized in shader

Total = 28 bytes per instance. Stride = 28.

The renderer must always upload this exact layout, even when rotation/scale2 are absent (it writes default values).

4.2 Geometry Buffers

4.2.1 Primitive base geometry
A single static VBO for a unit quad in local space:
•	vertices: (-1,-1) (1,-1) (-1,1) (1,1)
•	indices: two triangles

This quad is used for all primitive instances. The fragment shader interprets topologyId/params.

4.2.2 Path tessellation geometry
For each unique path topology key:
•	pathMeshVBO: local-space triangle vertices (Float32Array vec2)
•	pathMeshIBO: indices (Uint16Array or Uint32Array depending on vertex count)
•	stored in a cache and reused

⸻

5. Shader Programs

5.1 Common uniforms

All programs share:
•	u_viewport: vec2 (widthPx, heightPx) if needed for antialiasing
•	u_time: optional, not required by spec

5.2 Primitive Program

Vertex shader responsibilities:
•	Convert a_pos to NDC
•	Apply rotation + anisotropic scale to quad local vertex
•	Multiply by a_size and aspect-correct scaling
•	Output varyings for SDF

Fragment shader responsibilities:
•	Determine primitive type from uniform u_topologyId and uniform params block u_params[]
•	Compute alpha coverage using SDF
•	Multiply by a_color
•	Output premultiplied alpha

Topology mapping:
•	The renderer maintains a PrimitiveTopologyShaderMap keyed by topologyId that defines how to interpret geometry.params into uniforms.
•	In v1: support only the primitive topologies that exist today in your registry (ellipse, rect). Others throw.

5.3 Path Program

Vertex shader responsibilities:
•	Take tessellated local-space vertex
•	Apply per-instance transforms (scale/scale2/rotation)
•	Translate to a_pos (NDC conversion)
•	Pass color

Fragment shader responsibilities:
•	Solid fill only (no stroke in v1)
•	Output a_color

⸻

6. CPU Side: Caches and Ownership

6.1 Renderer object

A single stateful renderer instance owns:
•	GL context + programs + static buffers
•	Per-op reusable instance buffer (grow-only)
•	Path mesh cache

It exposes:
•	render(frame: RenderFrameIR, widthPx: number, heightPx: number): void
•	dispose(): void

6.2 Path mesh cache key

Cache key is a struct:
•	topologyId: number
•	verbsIdentity: Uint8Array identity (reference)
•	pointsIdentity: Float32Array identity (reference)
•	flags: number
•	pointsCount: number

Since your assembler passes geometry.verbs and geometry.points by reference, identity caching is valid. If upstream starts copying those arrays, caching still works but churns; that is acceptable but considered a performance bug upstream.

6.3 No renderer-side pooling of RenderAssembler pooled views

Renderer does not accept pooled-view lifetimes. It consumes whatever RenderAssembler gives it and uploads immediately. It does not retain references to per-frame arrays after render() returns.

⸻

7. Frame Rendering Algorithm (Strict)

Given a frame:
1.	Validate frame.version === 2.
2.	Resize canvas and set gl.viewport.
3.	Clear framebuffer (color = black, alpha = 1). Clear cannot be skipped unless explicitly requested by caller (not part of v1).
4.	For each op in frame.ops in order:
•	If op.kind === 'drawPrimitiveInstances':
1.	Pack instance attributes into the interleaved CPU staging buffer (see §8).
2.	Upload instance buffer via gl.bufferSubData.
3.	Bind Primitive program + static quad geometry.
4.	Set uniforms derived from op.geometry:
•	u_topologyId
•	u_params (packed floats)
5.	Draw instanced quad using gl.drawElementsInstanced.
•	If op.kind === 'drawPathInstances':
1.	Resolve path mesh from cache or tessellate and upload (see §9).
2.	Pack instance attributes into staging buffer.
3.	Upload instance buffer.
4.	Bind Path program + path mesh geometry.
5.	Draw instanced triangles using gl.drawElementsInstanced (preferred) or gl.drawElements in a loop only if instancing is unavailable (WebGL2 required; v1 requires WebGL2, so instancing is mandatory).
5.	Return.

⸻

8. Instance Packing Rules (No Ambiguity)

For an op with N = instances.count:
•	position: must be length N*2
•	size:
•	if number, treat as uniform; write same value per instance
•	if Float32Array, must be length N
•	rotation:
•	if absent, write 0.0 per instance
•	if present, must be length N
•	scale2:
•	if absent, write (1.0, 1.0) per instance
•	if present, must be length N*2
•	fillColor:
•	if length == 4: uniform; write same RGBA for all
•	else must be length N*4; write per instance

The renderer packs into an ArrayBuffer sized N * 28 bytes, using a DataView or typed views:
•	Float32Array view for the float region
•	Uint8Array view for the color bytes

Packing order is exactly:
pos.x, pos.y, size, rot, scale2.x, scale2.y, color.r, color.g, color.b, color.a

No other packing is permitted.

⸻

9. Path Tessellation Contract (v1)

9.1 Supported verbs

Your Canvas2DRenderer uses numeric verbs 0..4: MOVE, LINE, CUBIC, QUAD, CLOSE. WebGL tessellator must support the same set.

9.2 Tessellation output

Given (verbs, points) produce:
•	vertices: Float32Array vec2 local-space
•	indices: Uint16Array|Uint32Array

9.3 Fill rule

style.fillRule is currently 'nonzero' in assembler. WebGL v1 supports nonzero only. If fillRule is anything else, throw.

9.4 Tessellation requirement

Tessellation is performed once per cached path topology key, not per instance. Instance transforms happen on GPU.

If existing path shapes are already polygonal in your topology system, tessellation can be “identity” (use provided points as a mesh) only if the topology declares it. Otherwise tessellation must be real.

If you cannot implement robust cubic/quad tessellation quickly, v1 must hard-reject verbs 2/3 and only accept MOVE/LINE/CLOSE. This is allowed only if those verbs do not exist in your current topology registry. If they do exist, tessellation must support them.

⸻

10. WebGL2 Requirement

This renderer requires WebGL2, because:
•	instanced draws are mandatory
•	integer vertex attributes (normalized u8 color) are cleaner
•	uniform buffer objects are available (optional) but not required

The renderer must:
•	attempt canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true })
•	if unavailable, throw a hard error (“WebGL2 required”)

⸻

11. Integration Points in Your Codebase

11.1 New files

Create:
•	src/render/webgl/WebGLRenderer.ts (main renderer)
•	src/render/webgl/shaders.ts (shader sources + compile helpers)
•	src/render/webgl/PathTessellator.ts (CPU tessellation + cache key handling)
•	src/render/webgl/GLResources.ts (buffer/program lifecycle utilities)

11.2 Render loop integration

Where you currently select Canvas2DRenderer/SVGRenderer:
•	instantiate WebGLRenderer once
•	each frame:
1.	run runtime schedule (already)
2.	assemble RenderFrameIR (already)
3.	call webglRenderer.render(frame, canvas.width, canvas.height)

11.3 No changes to compiler/IR required

This renderer consumes existing v2 RenderFrameIR. Any additional fields (like stroke) are out of scope.

⸻

12. Error Handling Rules

Renderer throws (hard fail) when:
•	frame.version !== 2
•	any required buffer type is wrong (position not Float32Array, fillColor not Uint8ClampedArray)
•	any required buffer length mismatch
•	unknown topologyId for primitives
•	unsupported fillRule
•	WebGL2 unavailable

No warnings. No silent fallback.

⸻

13. Performance Requirements (Concrete)
    1.	One buffer upload per op for instances: exactly one gl.bufferSubData call.
    2.	Zero per-frame shader recompiles.
    3.	Zero per-frame buffer reallocations unless instance count exceeds capacity (growth factor 2x).
    4.	Path mesh uploads only on cache miss.
    5.	No gl.get* calls in the frame loop (debug builds may allow, production must not).

⸻

14. What This Renderer Deliberately Does NOT Do
    •	No camera math
    •	No depth buffer sorting
    •	No stroke rendering
    •	No blending modes beyond standard alpha blending
    •	No text
    •	No hit-testing
    •	No per-instance geometry deformation

⸻

15. Minimal Acceptance Checklist
    •	Renders the same RenderFrameIR output as Canvas2DRenderer for primitives (ellipse/rect) with visually consistent position/scale/color.
    •	Produces stable animation at 60fps for large instance counts (GPU-bound rather than CPU path construction).
    •	Demonstrates path rendering for at least one path topology with fill.
    •	Zero allocations per frame in renderer (measured via performance tools), aside from growth events.

This is the architecture spec you can hand to a team and implement without revisiting the fundamentals.