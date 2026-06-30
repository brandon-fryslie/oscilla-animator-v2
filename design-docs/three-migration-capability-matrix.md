# Three Migration Capability Matrix: Native Block Library

**Date:** 2026-06-29
**Status:** Groundwork
**Backlog:** `oscilla-pillars-scene-nt56.2` (epic `oscilla-pillars-scene-nt56`)
**Scope source:** [three-migration-backend-canon.md](./three-migration-backend-canon.md) ·
[three-migration-scene-plan.md](./three-migration-scene-plan.md) ·
[three-fork-deltas.md](./three-fork-deltas.md) §3

## Purpose

This is the one capability matrix for the Three-native block library: it says
which typed values and ScenePlan resources are *legal* execution data, and maps
each user-facing native block category onto the backend-neutral ScenePlan
concept that realizes it. Block work crystallizes if every block invents its own
capability shape; this matrix is the shared vocabulary every native block,
modifier, material, and asset block compiles into.

`// [LAW:one-source-of-truth]` **ScenePlan is the source of truth for
backend-neutral execution data.** This document is a *projection* of the
ScenePlan types in [`src/render/scene-plan/`](../src/render/scene-plan/) — it
does not define a second, parallel capability enum that could drift from them.
When a row below names a "ScenePlan data concept", that concept is a concrete
type in `plan.ts` / `expr.ts` / `refs.ts`, and the type — not this prose — is
authoritative.

`// [LAW:types-are-the-program]` The matrix is *embodied in discriminated
unions*, not enforced by checks: a capability is legal iff the ScenePlan types
can represent it. An illegal capability (a textured material with no texture, a
color with no space, a runtime value masquerading as a constant) is
unrepresentable by construction, not rejected at runtime.

## How To Read This Matrix

A native block is authored, type-checked, and lowered along one path:

```
authored block (category, config, ports)
   │  contribute()
   ▼
SceneContribution (role: instanceSource | draw)      src/pillars/scene/scene-block.ts
   │  assembleScenePlan()
   ▼
ScenePlan data concept (resource def / binding / expr) src/render/scene-plan/
```

So three vocabularies meet here and must agree:

1. **Block categories** (`SceneBlockCategory`) — the palette grouping the user sees.
2. **Port value kinds** (`SceneValueKind`) — the typed value a port carries between blocks.
3. **ScenePlan data concepts** — the backend-neutral execution data a block lowers into.

The matrix below pins each to the next, and marks every capability **Realized**
(a ScenePlan variant the first block set uses today) or **Deferred** (named here,
no ScenePlan variant minted yet — owned by a later ticket).

## 1. Block Categories → ScenePlan Contribution

`SceneBlockCategory` is the authoring grouping; `SceneContribution.role` is what
the block hands to assembly. Categories are a palette concern and may be richer
than roles (many categories collapse onto the two assembly roles today).

