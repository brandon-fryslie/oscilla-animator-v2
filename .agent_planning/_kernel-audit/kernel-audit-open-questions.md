# Kernel Audit: Open Questions

> **Goal**: Reduce the kernel layer to irreducible primitives. Everything else should be expressible by composing primitives through the graph. This document covers every kernel outside the fundamental set (`map`, `zip`, `broadcast`, `zipSig`, `reduce`, `pathDerivative`, camera, external IO).
>
> **Decision framework**: A kernel belongs in the primitive layer if and only if it cannot be expressed as a composition of other primitives through the existing graph wiring, OR if removing it would make the system unable to express a class of animations.
>
> **Engineer feedback** is integrated inline. Where it agrees with the original analysis, decisions are marked **RESOLVED**. Where it introduces new considerations or disagrees, the impact is discussed.

---

## Opcodes (Scalar Math via OpcodeInterpreter)

These are dispatched through `map`/`zip` and operate on scalars. They are candidates for the irreducible primitive set.

### Q1: Core arithmetic — `add`, `sub`, `mul`, `div`, `mod`, `pow`, `neg`, `abs` — RESOLVED: Keep

**Context**: Standard arithmetic. `add` and `mul` are variadic (take N inputs). All others are unary or binary. These form the basis of every numeric computation.

- **Pro keep**: Irreducible. You cannot build `add` from anything simpler.
- **Con**: None. These are axiomatically primitive.

**Engineer feedback**: Keep all. Confirms add/mul/min/max should be variadic at the opcode level.

**Impact**: No change. Unanimous. One implementation note: verify that add/mul/min/max are already variadic in `OpcodeInterpreter.ts`, not just binary with chaining. If they're already variadic (they appear to be — the current implementation handles `args: number[]`), no work needed.

**Decision**: **Keep all 8 as opcodes.**

---

### Q2: Trigonometry — `sin`, `cos`, `tan` — RESOLVED: Keep sin/cos, drop tan

**Context**: Operate on radians. These are the mathematical functions, not the oscillator wrappers (those are `oscSin` etc. in Q12). Used directly in coordinate transforms, wave generation, and projection math.

- **Pro keep**: Irreducible transcendental functions. Foundation of all wave/rotation math.
- **Con**: `tan` is rarely used in animation and has singularities. Could defer it.

**Engineer feedback**: Keep sin/cos. Drop tan — "high singularity risk + low value", easy to add back later.

**Impact**: Agrees with original recommendation. `tan` is used in exactly zero blocks today outside `oscTan` (which is being removed per Q12). The only consumers are the projection kernels, which use `Math.tan` directly (not the opcode). Removing the opcode has no downstream impact.

**Decision**: **Keep `sin`, `cos`. Remove `tan` opcode.**

---

### Q3: Range operations — `min`, `max`, `clamp`, `lerp` — OPEN: clamp removal is debatable

**Context**: `min`/`max` are variadic. `clamp(x, lo, hi)` is ternary. `lerp(a, b, t)` is ternary.

- **Pro keep all**: `lerp` is the fundamental interpolation primitive. `clamp` prevents out-of-range. `min`/`max` used in reduce and bounding.
- **Con clamp**: `clamp(x, lo, hi)` = `max(lo, min(hi, x))` — composable from min/max.

**Engineer feedback**: Keep min/max/lerp. **Drop clamp** — compose via min/max. Re-add as "convenience opcode" only if you find yourself writing it constantly inside generated PureFn.

**Impact**: This diverges from the original "keep all four" recommendation. The engineer's position is architecturally purer — clamp is demonstrably composable. However, there's a practical consideration: `clamp` appears in `smoothstep` decomposition, in the `slew` continuity kernel, and in several field kernels. Removing it means every clamp site becomes `max(lo, min(hi, x))` which is readable but more verbose.

**Open tension**: The "convenience opcode" escape hatch the engineer suggests is itself a slippery slope — where do you draw the line? If clamp qualifies as convenience, so does `abs(x)` = `mul(x, sign(x))`. The difference is that clamp has an obvious 2-op decomposition while abs does not.

**Options**:
- **(A)** Drop clamp now, re-add if it becomes noisy in generated IR
- **(B)** Keep clamp — it's ternary (not binary), and the min/max composition is error-prone (easy to swap lo/hi)

**Leaning**: (A) — try without it. The argument order trap is real but can be caught by type constraints on the block level.

---

### Q4: Comparison — `eq`, `lt`, `gt` — RESOLVED: Keep, no expansion

**Context**: Return 0.0 or 1.0. Used for conditional logic via `lerp(a, b, condition)`.

- **Pro keep**: Without comparisons, no conditional behavior.
- **Original question**: Do we need `lte`, `gte`, `neq`?

**Engineer feedback**: Keep lt/gt/eq. Do not add lte/gte/neq now.

