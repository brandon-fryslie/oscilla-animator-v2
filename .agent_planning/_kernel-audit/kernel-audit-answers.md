Decisions on your open questions (Q1–Q31)

Opcodes (PureFn)

Q1 arithmetic: Keep as opcodes: add/sub/mul/div/mod/pow/neg/abs.
Also: make add/mul/min/max variadic at the opcode level if you already have that.

Q2 trig: Keep sin/cos as opcodes. Drop tan for now (easy add later; high singularity risk + low value).

Q3 range ops: Keep min/max/lerp as opcodes. Drop clamp as an opcode (compose via min/max) unless you find yourself writing it constantly inside generated PureFn (then re-add as “convenience opcode” later).

Q4 comparisons: Keep lt/gt/eq as opcodes (float 0/1). Do not add lte/gte/neq now.

Q5 rounding: Keep floor as opcode. Keep fract only if your wrap01 depends on it internally; otherwise drop fract/ceil/round for now.

Q6 exp/log/sign: Keep sqrt. Drop exp/log/sign now (reintroduce only when you have a concrete kernel/block that needs them).

Q7 wrap01: Keep as opcode (even if composable). This is the “negative correctness trap” you called out; having one canonical implementation is worth it.

Q8 hash: Keep as opcode. Treat it as the only randomness primitive; everything else uses it.

Structural intrinsics (extract/construct/lifts)

Q9 extraction: Keep capability, but do Option B: one generic extract(componentIndex) (plus static typing via CanonicalType checks). Do not keep 7 named variants.

Q10 construction: Same: one generic construct(payloadKind, components...). Fix signal-level by making it real, not “not yet supported”.

Q11 conversions/swizzles:
•	Keep vec2ToVec3 and setZ as structural intrinsics.
•	Delete swizzle kernels (xy, rgb) and express as extract + construct.

Named “kernel library” vs composite blocks

This is the big one: you can only delete these safely if you’re okay losing the feature until composite blocks exist. Given your “finish ASAP, delete nonconforming” stance but also “don’t lose UV layout/external/expression node”, here’s the split.

Q12 oscillators: Not registry kernels. Make them composite blocks that lower to opcodes (mul phase by TAU → sin, etc.). If you don’t have composite expansion, you can still implement them as ordinary blocks whose lowering just emits that small graph. No registry kernel needed.

Q13 easings: Same as Q12: composite blocks or a single parameterized Ease block that lowers to opcodes. Delete easing kernels.

Q14 smoothstep/step:
•	step is just gt/lt — delete as named anything.
•	smoothstep should be composite (lower to clamp+poly) — delete as kernel.

Q15 noise: Delete. Use hash.

Q16 combine_*: Delete as kernels. Fan-in resolution must be a compile-time port policy that chooses an opcode reduction (add/max/min) or “last-wins”. combine_last becomes policy, not computation.

Field kernels and field dispatch architecture

Q17 fieldAdd/fieldMultiply: Delete them and commit to Q30 Option B: field zip/map applies scalar opcodes per-lane (stride-aware loop) so “fieldAdd” is literally zip(add, A, B).

Q18 polar-to-cartesian: Delete as kernel; make it a composite block.

Q19 hsvToRgb: Keep as a registry kernel for now (pure, big, and you likely want it). Later it can become a composite block if/when you have a sane way to encapsulate large subgraphs.

Q20 opacity helpers: Delete; it’s extractA → mul → construct.

Q21 angularOffset/radiusSqrt: Delete; composite.

Q22 specialized effects: Delete; presets/composite blocks later.

Q23 layout kernels (including UV variants):
Because you explicitly do not want to lose the UV layout work, you have two viable “fast” options:
•	Fastest with feature retention: Keep layouts as registry kernels (field-level) for now. They’re pure, deterministic, and large enough that graph expansion is noisy today.
•	Purest kernel-minimalism: delete them and accept temporary loss until composite layout blocks exist.

Given your constraint (“don’t lose UV layout stuff”), I would keep layout kernels as registry kernels temporarily and mark them “transitional exceptions”; everything else layout-ish goes composite later.

Q24 polygon/star vertex: Delete; composite later.

Q25 broadcastColor: Delete; it’s construct + broadcast.

Q26 3D layouts: Same policy as Q23: if they’re used and you won’t lose them, keep temporarily as registry kernels; otherwise delete.

Reduce + events

Q27 reduce ops: Keep as kernelKinds handled by evaluator (reduce with op: min/max/sum/avg). Not registry kernels, not opcodes.

Q28 event kinds: Keep as ValueExprEvent kinds. Not kernels.

⸻

“Which should be named kernels in the builder?”

Using the buckets above, your builder should expose methods for the three non-opcode categories:

Builder “built-in methods” (ValueExpr kinds)
•	time.*
•	event.*
•	external.*
•	intrinsic.*
•	slotRead
•	broadcast/zipSig/reduce/pathDerivative (as kernelKinds)

Builder “structural methods” (extract/construct/lift)
•	extract(value, componentIndex)
•	construct(payloadKind, components...)
•	vec2ToVec3(value2, z=0)
•	setZ(vec3, zScalar)

Builder “kernelCall” (registry only)

Keep this list small:
•	hsvToRgb
•	circleLayout / gridLayout / lineLayout / UV variants (only because you refuse to lose them right now)
•	anything else you consciously accept as “transitional exception”

Everything else becomes either opcodes (math) or composite blocks (UX-facing).