| Block category | Contribution role | ScenePlan data concept it produces | Status |
|----------------|-------------------|-------------------------------------|--------|
| `instance`     | `instanceSource`  | `InstancingPlan` (count + `TransformBinding`) + `ColorBinding` | **Realized** |
| `modifier`     | `instanceSource`  | rewrites `TransformBinding` / `ColorBinding` `PlanExpr` trees (no new variant) | **Realized** (foundation: nt56.4) |
| `draw`         | `draw`            | `SceneObject` + `DrawItem` + `CameraPlan` + `GeometryDef` | **Realized** |
| `material`     | `draw`            | `MaterialDef` (the shading model on the draw's object) | **Realized** |
| `color`        | `instanceSource`  | `ColorBinding` (a color the instance source carries) | **Realized** (primitives: nt56.5) |
| `asset`        | `draw`            | `TextureDef` minted into `ScenePlan.resources.textures` | **Realized** (asset blocks: nt56.6) |

`// [LAW:dataflow-not-control-flow]` A block's contribution is a *value* of the
`SceneContribution` union, not a branch in the lowering. Adding a category does
not add a code path to assembly; it adds a row that produces one of these
concepts.

## 2. Port Value Kinds → ScenePlan Data Concept

`SceneValueKind` (the value a typed port carries, declared in
`src/pillars/scene/scene-block.ts`) maps onto ScenePlan data concepts as follows.
A **Deferred** kind is a legal *port* vocabulary entry whose ScenePlan
realization is owned by a later ticket — there is intentionally no plan variant
for it yet, so a half-built capability cannot be half-represented.

| Port value kind   | ScenePlan data concept | Status |
|-------------------|-------------------------|--------|
| `instanceBundle`  | `InstancingPlan` + `ColorBinding` (assembly's `InstanceBundle`) | **Realized** |
| `geometry`        | `GeometryDef` (`rectangle` \| `point`) | **Realized** |
| `materialShell`   | `MaterialDef` (`unlitColor` \| `texturedUnlit` \| `unlitColorLut`) | **Realized** |
| `texture`         | `TextureDef` (`asset` \| `data`) behind a `TextureRef` | **Realized** |
| `camera`          | `CameraPlan` (`orthographic`) | **Realized** |
| `color`           | `ColorBinding` (`hsl` \| `rgb` \| `rgba`) | **Realized** |
| `scalar`          | `PlanExpr` (one backend-neutral scalar value) | **Realized** |
| `mask`            | *(none yet)* — per-instance visibility predicate | **Deferred** |

`// [LAW:types-are-the-program]` `mask` is the only port kind with no ScenePlan
concept. It stays a port-vocabulary entry only; minting a `mask` plan variant
before a mask block exists would make an unfinished capability representable.
The matrix records the deferral rather than the type permitting it.

## 3. ScenePlan Resource Tables

Every plan carries all five resource tables (`ScenePlanResources`). A table is a
ref-keyed record; a deferred capability is an **empty table**, never an absent
field or a flag.

| Resource table     | Resource def            | Status |
|--------------------|-------------------------|--------|
| `geometries`       | `GeometryDef`           | **Realized** |
| `materials`        | `MaterialDef`           | **Realized** |
| `textures`         | `TextureDef`            | **Realized** (`asset`-resolved by the bridge; `data` LUTs built in-bridge for palette/gradient color) |
| `computeResources` | `ComputeResourceDef`    | **Deferred** — empty; TSL compute (three-fork-deltas §4.2) |
| `postChains`       | `PostChainDef`          | **Deferred** — empty; Three post nodes (three-fork-deltas §3) |

`// [LAW:dataflow-not-control-flow]` `computeResources` and `postChains` are
present-but-empty for the first block set. The shape is fixed; only the contents
vary. A renderer iterating a table sees zero entries, not a missing key.

## 4. Per-Value Expression Vocabulary (`PlanExpr`)

A `PlanExpr` is the backend-neutral description of one scalar value — the
realization of every `scalar` port and every channel of a `TransformBinding` or
`ColorBinding`. Its vocabulary is sized to the first demo patches
(`[LAW:no-mode-explosion]`); new operators are added to these unions and
consumers stay exhaustive.

| Concept            | Members | Status |
|--------------------|---------|--------|
| Runtime inputs (`PlanInputChannel`) | `time` (realized); `mouseX/Y`, `mouseButtons`, `audioLow/Mid/High`, `gaugeActive` (mirrors runtime envelope) | **Realized** (`time`) |
| Intrinsics (`PlanIntrinsic`) | `index`, `rank` | **Realized** |
| Unary ops (`PlanUnaryOp`) | `floor`, `sin`, `cos`, `negate`, `fract`, `hash` (pseudo-random `[0,1)` — the one op not composable from the float leaves) | **Realized** |
| Binary ops (`PlanBinaryOp`) | `add`, `sub`, `mul`, `div`, `mod`, `step` (threshold → boolean) | **Realized** |
| Leaves | `const` (baked) vs `input` (runtime channel) — structurally distinct | **Realized** |

`// [LAW:dataflow-not-control-flow]` The `const` vs `input` split is structural,
not a flag: a runtime value is an `input` node and a baked value is a `const`
node. "Is this value animated?" is answered by the shape, never by a boolean.

## 5. Render Orchestration

| Concept        | ScenePlan type | Members | Status |
|----------------|----------------|---------|--------|
| Camera         | `CameraPlan`   | `orthographic` (perspective added as a new variant when needed) | **Realized** (`orthographic`) |
| Render target  | `RenderTarget` | `previewCanvas` (offscreen/MRT targets added as variants when needed) | **Realized** (`previewCanvas`) |
| Per-frame inputs | `RenderPlan.inputs` | derived `PlanInputChannel[]` (projection of the plan's exprs) | **Realized** |
| Post chain     | `RenderPlan.postChain` | `PostChainRef \| null` (null today) | **Deferred** |

`// [LAW:one-source-of-truth]` `RenderPlan.inputs` is *derived* from the plan's
expressions (`src/pillars/scene/inputs.ts`), never hand-declared — the
expressions are the single source of truth and the input list is their
projection.

## 6. Deferred Capability Register

Named here so blocks do not invent ad-hoc shapes for them. Each lands as a new
**discriminated variant or a populated table**, never a boolean flag, when its
owning ticket arrives.

| Deferred capability | How it lands | Owner |
|---------------------|--------------|-------|
| Per-instance scale  | new field(s) on `TransformBinding` | first patch needing it |
| Perspective camera  | new variant of `CameraPlan` | first patch needing it |
| Additional render targets (offscreen/MRT) | new members of `RenderTarget` | first patch needing it |
| Per-instance visibility (`mask`) | new ScenePlan binding + `mask` port realization | first mask block |
| Compute / storage   | entries in `computeResources` (`ComputeResourceDef`) | TSL compute ticket (three-fork-deltas §4.2) |
| Postprocessing      | entries in `postChains` + non-null `RenderPlan.postChain` | Three post ticket (three-fork-deltas §3) |
| Additional color spaces / material kinds | new `ColorBinding` / `MaterialDef` variants | nt56.5 |

`// [LAW:carrying-cost]` Each deferred capability is a *named slot*, not built
machinery. Documenting the slot costs nothing and keeps the type minimal;
building it speculatively would add carrying cost with no caller.

## 7. Gap Analysis: Variants Needed by the First Block Set

The ticket asks for "any missing ScenePlan pure-data variants needed by the
first block set." Result: **none.** Walking the first block slices against the
type surface:

- **instance sources** → `InstancingPlan` + `TransformBinding` + `ColorBinding` — present.
- **modifiers** → compose `PlanExpr` trees over an existing bundle — no new variant.
- **draw / material shells** → `GeometryDef` + `MaterialDef` + `CameraPlan` — present.
- **color** → `ColorBinding` (`hsl`/`rgb`/`rgba`) — present.
- **assets** → `TextureDef` minted into the `textures` table — present.
- **validation** → operates on the existing plan + contributions — no new variant.

So this ticket adds no speculative variants; it ratifies the existing type
surface as the capability matrix and locks it with tests (§8). New variants
arrive with the tickets in §6 that actually need them.

## 8. Enforcement

`// [LAW:single-enforcer]` Two mechanical gates keep this matrix honest; both
live under [`src/render/scene-plan/__tests__/`](../src/render/scene-plan/__tests__/).

1. **Representative round-trip** (`capability-matrix.test.ts`) — builds one
   ScenePlan that exercises *every* Realized variant in the matrix (both
   geometries, all three color spaces, both materials, every `PlanExpr` kind,
   the deferred-but-populated resource defs) and asserts a
   `JSON.parse(JSON.stringify(plan))` round-trip is structurally equal. This
   proves every matrix row is pure, serializable data — and that the matrix
   cannot claim a variant the types cannot represent.

2. **Backend-neutrality guard** (`scene-plan.test.ts`) — asserts no ScenePlan
   source imports `three`, `boundary-contract`, the legacy `PipelineInstallPayload`
   path (`pillars/assembly`), the GPU-IR stack (`render/gpu-ir`, `render/rust`),
   or `render/wasm`. `// [LAW:no-silent-failure]` A legacy import is a loud test
   failure, not a silent re-coupling to the frozen payload path.

## Related References

- [three-migration-scene-plan.md](./three-migration-scene-plan.md) — how ScenePlan replaces `PipelineInstallPayload`
- [three-migration-backend-canon.md](./three-migration-backend-canon.md) — ownership, seams, dead concepts
- [three-fork-deltas.md](./three-fork-deltas.md) — capability tiers; deferred compute/post/asset surface
- [three-migration-first-proof-contract.md](./three-migration-first-proof-contract.md) — steel-thread target
- `src/render/scene-plan/` — the authoritative types this matrix projects
- `src/pillars/scene/scene-block.ts` — block contract, `SceneValueKind`, `SceneBlockCategory`