**Impact**: Agrees with original and closes the sub-question. `lte(a, b)` = `sub(1, gt(a, b))` if needed.

**Decision**: **Keep `eq`, `lt`, `gt`. No expansion.**

---

### Q5: Rounding — `floor`, `ceil`, `round`, `fract` — OPEN: fract coupling to wrap01

**Context**: Discretization and fractional extraction. `fract(x)` = `x - floor(x)`.

- **Pro keep floor**: Used in grid indexing, discretization. Irreducible.
- **Con others**: `fract` = `sub(x, floor(x))`. `ceil` = `neg(floor(neg(x)))`. `round` = `floor(add(x, 0.5))`.

**Engineer feedback**: Keep `floor`. Keep `fract` **only if `wrap01` depends on it internally**; otherwise drop fract/ceil/round.

**Impact**: This introduces a coupling question the original analysis missed. Let's check: `wrap01(x)` is currently `((x % 1) + 1) % 1` — it uses `mod`, not `fract`. So `fract` is NOT a dependency of `wrap01`. However, `fract` is used directly in:
- `hash` implementation: `fract(sin(x * K) * L)`
- Several field kernels being removed (fieldHueFromPhase, fieldGoldenAngle)

If `hash` uses `fract` internally, and `hash` is an opcode (kept per Q8), then `fract` is needed as an internal implementation detail of `hash` but not as a user-facing opcode.

**Options**:
- **(A)** Drop fract/ceil/round as opcodes. `hash` uses `Math.fract` (or inline equivalent) in its implementation — opcodes don't need to compose from other opcodes.
- **(B)** Keep fract as opcode because users will want it for phase math (`fract(a + b)` is a common pattern).

**Leaning**: (A) for now. `fract` can be composed as `sub(x, floor(x))` at the graph level. If it becomes noisy, re-add.

---

### Q6: Exponential/logarithmic — `sqrt`, `exp`, `log`, `sign` — RESOLVED: Keep sqrt only

**Context**: `sqrt` for distance, `exp`/`log` for decay, `sign` for direction.

- **Pro keep sqrt**: Irreducible. Used in distance calculations.
- **Con others**: No concrete consumer exists today if easing/slew kernels are removed.

**Engineer feedback**: Keep `sqrt`. Drop exp/log/sign — "reintroduce only when you have a concrete kernel/block that needs them."

**Impact**: Agrees with original recommendation direction but is more decisive. The engineer's "concrete consumer" test is a good principle: don't carry opcodes for hypothetical future blocks. If an Exponential Decay block is added later, `exp` comes back with it.

**One caveat**: `sign` is used in the `attract2d` kernel, but that kernel is being removed (Q22). `exp` is used internally by the slew/continuity system, but that's runtime code (not opcode-dispatched). No orphaned consumers.

**Decision**: **Keep `sqrt`. Remove `exp`, `log`, `sign`.**

---

### Q7: Phase wrapping — `wrap01` — RESOLVED: Keep

**Context**: `((x % 1) + 1) % 1`, wrapping to [0, 1). Fundamental to the oscillator model.

- **Pro keep**: Correctness trap for negative inputs. One canonical implementation prevents bugs.

**Engineer feedback**: Keep as opcode. The "negative correctness trap" justifies a named primitive.

**Impact**: Unanimous.

**Decision**: **Keep `wrap01`.**

---

### Q8: Hash — `hash(value, seed) → [0, 1)` — RESOLVED: Keep

**Context**: Deterministic PRNG. The only source of controlled randomness.

- **Pro keep**: Irreducible. Can't build from arithmetic alone.

**Engineer feedback**: Keep. "Only randomness primitive; everything else uses it."

**Impact**: Unanimous.

**Decision**: **Keep `hash`.**

---

## Component Access & Construction

### Q9: Vector extraction — RESOLVED: Generic extract (Option B)

**Context**: Currently 7 named extraction kernels (`vec3ExtractX/Y/Z`, `colorExtractR/G/B/A`) at both signal and field levels.

- **Option A**: Keep named-per-type. Simple dispatch, explicit.
- **Option B**: Generic `extract(value, componentIndex)`. One kernel, parameterized.

**Engineer feedback**: Option B — "one generic extract(componentIndex) plus static typing via CanonicalType checks. Do not keep 7 named variants."

**Impact**: This is a significant architectural change. The current dispatch in `SignalKernelLibrary.ts` and `FieldKernels.ts` uses string-matched kernel names (`vec3ExtractX`, `fieldExtractY`, etc.). Moving to generic extract means:

