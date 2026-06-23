# B2: SourceBundle — ScenePlan Retarget

**Status:** Draft

**Subject:** `SourceBundle` lowering and pillars deltas for a forked Three
`WebGPURenderer` + TSL backend emitting `ScenePlan`.

**Prerequisites:**
- `B0-4-Pillar-Arch-UBER.md` — authoring model (generators, modifiers, intents).
- `three-fork-integration-proposal.md` — backend direction and `ScenePlan`.

---

## 1. Substrate

Compilation target is `ScenePlan`, the backend-neutral artifact defined in
[three-fork-integration-proposal.md](../three-fork-integration-proposal.md)
§2.2 and §4.3. `ScenePlan` is consumed by a forked Three `WebGPURenderer`
backend.

Where SourceBundle content lands inside a `ScenePlan`:

- Per-instance math on an instance domain → TSL compute node, dispatched at
  that domain's capacity.
- Fields consumed by rendering → TSL expressions on a `NodeMaterial`, bound
  to an `InstancedMesh` / `Points` / equivalent render object.
- Cross-frame or cross-domain state → TSL storage buffer.

Fusion, dispatch binding, pass ordering, and shader-source generation are
TSL's job. This doc does not restate them as our constraints.
`// [LAW:single-enforcer]`

---

## 2. SourceBundle Type Shape

`SourceBundle` already exists in `src/pillars/block-api.ts` as
`Readonly<Record<string, ExprIR>>`. This doc does not redefine it. The only
change this retarget makes to the type is the per-field payload.

Today:

```
type SourceBundle = Readonly<Record<string, ExprIR>>
// where ExprIR comes from src/render/rust/boundary-contract
// (the Rust-worker PipelineInstallPayload IR being retired)
```

After retarget:

```
type SourceBundle = Readonly<Record<string, FieldExpr>>
// where FieldExpr is TSL (authored via three.js TSL exports)
```

In this section, `LoweredBundle`, `LoweredIntent`, and
`LoweringContext.inputBundles` keep their current shapes. Section 3 removes
`PillarEdge.role`. Downstream concerns — intent emission, manifest-to-TSL
mapping, the `ScenePlan` assembler — belong to later sections.
`// [LAW:one-source-of-truth]`

---

## 3. Edges Are Arrows. Behavior Lives in Passes.

`PillarEdge` carries only `{ source, target, inputSlot }`. No role. No
interpretation flag. No materialization hint. An edge is a dataflow arrow
that says "this bundle flows into that slot." It encodes no behavior.

All decisions happen at nodes and at passes:

- A bundle has a `domainId` (or none). Set by the producing node; generators
  declare it, modifiers carry their own output domain.
- A node has an output domain. Derived at lowering time. Not an edge fact.
- Cross-domain mixing is handled by inserting an explicit Materialize pass
  into the ScenePlan — a compute pass dispatched at the source domain's
  capacity whose only job is to write the upstream bundle's fields to a TSL
  storage buffer. The consuming node then reads from storage like any other
  input. The Materialize pass is a ScenePlan entry, not an edge annotation.

Writability has no edge-level encoding. A modifier produces one output
bundle at one domain. It has no mechanism to write into any other domain
because it produces no other output. No flag on any edge encodes this — it
falls out of the type.

`// [LAW:dataflow-not-control-flow]` The Materialize pass exists because
materialization is a real operation that consumes dispatch time and storage.
Making it a pass makes that cost visible in the ScenePlan instead of hiding
it inside a walker branch on an edge property.

---

## 4. Modifier Lowering

A modifier's `lower(args, ctx)` receives:

- `ctx.inputBundles`: bundles wired into its input slots, keyed by slot name.
  Each is a `SourceBundle` — `Readonly<Record<FieldName, FieldExpr>>` where
  `FieldExpr` is a TSL expression.
- `ctx.manifest`: the merged memory manifest (declared storage, domains,
  textures).

