CanonicalType Guardrails

1) Single Authority
- DO NOT invent or persist any parallel “type” structure (SignalType, PortType, FieldType, EventType, PayloadType+UnitType without Extent, etc.).
- Instead: every value’s type is exactly CanonicalType = { payload, unit, extent }.
- Example: a port stores CanonicalType, not { kind:'signal', payload:'float' }.
- DO NOT add “kind: signal|field|event” as a stored field anywhere in IR/runtime.
- Instead: derive it from extent via deriveKind(t).
- Example: if (deriveKind(type) === 'field') ...

2) Derived Kind Must Be Total and Deterministic
- DO NOT special-case “signal/field/event” based on node classes or codepaths.
- Instead: all dispatch uses deriveKind(type) and/or payloadStride(type.payload).
- Example: kernel evaluator chooses scalar vs strided write based on payloadStride.

3) Axis Shape Contracts Are Non-Negotiable
- DO NOT allow “signal with cardinality many” or “field with cardinality one” to exist post-validation.
- Instead: enforce these via a single axis-validation gate that runs before backend compilation.
- Example: validateAxes(exprs) rejects a kernel expr with many(instance) unless it’s a field op.
- DO NOT allow discrete temporality to exist for non-events (unless explicitly added as a new derived family later).
- Instead: temporality=discrete implies event semantics and must satisfy event invariants.
- Example: discrete ⇒ payload bool + unit none (hard invariant).

4) “Vars” Are Inference-Only
- DO NOT let Axis.kind:'var' escape the frontend boundary into backend/runtime/renderer.
- Instead: frontend produces fully-instantiated axes for all compiled artifacts.
- Example: after type solve, all extent.*.kind are inst.
- DO NOT treat var as “default”.
- Instead: constructors decide defaults and produce inst.
- Example: canonicalSignal(...) sets perspective/branch/binding as inst(default).

5) One Enforcement Gate
- DO NOT scatter ad-hoc axis checks throughout code.
- Instead: one “belt-buckle” pass (frontend) + small local asserts at boundaries where needed.
- Example: axis-validate.ts is the only place that decides “this IR is allowed”.
- DO NOT bypass validation in “debug”, “preview”, or “partial compile” paths.
- Instead: if compilation is partial, the output must be explicitly tagged as “unvalidated”.
- Example: UI tooling can view “incomplete” graphs, but backend compile requires validated artifacts.

6) No Untyped Values Anywhere
- DO NOT create any value-producing node/expr/slot without type: CanonicalType.
- Instead: type is mandatory on every ValueExpr variant.
- Example: events have type (discrete bool none) the same as everything else.

7) Const Values Must Be Payload-Shaped
- DO NOT store constants as number|string|boolean (or any).
- Instead: store a discriminated ConstValue keyed by payload kind.
- Example: { kind:'vec3', value:[x,y,z] }.
- DO NOT allow ConstValue.kind !== CanonicalType.payload.kind.
- Instead: enforce in axis/value validation.
- Example: reject payload=float with {kind:'bool'...}.

8) Units Are Canonical, Not Inference Junk
- DO NOT put unit variables inside UnitType.
- Instead: unit vars live in inference-only wrappers/constraints, never in CanonicalType.
- Example: solver tracks UnitVarId separately, outputs concrete UnitType.
- DO NOT interpret unit semantics outside adapters/lenses.
- Instead: only explicit ops (blocks/kernels) change unit.
- Example: radians→degrees is an adapter block, not a hidden rule.

9) Only Explicit Ops Change Axes
- DO NOT mutate extent axes as a side-effect of unrelated ops.
- Instead: only a small, named set of ops may change axes (e.g. broadcast/reduce/state ops).
- Example: Broadcast changes cardinality one→many; ordinary math kernels preserve extent.
- DO NOT “helpfully” convert signal↔field/event implicitly in evaluator.
- Instead: require an explicit adapter/lens node.
- Example: signal→field uses Broadcast (explicit).

10) Instance Identity Lives in Type, Not Node Fields
- DO NOT attach instanceId as a separate field on field expressions/steps when it’s already in extent.cardinality.
- Instead: require/derive via requireManyInstance(type).
- Example: FieldKernel uses requireManyInstance(expr.type).
- DO NOT use string for IDs once branded IDs exist.
- Instead: all ids are branded (InstanceId, KernelId, ValueExprId, etc.).
- Example: instanceId: InstanceId, not string.

11) Naming & Discriminants Are Consistent
- DO NOT introduce mixed discriminants (kind in one family, op in another) without a single project-wide rule.
- Instead: choose one discriminant name per union style and stick to it everywhere.
- Example: if ValueExpr uses op, all ValueExpr variants use op.
- DO NOT introduce snake_case discriminant values.
- Instead: use consistent camelCase identifiers.
- Example: reduceField, not reduce_field.

12) Kernel/Op Contracts Must Be Type-Driven
- DO NOT have kernel behavior depend on “this came from signal IR vs field IR”.
- Instead: kernel input/output behavior is defined by CanonicalType only.
- Example: a kernel with many(instance) processes lane arrays; with one it processes scalars.
- DO NOT let “stride” float around as its own type system.
- Instead: stride is derived from payload only (payloadStride), always.
- Example: vec3 ⇒ stride 3.

13) Adapter/Lens Policy Is Separate From Type Soundness
- DO NOT bake auto-insert UX policy into type rules.
- Instead: adapter insertion is a frontend transform using explicit adapter blocks that are already type-correct.
- Example: float→phase01 uses Adapter_ScalarToPhase01 block; auto-insert is optional.

14) Frontend/Backend Boundary Is Strict
- DO NOT have UI read random intermediate compiler globals or partially solved structures.
- Instead: UI reads only pass snapshots (CompilationInspectorService) and validated frontend artifacts.
- Example: UI type menus consult TypedPatch.portTypes from frontend output.

15) Diagnostics Can’t Create “Hidden Types”
- DO NOT encode type meaning into diagnostic-only fields that then get relied upon.
- Instead: diagnostics reference CanonicalType and existing IDs only.
- Example: a mismatch diagnostic carries expected: CanonicalType, actual: CanonicalType.

16) Migration Hygiene
- DO NOT keep legacy type aliases alive indefinitely.
- Instead: hard-deprecate and delete; enforce via build rule/grep check.
- Example: failing CI if SignalType or ResolvedPortType reappears.

17) Tests That Make Cheating Impossible
- DO NOT accept “seems fine” without invariants tested.
- Instead: add invariant tests that fail if a second system appears.
- Example: tests that ensure every ValueExpr variant has type, no Axis.var in backend IR, and deriveKind is total.