1. The IR representation changes: instead of `{ kernelKind: 'map', kernelName: 'vec3ExtractX' }`, it becomes something like `{ kernelKind: 'extract', componentIndex: 0 }` — or extract becomes a new kernelKind alongside map/zip/etc.
2. The evaluator dispatch changes: instead of switching on 7 names, it reads `componentIndex` and indexes into the value's components.
3. Type safety moves to the compiler: the compiler must verify that `componentIndex < stride(payloadKind)` at compile time.

**Open question**: Does `extract` become a new kernelKind (alongside map/zip/broadcast/etc.), or does it remain a `map` with a parameter? The engineer's framing suggests it's a "structural method" on the builder — distinct from both opcodes and kernelKinds. This implies a new category: **structural intrinsics** that are neither pure functions nor cardinality transformers.

**Options for implementation**:
- **(A)** New kernelKind `'extract'` with `componentIndex` parameter
- **(B)** Stays as `map` but the kernel function is parameterized: `map(extractComponent(2), input)`
- **(C)** New ValueExpr variant `{ kind: 'extract', source, componentIndex }` — not a kernel at all

Option (C) is cleanest: extraction is a structural operation on types, not a computation. It should be its own IR node, like `slotRead` or `const`.

**Decision**: **Generic extract. Implementation approach needs design.**

---

### Q10: Vector/color construction — RESOLVED: Generic construct (Option B)

**Context**: Currently ~5 named construction kernels. Signal-level variants throw "not yet supported".

- **Option A**: Named per-type.
- **Option B**: Generic `construct(payloadKind, components...)`.

**Engineer feedback**: Option B — "one generic construct(payloadKind, components...). Fix signal-level by making it real, not 'not yet supported'."

**Impact**: Mirrors Q9. Same architectural considerations. Construction is the inverse of extraction — if extraction becomes a structural IR node, construction should too.

The "fix signal-level" directive is important: `makeVec2Sig`, `makeVec3Sig`, `makeColorSig` currently throw at runtime. This has been a known gap. The generic construct approach forces fixing this because there's no named variant to hide behind — either construct works for all payload kinds or it doesn't.

**Open question**: Does `construct` produce a single multi-component signal (requiring multi-slot writes), or does it remain a field-only operation with signal-level support deferred? The engineer says "make it real" which implies full support.

**Decision**: **Generic construct. Signal-level must be implemented, not stubbed.**

---

### Q11: Format conversion — `vec2ToVec3`, `fieldSetZ`, swizzles — RESOLVED: Keep lifts, remove swizzles

**Context**: Type-level conversions. `vec2ToVec3` lifts 2D→3D. `fieldSetZ` sets Z. Swizzles (`fieldSwizzle_xy`, `fieldSwizzle_rgb`) drop components.

**Engineer feedback**: "Keep vec2ToVec3 and setZ as structural intrinsics. Delete swizzle kernels — express as extract + construct."

**Impact**: Agrees with original recommendation. The engineer uses the term "structural intrinsics" — reinforcing the Q9/Q10 pattern that these are type-structural operations, not computational kernels.

With generic extract/construct (Q9/Q10), swizzles decompose cleanly:
- `fieldSwizzle_xy(v)` = `construct(vec2, extract(v, 0), extract(v, 1))`
- `fieldSwizzle_rgb(c)` = `construct(vec3, extract(c, 0), extract(c, 1), extract(c, 2))`

**Open question**: Should `vec2ToVec3` also decompose to `construct(vec3, extract(v, 0), extract(v, 1), 0)`? The engineer explicitly says keep it as a structural intrinsic, which suggests it deserves special treatment as the canonical 2D→3D lift. This is a reasonable "3D-native" design choice — it's so common that having a named intrinsic prevents bugs (forgetting the z=0 default).

**Decision**: **Keep `vec2ToVec3` and `fieldSetZ` as structural intrinsics. Remove `fieldSwizzle_xy` and `fieldSwizzle_rgb`.**

---

## Signal Kernel Library (named kernels dispatched via map/zip)

### Q12: Oscillators — `oscSin`, `oscCos`, `oscTan`, `triangle`, `square`, `sawtooth` — RESOLVED: Remove (composite blocks)

**Context**: Take phase [0, 1), produce [-1, 1]. The signature operations of the application.

- **Pro keep**: Brand identity, single-node UX.
- **Pro remove**: All trivially composable from opcodes.

**Engineer feedback**: "Not registry kernels. Make them composite blocks that lower to opcodes."

**Impact**: Composite block infrastructure exists and is fully operational (`normalize-composites.ts` expansion pass, `CompositeBlockDef` type, registration, serialization, nesting up to depth 5). Each oscillator becomes a `CompositeBlockDef` with internal primitive blocks wired together. For example, `SineOscillator` would contain a `Phasor` → `Const(TAU)` → `Multiply` → `Sin` chain. The user sees one block; the expansion pass flattens it to primitives before compilation; no registry kernel needed.

Existing library composites (PingPong, SmoothNoise, ColorCycle, DelayedTrigger) demonstrate this pattern is already proven in the codebase.

