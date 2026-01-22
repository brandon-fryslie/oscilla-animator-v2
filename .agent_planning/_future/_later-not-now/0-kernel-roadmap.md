Yeah, that’s exactly the right strategy: get the kernel / materializer layer clean and principled, then come back and design blocks on top of that.

Here’s a focused roadmap from today → “safe to add features”, no extra scope.

⸻

Phase 1 – Lock the semantics and naming

Goal: No ambiguity about what lives where or what it means.


1.	Lock coordinate semantics (you basically already did):
NOTE: Documents:
/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/1-local-space.md
/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/2-local-space-end-to-end-spec.md
/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/3-local-space-spec-deeper.md

•	Local space: geometry / control points, centered at (0,0), |p|≈O(1).
•	World space: instance placement, normalized [0,1].
•	size: isotropic scalar scale in world units.
•	Optional scale2: anisotropic vec2 scale, combined as S_effective.


2.	Lock layer responsibilities:
NOTE: Documents:
/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/5-opcode-interpreter.md
/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/6-signal-kernel.md
/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/7-field-kernel.md

•	Opcode: generic scalar math, radian trig, comparisons (no phase semantics).
•	Signal kernels: scalar → scalar, domain-specific (oscillators, easing, noise).
•	Field kernels: vec2/color/field ops (geometry, layout transforms, jitter, etc.).
•	Materializer: IR → buffers, intrinsics, invoke field kernels.
3.	Rename any misleading kernel names:
•	e.g. sin kernel → oscSin so it can’t be confused with opcode sin.

Once these are written down in comments at the top of each file, you’ve set the rails.

⸻

Phase 2 – Clean up the opcode layer

/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/5-opcode-interpreter.md

Goal: OpcodeInterpreter is the only authority for scalar math.
1.	Move scalar “kernels” into opcodes:
•	From Materializer’s applyMap: sqrt, floor, ceil, round → add to OpcodeInterpreter, remove from kernel handling.
2.	Fill out missing obvious ops:
•	Unary: floor, ceil, round, fract, sqrt, exp, log, sign.
•	Binary: pow.
3.	Make arity strict:
•	add, mul, min, max = variadic.
•	Everything else has fixed arity; mismatches throw.
4.	Remove “fallback” routing in opcodes:
•	applyOpcode should always know if it’s in unary or n-ary mode; no implicit retries.

After this, applyOpcode is a boring, reliable math toolbox and never overlaps with kernels.

⸻

Phase 3 – Extract and sanitize signal kernels

/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/6-signal-kernel.md

Goal: signal kernels are small, sharp, and clearly domain-specific.
1.	Create a dedicated signal-kernel module (or at least a clear section):
•	Oscillators: oscSin, oscCos, oscTan, triangle, square, sawtooth.
•	Easing: easeIn*, easeOut*, easeInOut*, smoothstep, step.
•	Noise: noise1 (and any signed variant later).
2.	Normalize domains & ranges:
•	Oscillators accept any real; internally wrap p → p - floor(p) to [0,1).
•	Easing functions clamp t to [0,1].
•	Noise returns either [0,1) or [-1,1] consistently; document which.
3.	Enforce scalar-only use:
•	No vec2, no shape2d, no field ops here.
•	IR builder / type system ensures kernels are only used with payload: 'float'.

At this point, any “fancy scalar behavior” is either a signal kernel or an opcode, not both.

⸻

Phase 4 – Refactor Materializer into “orchestrator + field-kernel registry”

/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/7-field-kernel.md

Goal: Materializer is IR plumbing; field kernels are clearly separated.
1.	Keep orchestration logic as-is:
•	materialize, fillBuffer, cache, fillBufferIntrinsic, fillLayoutPosition, fillLayoutRadius stay here.
2.	Make map scalar-only:
•	In applyMap, support only fn.kind === 'opcode'.
•	If fn.kind === 'kernel', throw – map is not the place for field kernels.
3.	Treat applyKernel / applyKernelZipSig as the field-kernel registry:
•	Comment explicitly: “Field kernels: operate on field buffers (vec2/color/float), lane-wise.”
•	Keep only genuine field operations here:
•	makeVec2
•	hsvToRgb (field + field / field + sig)
•	jitter2d / fieldJitter2D
•	attract2d
•	fieldAngularOffset
•	fieldRadiusSqrt
•	fieldAdd
•	fieldPolarToCartesian
•	fieldPulse
•	fieldHueFromPhase
•	applyOpacity
•	circleLayout
•	circleAngle
•	polygonVertex
•	fieldGoldenAngle (moved here from map)
4.	Tighten field-kernel contracts:
•	Each kernel documents:
•	exact input field count and payload types (in comments).
•	coord-space expectations (or explicitly “coord-space agnostic”).
•	Arity mismatches throw, no partial behavior.

Now Materializer is doing one job at each layer: orchestrate IR, intrinsics & layout, then call field kernels.

⸻

Phase 5 – Wire up coord-space discipline at the field/kernel level

/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/1-local-space.md
/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/2-local-space-end-to-end-spec.md
/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/3-local-space-spec-deeper.md

Goal: Field kernels are coordinate-agnostic; blocks define the meaning.
1.	Document fieldPolarToCartesian and friends as coord-agnostic transforms:
•	“Takes centerX/Y, radius, angle fields and returns vec2 via cx + r cos(a).”
•	No direct reference to world/local; that’s block-level semantics.
2.	Audit all field kernels for hidden assumptions:
•	If something assumes [0,1] (e.g. using id01), say it in comments and port naming.
•	If something assumes angles in radians, document that too.
3.	Check that no field kernel multiplies by viewport width/height or touches backend concerns:
•	All of that should be gone or never introduced.

Once this is done, the kernel layer is stable regardless of backend or future render targets.

⸻

Phase 6 – RenderIR + renderer prep (just enough to not conflict later)

/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/8-before-render.md
/Users/bmf/code/oscilla-animator-v2/.agent_planning/_future/9-renderer.md

Goal: Kernel work does not paint you into a corner with rendering.
1.	Define the final DrawPathInstancesOp shape (even if not fully used yet):
•	geometry: { topologyId, verbs, points, pointsCount }
•	instances: { count, position, size, rotation?, scale2? }
•	style: PathStyle.
2.	Ensure Materializer’s outputs align with that:
•	Control-point fields are always local.
•	Position/size/rotation fields are world.
3.	Adjust renderer(s) to expect local-space geometry + transforms:
•	Remove any * width / * height scaling of control points.
•	Apply translate/rotate/scale based on instance transforms.

You don’t have to finish full SVG support here, just make sure nothing in the kernel/materializer layer conflicts with the RenderIR design you want.

⸻

Phase 7 – Sanity tests before adding new functionality

Goal: Confidence that this foundation is stable.
1.	Unit-style tests for each layer:
•	Opcode: simple numeric tests (sin/cos, clamp, wrap01, hash).
•	Signal kernels: phase wrapping, easing ranges and monotonicity, noise determinism.
•	Field kernels: feed small arrays, verify vec2/color outputs, especially fieldPolarToCartesian, polygonVertex, hsvToRgb, circleLayout.
2.	End-to-end smoke patches:
•	Regular polygon: index → polygonVertex → vec2 → position.
•	Circle layout: normalizedIndex → circleLayout.
•	Jittered ring: circleLayout → fieldJitter2D.
•	Color from phase: id01, phase → fieldHueFromPhase → hsvToRgb.

If those all behave correctly and your RenderIR lines up with the local/world/size semantics, you’re at the “safe to add features and blocks” milestone.