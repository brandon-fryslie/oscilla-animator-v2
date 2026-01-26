The predictable failure modes, and the invariants that keep you out of ad-hoc land

1) “It renders, but looks different than Canvas”

Root causes
•	Different fill rules / winding assumptions (nonzero vs evenodd).
•	Pixel coverage differences (Canvas is analytic; WebGL often approximates).
•	Coordinate convention drift (y-up vs y-down; half-pixel offsets).
•	Premultiplied alpha mismatch.

Invariants
•	Single canonical color contract: all colors are stored and uploaded as premultiplied RGBA8, and blending is fixed to (ONE, ONE_MINUS_SRC_ALPHA).
•	Single canonical coordinate contract: renderer consumes only normalized [0,1] screen-space and maps to NDC in exactly one function; y convention is documented and tested.
•	Fill rule is not optional: either your tessellator implements nonzero correctly, or paths are rejected at assembly time (not “kinda works”).
•	Golden images are per-backend: you don’t compare Canvas vs WebGL pixels; you compare WebGL vs WebGL goldens, with separate acceptance thresholds.

⸻

2) Path rendering is where projects go to die

Root causes
•	Cubics/quads need robust flattening/tessellation; self-intersections and holes are hard.
•	Instancing + per-instance transforms interacts with antialiasing and stroke.
•	Tessellation churn can dominate CPU if caching is wrong.

Invariants
•	Topology-level caching is mandatory: (topologyId, verbsIdentity, pointsIdentity, flags, pointsCount) → cached mesh; never tessellate per instance.
•	One tessellation algorithm, one output format: always output indexed triangles in local space; transforms are strictly GPU-side.
•	Hard rejection over partial correctness: unsupported verbs or fill rules throw early (ideally in assembler) so you don’t accumulate “just for now” render hacks.
•	Determinism: tessellation results must be bit-stable for identical inputs (no random epsilons); otherwise goldens become noise.

⸻

3) Precision and scale problems (jitter, wobble, “swimming”)

Root causes
•	Large world coordinates in floats (loss of precision).
•	Multiplying many transforms in shader with poor ordering.
•	DevicePixelRatio scaling changes effective precision.

Invariants
•	Renderer never sees world space: it consumes projected normalized [0,1] positions (you already have this upstream).
•	Transform ordering is fixed: local → scale2 → rotate → uniform size → translate → NDC; never rearranged per-op.
•	Float32 everywhere on GPU: all instance floats are Float32 and packed consistently; no mixed float/int reinterpretation.

⸻

4) “Performance is worse than Canvas”

Root causes
•	Many draw calls due to missed batching.
•	Excessive buffer reallocations and garbage.
•	GPU pipeline stalls from bufferData and synchronous state queries.
•	Uploading per-vertex data when you meant per-instance.

Invariants
•	One upload per op: exactly one bufferSubData for the instance stream; no per-attribute uploads.
•	Grow-only buffers with a factor: capacity doubles; never shrink; never allocate per frame.
•	No gl.get* in the frame loop (including getError in production).
•	Draw-call budget: define a hard budget (e.g. “< 200 ops per frame”). If exceeded, it’s an upstream scheduling/batching issue, not something the renderer “fixes.”

⸻

5) State leakage and GL “action at a distance”

Root causes
•	WebGL is a big implicit state machine; tiny omissions break later draws.
•	Multiple canvases or context loss complicate lifecycle.

Invariants
•	Explicit state binding per pass: each op bind sequence sets program, VAO, buffers, blend state, depth state, scissor state explicitly.
•	VAO-per-pipeline: primitives pipeline has one VAO; path pipeline has one VAO per cached mesh (or one VAO with rebinding rules, but written once).
•	Context loss handling is not optional: on webglcontextlost, stop rendering; on restore, rebuild all GPU resources from CPU caches.

⸻

6) Color handling bugs (washed out, wrong alpha, banding)

Root causes
•	Treating RGBA8 as linear when it’s effectively sRGB-ish on many displays.
•	Non-premultiplied blending math with premultiplied inputs (or vice versa).
•	Converting Uint8 to float incorrectly.

Invariants
•	Decide on color space now: either “we are in sRGB and accept it” or “we do linearize.” If you can’t do full linear now, lock the rule: “store/display in sRGB-ish, no linearization,” and keep it consistent across backends.
•	Normalized u8 attribute for color (0..1) with premultiplication guaranteed upstream.
•	No float color buffers in the renderer unless there’s a measured need.

⸻

7) Antialiasing and edge quality

Root causes
•	Canvas gives you high-quality analytic edges; triangles + SDF need care.
•	MSAA availability varies; SDF params vary with scale.

Invariants
•	One AA strategy per geometry class:
•	primitives: SDF with derivative-based smoothing (fwidth) in fragment shader
•	paths: either tessellate with enough segments + SDF edge in shader (hard) or accept triangle edges + MSAA
•	Quality knobs are centralized: if you expose “quality,” it changes only tessellation resolution and/or SDF smooth width, not ad-hoc per-topology tweaks.

⸻

8) Clip/cull differences and “why is this missing?”

Root causes
•	Upstream culling (visible mask) vs GPU clip space culling disagree.
•	NaNs in instance attributes poison vertices.
•	Radius/size hits zero/negative due to upstream signals.

Invariants
•	Sanitize at assembler boundary: no NaNs/Inf in any instance attribute; enforce with a debug assertion pass that can be enabled in tests.
•	Visibility is upstream-only: renderer does not do per-instance cull decisions; it draws what it receives.
•	Size domain is explicit: size must be >= 0. Negative sizes are hard errors upstream.

⸻

9) Ordering and depth illusions

Root causes
•	Painter’s algorithm depends on strict ordering; any batching reorder breaks it.
•	Mixing ops across topologies changes perceived depth.

Invariants
•	Draw order is sacred: renderer draws ops in order, instances in order. Any “optimization” that changes order is forbidden unless it proves semantic equivalence (rare).
•	If you later introduce depth buffer, it’s a new contract: don’t half-enable it. Either you switch to depth testing and remove painter sorting upstream, or you don’t.

⸻

10) Debuggability (the silent killer)

Root causes
•	When WebGL breaks, it often fails silently.
•	Shader compile errors and buffer layout mismatches are painful.

Invariants
•	Single “GPU contract validator” in debug builds:
•	validates attribute strides/offsets match the canonical struct
•	validates buffer lengths match count
•	logs shader compile/link errors with full source and line mapping
•	One reference CPU path per pipeline: not for shipping, but for test harnesses (e.g., a CPU evaluator for primitive SDF) so you can isolate “mesh vs shader vs packing.”

⸻

The meta-invariant that prevents ad-hoc fixes

Every discrepancy is classified as either:
1.	Contract bug upstream (Assembler/Projection produced invalid or inconsistent data), or
2.	Renderer implementation bug (packing/state/shader), or
3.	Spec gap (missing explicit rule).

…and the only allowed fix is to update the contract/spec or the implementation. You never “patch around” a discrepancy inside the renderer without changing a documented invariant, because that’s how you accumulate a second, hidden semantics layer.