**Decision**: **Remove all 6 oscillator kernels. Express as composite blocks using existing infrastructure.**

---

### Q13: Easing functions (9) — RESOLVED: Remove (composite blocks)

**Context**: Nine named easing curves. All composable from opcodes.

**Engineer feedback**: "Same as Q12: composite blocks or a single parameterized Ease block that lowers to opcodes. Delete easing kernels."

**Impact**: Same as Q12 — composite block infrastructure handles this. Each easing curve becomes either an individual composite block or a single parameterized `Ease` composite with a curve selector. The polynomial easings (quad, cubic) are 2-3 internal blocks. Elastic/bounce are more complex (~5-6 blocks) but well within composite nesting capabilities.

**Decision**: **Remove all 9 easing kernels. Express as composite blocks.**

---

### Q14: Shaping — `smoothstep`, `step` — RESOLVED: Remove

**Context**: `step` = comparison. `smoothstep` = hermite polynomial.

**Engineer feedback**: "step is just gt/lt — delete as named anything. smoothstep should be composite (lower to clamp+poly) — delete as kernel."

**Impact**: Unanimous with original recommendation. Note: if `clamp` is also removed (Q3), smoothstep's composite expansion becomes `max(lo, min(hi, x)) → t*t*(3-2t)` — slightly longer but still fine.

**Decision**: **Remove both.**

---

### Q15: Noise — `noise(phase, seed)` — RESOLVED: Remove (use hash)

**Context**: Signal-level noise function, effectively identical to the `hash` opcode.

**Engineer feedback**: "Delete. Use hash."

**Impact**: Unanimous. The original question about semantic differences between noise/hash is answered: there are none. Both produce `fract(sin(x * K) * L)`.

**Decision**: **Remove. `hash` opcode covers this.**

---

### Q16: Combine kernels — `combine_sum/average/max/min/last` — RESOLVED: Remove (compile-time port policy)

**Context**: Variadic signal merge strategies for fan-in.

**Engineer feedback**: "Delete as kernels. Fan-in resolution must be a compile-time port policy that chooses an opcode reduction (add/max/min) or 'last-wins'. combine_last becomes policy, not computation."

**Impact**: Agrees with original recommendation and clarifies the replacement: this is a **compiler concern**, not a runtime concern. During compilation, when multiple signals connect to one port, the compiler's fan-in resolution pass selects an opcode (add, max, etc.) and emits a zip/reduce accordingly. `combine_last` is the degenerate case: only the last-connected signal is wired, others are ignored.

**Open question**: Where does the port policy live? Options: (a) per-port metadata in the block definition, (b) per-edge annotation, (c) a dedicated compilation pass. The engineer says "compile-time port policy" which suggests (a) — block definitions declare how their inputs handle fan-in.

**Decision**: **Remove all 5 combine kernels. Replace with compile-time port policy.**

---

## Field Kernels (buffer operations via FieldKernels.ts)

### Q17: Field arithmetic — `fieldAdd`, `fieldMultiply` — RESOLVED: Remove (commit to per-lane opcode dispatch)

**Context**: Element-wise field ops that duplicate scalar opcodes.

**Engineer feedback**: "Delete them and commit to Q30 Option B: field zip/map applies scalar opcodes per-lane (stride-aware loop) so 'fieldAdd' is literally zip(add, A, B)."

**Impact**: The engineer resolves Q17 and Q30 simultaneously. This is the biggest architectural commitment in the audit: **the field evaluation layer will not have its own kernel table**. Instead, `zip(add, fieldA, fieldB)` loops over buffer lanes calling the scalar `add` opcode per-element. This eliminates the entire `applyFieldKernel` dispatch table for operations that are just strided versions of scalar ops.

**This is a significant refactor** of `FieldKernels.ts`. The current architecture has ~30 named field kernels with manual buffer iteration. Under the new model, most of those become `zip(opcode, ...fields)` with the evaluator handling stride automatically.

**What survives in FieldKernels.ts**: Only kernels that genuinely can't be expressed as per-lane opcode application — primarily the layout kernels (Q23, if kept as transitional exceptions) and `hsvToRgb` (Q19). Everything else is a strided opcode dispatch.

**Decision**: **Remove `fieldAdd`, `fieldMultiply`. Commit to per-lane opcode dispatch (Q30 Option B).**

---

### Q18: Polar-to-Cartesian — `fieldPolarToCartesian` — RESOLVED: Remove (composite block)

**Context**: `(cx + r*cos(a), cy + r*sin(a))`.

**Engineer feedback**: "Delete as kernel; make it a composite block."

**Impact**: Unanimous. A `PolarToCartesian` composite block wires `cos(angle)` → `mul(radius)` → `add(centerX)` for X, same pattern for Y, then `construct(vec2, x, y)`. About 6-8 internal blocks — well within composite scope.