It returns a `LoweredBundle`: a new `SourceBundle` plus the output
`domainId`. Construction is pure TSL expression composition. No backward
walk. No fusion pass. No scope manager. TSL tracks node identity;
referencing the same input expression in two output fields emits one shared
node in the generated shader.

Example — hand-coded sine-warp modifier:

```
const lower = (args, ctx) => {
  const input = ctx.inputBundles[args.inputSlot];
  return {
    kind: 'bundle',
    output: {
      ...input,
      pos_y: sin(mul(input.pos_x, 2.0)),
    },
    domainId: args.outputDomainId,
  };
};
```

`pos_x` is unchanged — the same TSL expression object flows from input to
output. `pos_y` is a new TSL expression built from `input.pos_x`. A
downstream modifier that also references `pos_x` gets the same node; TSL
emits one `cos(angle)` in the generated shader, not two.

Expression-text parsing (lifting `pos_y = sin(pos_x * 2.0)` into this
composition) is a separate authoring surface and not covered by this doc.

---

## 5. Intents Emit ScenePlan Entries

A `LoweredIntent.passes` is an array of ScenePlan entries, not the current
`RosterEntry[]` imported from the retired Rust boundary contract. ScenePlan's
entry shape is defined in
[three-fork-integration-proposal.md](../three-fork-integration-proposal.md)
§4.3 and is not this doc's responsibility.

The one coupling back to SourceBundle: an intent that consumes a bundle uses
the bundle's TSL expressions directly — as field bodies in a `NodeMaterial`,
as inputs to a TSL compute node, or as values written into a storage buffer.
Intents compose what the bundle provides; they do not re-author field values.

---

## 6. Open Questions

### 6.1 Bundle Shape Verification

`SourceBundle = Readonly<Record<string, FieldExpr>>` is purely structural. A
walker or intent that wants to confirm "does this bundle have `pos_x`?" only
has runtime membership checks. Options:

- Add a declared field-set to `LoweredBundle` (bundle schema). Walker fails
  at lowering time.
- Push verification down to TSL build (fail later but with less pillars
  machinery).
- Accept runtime checks and surface clear diagnostics at the call site.

### 6.2 Output Domain Declaration

A modifier's output `domainId` must come from somewhere. Candidates:

- Explicit in the modifier's `args` (Section 4's example).
- Inferred when exactly one input bundle is per-instance.
- Required config on every modifier.

The first is verbose but honest. The second is implicit and breaks on
ambiguity. The third is the first dressed as a registry constraint.

### 6.3 Cross-Domain Cardinality Bridging

A Materialize pass makes cross-domain reads structurally explicit, but when
source and destination domain capacities differ (64 → 128) the pass writes
only 64 storage slots. The consumer needs an explicit indexing rule — wrap,
clamp, reduce, broadcast, gather. This doc's position: the rule lives in a
block (`Resample`, `Reduce`, `Gather`), never in an implicit walker rewrite.
Which blocks, what shape, and how they declare their indexing rule is
deferred to a later doc.

---

## 7. Summary

| Decision | Justification |
|----------|---------------|
| `SourceBundle` shape unchanged; `FieldExpr` becomes TSL | TSL is the expression substrate for the three.js backend; introducing a second IR is duplicate authority |
| `PillarEdge.role` removed; edges carry no behavior | Dataflow, not control flow. Behavior lives at nodes and passes |
| Cross-domain reads handled by an explicit Materialize pass in the ScenePlan | Makes the real cost (dispatch time + storage) inspectable instead of hiding it inside a walker branch |
| A modifier produces one output bundle at one domain | Writability to other domains falls out of the type. No flag encodes it |
| Fusion and node-sharing are TSL's responsibility | Single enforcer. No `PassScopeManager`, no hand-rolled CSE |
| Intents emit ScenePlan entries | Retires `RosterEntry[]` imported from the Rust boundary contract |