**Decision**: **Remove. Express as composite block.**

---

### Q19: HSV-to-RGB — `hsvToRgb` — OPEN: Composite infrastructure changes the calculus

**Context**: ~20-line color space conversion. Both field and zipSig variants.

**Engineer feedback**: "Keep as a registry kernel for now (pure, big, and you likely want it). Later it can become a composite block if/when you have a sane way to encapsulate large subgraphs."

**Updated context**: Composite block infrastructure exists and is proven. The engineer's exit condition ("composite blocks") is already met. The question is now purely: is `hsvToRgb` practical to express as a composite?

**Decomposition analysis**: HSV-to-RGB requires ~12-15 internal blocks (abs, clamp, mul, sub, comparisons for the 6 hue sectors). This is more complex than oscillators (~3 blocks) or layouts (~8 blocks) but within composite nesting capability. The existing `PingPong` composite has 7 internal blocks. `hsvToRgb` would be roughly double that — complex but not unprecedented.

**Options**:
- **(A)** Remove as kernel, express as composite. ~15 internal blocks, complex but one-time authoring. Respects "no registry kernels" principle fully.
- **(B)** Keep as registry kernel. The engineer's original recommendation. Pragmatic — hsvToRgb is stable, pure, and unlikely to change. The composite would be authored once and never touched.
- **(C)** Remove the kernel but don't create the composite yet. Color conversion can wait until it's needed. Users can wire the math manually or use Expression blocks.

**Leaning**: (A) — if the infrastructure exists and we want zero registry kernels, use it. The composite is complex but write-once. Alternatively (C) — defer entirely and remove the kernel, since color space conversion isn't needed for the fundamental pieces phase.

---

### Q20: Opacity helpers — `perElementOpacity`, `applyOpacity` — RESOLVED: Remove

**Context**: Alpha-channel multiplication convenience wrappers.

**Engineer feedback**: "Delete; it's extractA → mul → construct."

**Impact**: Unanimous. With generic extract/construct (Q9/Q10), this decomposition is clean.

**Decision**: **Remove both.**

---

### Q21: Geometric helpers — `fieldAngularOffset`, `fieldRadiusSqrt` — RESOLVED: Remove

**Context**: Single-expression compositions.

**Engineer feedback**: "Delete; composite."

**Impact**: Unanimous.

**Decision**: **Remove both.**

---

### Q22: Animation effects (6) — RESOLVED: Remove

**Context**: `jitter2d`, `fieldJitterVec`, `attract2d`, `fieldPulse`, `fieldHueFromPhase`, `fieldGoldenAngle`.

**Engineer feedback**: "Delete; presets/composite blocks later."

**Impact**: Unanimous.

**Decision**: **Remove all 6.**

---

### Q23: Layout kernels — `circleLayout`, `lineLayout`, `gridLayout` (+ UV variants), `circleAngle` — OPEN: Deeper than composites

**Context**: 7 layout kernels arranging instances in geometric patterns. ZipSig (field + signal inputs).

**Engineer feedback**: Remove as kernels, express as composite blocks.

**Critical problem: composites can't express field operations today.** A composite block is a subgraph of existing blocks. A layout composite like `CircleLayoutUV` would need internal blocks wired as:

```
Index → Div(count) → Mul(TAU) → Add(phase) → Sin/Cos → Mul(radius) → construct(vec3)
```

This chain only works if every internal block (`Multiply`, `Sin`, `Cos`, `Add`) is **cardinality-polymorphic** — meaning it accepts both `Signal<float>` and `Field<float>` inputs and produces the corresponding output. Currently, these are **signal-only blocks**. They operate on scalars, not per-instance buffers.

A layout kernel does something that cannot be expressed as a composition of signal-only blocks: it iterates over N instances, computing a different position for each one. The `kernelZipSig` dispatch handles this — it loops over field lanes applying the kernel per-element with signal parameters mixed in.

**The dependency chain for composite layouts**:
1. **Cardinality-polymorphic primitive blocks** — `Multiply`, `Sin`, `Cos`, etc. must accept field inputs
2. **Per-lane opcode dispatch (Q30)** — the evaluator must dispatch scalar opcodes over field buffers
3. **Generic field-level construct (Q10)** — must be able to build `Field<vec3>` from `Field<float>` components
4. **Field intrinsic access** — blocks like `Index` must produce `Field<float>` (per-instance index values)

None of these prerequisites exist today. Until they do, layout kernels **cannot** become composites — they must remain as primitive blocks with field kernels.

**Revised options**:

- **(A) Keep layout kernels as primitive blocks for now.** Accept that the registry kernel table isn't empty yet. These are the only kernels that genuinely can't be expressed as composites today — every other removed kernel (oscillators, easing, shaping, effects) operates on signals and composes fine.

- **(B) Build cardinality-polymorphic blocks as a prerequisite, then migrate layouts to composites.** This is the architecturally correct long-term path but represents significant infrastructure work: Q30 (per-lane dispatch) + Q10 (field construct) + block-level cardinality inference.

- **(C) Keep layout kernels but recategorize them.** They're not "transitional exceptions" — they're **primitives at a different level of the stack** (field-level operations). The distinction is: signal-level operations compose from opcodes; field-level operations compose from field kernels. Layout kernels are field-level primitives, not convenience wrappers.

**Leaning**: (A) or (C). The honest answer is that layout kernels are field-level primitives that serve the same role as opcodes do for signals. Removing them requires building an entirely new capability (cardinality-polymorphic blocks). That's real work, not just "write a composite definition."

**Impact on audit**: This means the registry kernel table will retain layout kernels for the foreseeable future. The audit still removes ~60+ kernels (all signal-level named kernels, all convenience field kernels). The remaining registry kernels (layouts + hsvToRgb) are field-level operations that require cardinality-polymorphic blocks to decompose.

**Testability**: With layout kernels kept as primitives, the compiler/renderer can be tested without composite expansion — the testability constraint (Q31a) is automatically satisfied.

---

### Q24: Shape vertex generators — `polygonVertex`, `starVertex` — RESOLVED: Remove

**Context**: Local-space control point generation for path rendering.

**Engineer feedback**: "Delete; composite later."

**Impact**: Unanimous.

**Decision**: **Remove both.**

---

### Q25: Color broadcast — `broadcastColor` — RESOLVED: Remove

**Context**: Fill field with color from signal inputs.

**Engineer feedback**: "Delete; it's construct + broadcast."

**Impact**: Unanimous. With generic construct (Q10), this is `broadcast(construct(color, r, g, b, a))`.

**Decision**: **Remove.**

---

## Projection & 3D Layout Kernels

### Q26: 3D layout kernels — `gridLayout3D`, `lineLayout3D`, `circleLayout3D`, `applyZModulation` — OPEN: Follows Q23

**Context**: World-space 3D equivalents of Q23 layouts.

**Engineer feedback**: "Same policy as Q23."

**Impact**: Follows Q23 decision. If Q23 keeps one primitive layout for testability, 3D layouts can all become composites (the primitive 2D layout is sufficient for smoke-testing the pipeline). `applyZModulation` is trivially `fieldSetZ(positions, mul(signal, id01))` — remove regardless.

**Decision**: **Remove `applyZModulation` unconditionally. Other 3 follow Q23 — likely all composites since the 2D primitive layout covers the testability need.**

---

## Reduce Operations

### Q27: Reduce operators — `min`, `max`, `sum`, `avg` — RESOLVED: Keep (clarified as kernelKind, not registry kernels)

**Context**: Four reduce operators collapsing field→signal.

**Engineer feedback**: "Keep as kernelKinds handled by evaluator (reduce with op: min/max/sum/avg). Not registry kernels, not opcodes."

**Impact**: The engineer introduces an important **architectural clarification** that the original analysis was fuzzy about. There are three distinct categories:

1. **Opcodes**: Scalar math functions (`add`, `sin`, `hash`, etc.) — live in `OpcodeInterpreter.ts`
2. **KernelKinds**: Cardinality/structural dispatch (`map`, `zip`, `broadcast`, `zipSig`, `reduce`, `pathDerivative`) — live in the evaluator dispatch
3. **Registry kernels**: Named domain-specific functions (`hsvToRgb`, `circleLayout`) — live in `SignalKernelLibrary.ts` / `FieldKernels.ts`

Reduce is category 2 (kernelKind), not category 3 (registry). The `op` parameter (min/max/sum/avg) selects behavior within the kernelKind, similar to how `map` takes a function parameter.

This distinction matters because the audit's goal is to eliminate category 3 (registry kernels). Categories 1 and 2 are the primitive foundation and are not under review.

**Decision**: **Keep. Reduce is a kernelKind with 4 operators. Not a registry kernel.**

---

## Event Operations

### Q28: Event kinds — `pulse`, `wrap`, `combine`, `never`, `const` — RESOLVED: Keep (clarified as ValueExprEvent, not kernels)

**Context**: Discrete occurrence operations.

**Engineer feedback**: "Keep as ValueExprEvent kinds. Not kernels."

**Impact**: Same architectural clarification as Q27. Events are their own ValueExpr variant family (`ValueExprEvent`), not kernels dispatched through the kernel system. They have their own evaluator (`ValueExprEventEvaluator.ts`) and their own IR representation.

The original question about whether events are "in scope" for the current phase remains **unanswered by the feedback**. The engineer says keep the IR and evaluation capability, but doesn't address whether event-producing blocks should exist in the block library now.

**Open question (unchanged)**: Should event blocks (EventToSignalMask, SampleHold, etc.) be active, or should the event system be deferred to a later phase?

**Decision**: **Keep the event IR and evaluator. Scope of event-producing blocks remains open.**

---

## Cross-Cutting Questions

### Q29: Generic extract/construct vs named-per-type — RESOLVED: Generic (Option B)

**Context**: 7 extraction + 5 construction kernels, each named per type/component.

**Engineer feedback**: Option B for both. Generic `extract(componentIndex)` and `construct(payloadKind, components...)`.

**Impact**: See Q9 and Q10 above for full analysis. The implementation approach (new ValueExpr variant vs parameterized kernel) is the remaining design question.

**Decision**: **Generic. Implementation design needed.**

---

### Q30: Field-level dispatch architecture — RESOLVED: Per-lane opcode dispatch (Option B)

**Context**: Field kernels duplicate scalar opcodes at buffer granularity.

**Engineer feedback**: "Commit to Option B: field zip/map applies scalar opcodes per-lane (stride-aware loop)."

**Impact**: See Q17 above. This is the single most impactful architectural decision in the audit. It eliminates the field kernel dispatch table for any operation that is just a strided scalar op. What remains in the field kernel system are:
- Layout kernels (Q23, transitional)
- hsvToRgb (Q19, transitional)
- Any future kernel that genuinely can't be expressed as per-lane opcode application

**Decision**: **Option B. Field evaluation reuses scalar opcodes via stride-aware per-lane dispatch.**

---

### Q31a: Primitive Field<vec3> production — NEW: Testability gate

**Context**: The compiler and renderer must be testable without depending on composite expansion (graph normalization Pass 0). This means there must be a path from primitive-only blocks to a rendered frame.

The rendering pipeline requires `Field<vec3>` positions. Currently, the only primitive blocks that produce position fields are layout blocks (`CircleLayoutUV`, `LineLayoutUV`, `GridLayoutUV`), which use field kernels internally. If all field kernels are removed and all layouts become composites, there is no primitive path to a rendered frame.

**This is a hard sequencing dependency**: layout kernels cannot ALL be removed until an alternative primitive `Field<vec3>` production mechanism exists.

**Options** (from Q23):
- **(A)** Keep `gridLayoutUV` as sole primitive layout kernel
- **(B)** Per-lane opcode dispatch (Q30) + generic field-level construct (Q10) — enables math-block layout
- **(C)** New `PackVec3` primitive block — `Field<float>` × 3 → `Field<vec3>`
- **(D)** Placement basis that produces positions directly

**Recommendation**: (A) is the fastest unblock. (B) is the architecturally correct long-term solution. (A) → (B) migration path: ship with one primitive layout kernel now, remove it once per-lane dispatch works.

---

### Q31: Composite block infrastructure — RESOLVED: Already exists

**Context**: Many removals depend on composite blocks.

**Original options**: (A) Remove now, accept loss. (B) Build infrastructure first. (C) Keep minimal exceptions.

**Updated context**: Composite block infrastructure is fully operational:
- `CompositeBlockDef` type with internal blocks, edges, and exposed ports
- `normalize-composites.ts` expansion pass (Pass 0, runs before all other normalization)
- Registration/validation in `registry.ts`
- JSON serialization via Zod-validated schema
- Nesting support (up to depth 5)
- 4 proven library composites: PingPong, SmoothNoise, ColorCycle, DelayedTrigger
- User-defined composites with localStorage persistence

**Impact**: This completely unblocks all kernel removals. Every removed kernel (oscillators, easing, shaping, layouts, effects) can be re-expressed as a `CompositeBlockDef` using existing infrastructure. The composite blocks use the expansion pass — they should NOT have complex `lower()` functions. Instead, they declare internal blocks and edges, and the expansion pass flattens them to primitive blocks before compilation.

**Decision**: **Composite infrastructure exists. All removed kernels that need UX preservation become composite blocks. No transitional exceptions needed.**

---

## Engineer's Taxonomy: Builder Method Categories

The feedback proposes a clean three-category taxonomy for the IRBuilder API. With composite block infrastructure confirmed, Category 3 can potentially be emptied entirely.

### Category 1: Builder Built-in Methods (ValueExpr kinds)
These are IR-level primitives — they create ValueExpr nodes directly.
- `time.*` — time signals
- `event.*` — event expressions
- `external.*` — external input channels
- `intrinsic.*` — instance-bound properties
- `slotRead` — storage access
- `broadcast` / `zipSig` / `reduce` / `pathDerivative` — kernelKinds

### Category 2: Builder Structural Methods (type-level operations)
These are structural intrinsics — they operate on type shape, not computation.
- `extract(value, componentIndex)` — decompose multi-component value
- `construct(payloadKind, components...)` — compose scalar values
- `vec2ToVec3(value2, z=0)` — 2D→3D lift
- `setZ(vec3, zScalar)` — Z component replacement

### Category 3: Builder KernelCall (registry) — TARGET: EMPTY
The original feedback proposed keeping a small set of registry kernels as transitional exceptions. With composite block infrastructure confirmed as operational, the exit condition is already met. The target is **zero registry kernels**.

- `hsvToRgb` — **Open** (Q19): remove as kernel, express as composite or defer entirely
- Layout kernels — **Resolved**: remove as kernels, express as composites

**Impact**: This taxonomy is the most valuable contribution of the feedback. It reframes the audit's outcome not as "which kernels to keep/remove" but as "which category does each operation belong in." Categories 1 and 2 are permanent infrastructure. Category 3 should be empty — anything that would go there becomes a composite block instead.

---

## Revised Summary Table

| # | Kernel(s) | Decision | Category |
|---|-----------|----------|----------|
| Q1 | add/sub/mul/div/mod/pow/neg/abs | **Keep** | Opcode |
| Q2 | sin, cos | **Keep** | Opcode |
| Q2 | tan | **Remove** | — |
| Q3 | min, max, lerp | **Keep** | Opcode |
| Q3 | clamp | **Open — lean remove** | — |
| Q4 | eq, lt, gt | **Keep** | Opcode |
| Q5 | floor | **Keep** | Opcode |
| Q5 | fract, ceil, round | **Open — lean remove** | — |
| Q6 | sqrt | **Keep** | Opcode |
| Q6 | exp, log, sign | **Remove** | — |
| Q7 | wrap01 | **Keep** | Opcode |
| Q8 | hash | **Keep** | Opcode |
| Q9 | extract (generic) | **Keep — redesign** | Structural intrinsic |
| Q10 | construct (generic) | **Keep — redesign + fix signal** | Structural intrinsic |
| Q11 | vec2ToVec3, fieldSetZ | **Keep** | Structural intrinsic |
| Q11 | fieldSwizzle_xy, fieldSwizzle_rgb | **Remove** | — |
| Q12 | Oscillators (6) | **Remove → composite blocks** | — |
| Q13 | Easing (9) | **Remove → composite blocks** | — |
| Q14 | smoothstep, step | **Remove** | — |
| Q15 | noise | **Remove → hash opcode** | — |
| Q16 | combine_* (5) | **Remove → port policy** | — |
| Q17 | fieldAdd, fieldMultiply | **Remove → per-lane opcode** | — |
| Q18 | fieldPolarToCartesian | **Remove → composite block** | — |
| Q19 | hsvToRgb | **Open — lean remove** | — |
| Q20 | perElementOpacity, applyOpacity | **Remove** | — |
| Q21 | fieldAngularOffset, fieldRadiusSqrt | **Remove** | — |
| Q22 | Animation effects (6) | **Remove** | — |
| Q23 | Layout kernels (6 of 7) | **Remove → composite blocks** | Blocked on Q31a |
| Q23 | gridLayoutUV (1 of 7) | **Open — lean keep as primitive** | Q31a |
| Q24 | polygonVertex, starVertex | **Remove** | — |
| Q25 | broadcastColor | **Remove** | — |
| Q26 | 3D layouts (3) | **Remove → composite blocks** | — |
| Q26 | applyZModulation | **Remove** | — |
| Q27 | Reduce ops (4) | **Keep** | KernelKind |
| Q28 | Event ops (5) | **Keep** | ValueExprEvent |

### Counts
- **Keep (permanent)**: ~20 opcodes + 4 structural intrinsics + 4 reduce ops + 5 event ops = **~33**
- **Keep (transitional)**: 1 layout kernel (`gridLayoutUV`) for testability (Q31a) = **1**
- **Remove**: ~70+ named kernels
- **Open**: clamp (Q3), fract/ceil/round (Q5), hsvToRgb (Q19), primitive Field<vec3> strategy (Q31a)

### Remaining Design Work
1. Generic extract/construct IR representation (Q9/Q10)
2. Per-lane opcode dispatch in field evaluator (Q17/Q30)
3. Fan-in port policy in compiler (Q16)
4. Composite block definitions for removed kernels that need UX preservation (Q12/Q13/Q23)

### Sequencing Constraint
Layout kernel removal (Q23) is **gated on Q31a** — there must be a primitive-level path to `Field<vec3>` positions before the last layout kernel can become a composite. The recommended path:
1. **Phase 1**: Remove all kernels except `gridLayoutUV`. Build composite equivalents for all layouts.
2. **Phase 2**: Implement per-lane opcode dispatch (Q30) + generic field-level construct (Q10).
3. **Phase 3**: Remove `gridLayoutUV` kernel — primitive math blocks + construct can produce positions.
