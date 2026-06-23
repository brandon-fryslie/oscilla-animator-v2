# Three Migration ScenePlan: Backend-Neutral Assembly Target

**Date:** 2026-06-23
**Status:** Groundwork
**Backlog:** `oscilla-pillars-cleanup-ulu.1`
**Scope source:** [three-fork-integration-proposal.md](./three-fork-integration-proposal.md) §2.2, §4
**Ownership/seam canon:** [three-migration-backend-canon.md](./three-migration-backend-canon.md)
**Proof target shape:** [three-migration-first-proof-contract.md](./three-migration-first-proof-contract.md)

## Purpose

This note records how the backend-neutral `ScenePlan` introduced by
`oscilla-pillars-cleanup-ulu.1` **replaces** `PipelineInstallPayload` as the
primary compiler→renderer assembly target — and why that replacement is a clean
swap, not a second owner running alongside the first.

The types live in [`src/render/scene-plan/`](../src/render/scene-plan/):

| File | Contents |
|------|----------|
| `refs.ts` | The six backend-neutral resource handles + their constructors. |
| `expr.ts` | `PlanExpr` — serializable per-value expressions + builders. |
| `plan.ts` | `ScenePlan`, `RenderPlan`, resources, scene objects, resource defs. |
| `index.ts` | Public surface. |
| `__tests__/scene-plan.test.ts` | Contract tests: shape + handle discipline. |

## What ScenePlan Is

`ScenePlan` is the compiled, backend-neutral description of one renderable
scene. The compiler assembler (`oscilla-pillars-cleanup-ulu.3`) produces it; the
Three-backed renderer behind `createWebGPURenderer()`
(`oscilla-pillars-cleanup-ulu.2`) consumes it.

```
user patch ─► normalized graph ─► ScenePlan ─► Three backend
                                   ▲                ▲
                                 ulu.3            ulu.2
```

Its nouns:

- **Resource handles** (`GeometryRef`, `MaterialRef`, `TextureRef`,
  `SceneObjectRef`, `ComputeResourceRef`, `PostChainRef`) — branded string
  handles, foreign keys into the plan's normalized resource tables. A handle
  carries identity only; it is never a Three object, UUID, or class.
- **`PlanExpr`** — a serializable description of how one scalar value is
  computed from runtime inputs (`time`) and per-instance intrinsics
  (`index`, `rank`). The renderer translates a `PlanExpr` into a TSL node graph.
- **`ScenePlan` / `RenderPlan`** — the normalized resource tables, the placed
  scene objects that compose resources, and the per-frame render orchestration
  (camera, declared input channels, ordered draws, optional post chain).

`// [LAW:locality-or-seam]` The handles *are* the seam. ulu.3 mints them; ulu.2
resolves them. Neither side reads the other's internals.

## The Replacement — and Why There Is No Dual Ownership

The legacy path assembled to `PipelineInstallPayload`
(`src/render/rust/boundary-contract.ts`): `{ manifest, roster }`, a Rust-
boundary-oriented shape carrying `MemoryManifest`, `RosterEntry`, and the
custom `ExprIR`. That payload was designed to cross the TS→Rust/WASM boundary
and feed the custom GPU-IR renderer. The canon lists it under **Dead Concepts**.

`ScenePlan` replaces it as the *primary assembly target*. The replacement is a
**swap, not a fork of ownership**, and the following rules make that precise:

1. **No wrapping.** `ScenePlan` does not contain, embed, or reference a
   `PipelineInstallPayload`, `manifest`, `roster`, or any `boundary-contract`
   type. (Enforced by a source-level contract test: no scene-plan source file
   imports `boundary-contract`.)
   `// [LAW:one-source-of-truth]` A concept has one authoritative representation.
   `ScenePlan` is that representation for the Three path; it does not derive
   from or sync with the Rust payload.

2. **No round-trip.** Nothing lowers a `ScenePlan` back into a
   `PipelineInstallPayload` to keep old tooling alive. The canon forbids
   "rebuild Rust payloads from `ScenePlan` just to preserve old tooling."
   `// [LAW:no-silent-failure]` A reconstructed legacy payload would be a second
   source of truth that silently drifts from the plan.

3. **The legacy payload is frozen, not deleted-yet.** `PipelineInstallPayload`
   and `src/pillars/assembly/payload.ts` remain only as legacy artifacts of the
   dead Rust path during migration (canon §"Dead Concepts"). New backend work
   targets `ScenePlan`. The two targets do not co-assemble from one graph: the
   Three path produces a `ScenePlan`, the (frozen) Rust path produces a
   `PipelineInstallPayload`, and the migration converges on the former.

`// [LAW:carrying-cost]` A backend-neutral plan composes with any renderer at
near-zero coupling; a Rust-boundary payload couples the compiler to one dead
backend. Replacing the target lowers the carrying cost of every downstream
ticket.

## Concept Mapping

| Legacy (`PipelineInstallPayload` / boundary-contract) | New (`ScenePlan`) |
|---|---|
| `PipelineInstallPayload { manifest, roster }` | `ScenePlan { version, resources, objects, render }` |
| `MemoryManifest` (globals, domains, textures, shapes, samplers) | `ScenePlan.resources` tables, keyed by ref |
| `StaticGeometrySpec` / shape-bank entry | `GeometryDef` behind a `GeometryRef` |
| material baked into roster render entry | `MaterialDef` behind a `MaterialRef` |
| `TextureSpec` (inline) | `TextureDef` behind a `TextureRef` (asset-resolved; ulu.4) |
| `RosterEntry` (compute/drawPrep/render passes) | `RenderPlan.draws` + scene objects (compute/post deferred) |
| `ExprIR` (Rust-translated AST) | `PlanExpr` (TSL-translated, backend-neutral) |
| `InstanceDomainSpec` count + active | `InstancingPlan.count` + per-instance `PlanExpr` transform |
| `CameraInputContract` `cameraProjection` flag | `CameraPlan` discriminated variant |
| runtime input shared-buffer fields | `RenderPlan.inputs` (declared `PlanInputChannel`s) |

## Backend-Neutrality Guarantees

A `ScenePlan` is **pure data**:

- It is fully JSON-serializable — no functions, no class instances, no Three
  objects. (Enforced: a `JSON.parse(JSON.stringify(plan))` round-trip is
  structurally equal to the original.)
- It names resources by branded handle, never by renderer object.
- It imports nothing from `three`, `render/wasm`, or `boundary-contract`.

`// [LAW:behavior-not-structure]` The contract tests assert what the plan
*means* — that it can represent the `Grid of Squares` proof target and that its
handles resolve — not how a renderer realizes it.

## Deferred Surface

The first proof target (`Grid of Squares`) needs no textures, compute, or
postprocessing. Those refs exist (the assembly contract requires all six), but
their resource definitions are minimal placeholders and their tables are empty
for the steel thread:

- **Textures** — asset decoding is owned by `oscilla-pillars-cleanup-ulu.4`
  (`AssetRegistry` + `ThreeLoadingBridge`). `TextureDef.assetId` is a plain
  string until the branded `AssetId` lands with that ticket.
- **Compute / storage** — served by TSL compute when a ticket first needs
  solver-style work (three-fork-deltas.md §3, §4.2).
- **Post chains** — served by Three post nodes when a ticket first needs
  postprocessing (three-fork-deltas.md §3).

`// [LAW:dataflow-not-control-flow]` Deferred capabilities are empty collections
in the plan, not absent fields or mode flags. The shape is fixed; only the
contents vary.

## Handoff

- `oscilla-pillars-cleanup-ulu.2` realizes a `ScenePlan` behind
  `createWebGPURenderer()` (translate `PlanExpr`→TSL, `GeometryDef`→Three
  geometry, `MaterialDef`→`NodeMaterial`).
- `oscilla-pillars-cleanup-ulu.3` lowers authored patch semantics into a
  `ScenePlan` (replacing `assemblePipelineInstallPayload`).
- `oscilla-pillars-cleanup-ulu.5` proves `Grid of Squares` renders through the
  Three backend per the first-proof contract.

## Related References

- [three-fork-integration-proposal.md](./three-fork-integration-proposal.md) — migration scope source
- [three-migration-backend-canon.md](./three-migration-backend-canon.md) — ownership, seams, dead concepts
- [three-fork-deltas.md](./three-fork-deltas.md) — capability surface, tiers, deferred items
- [three-migration-first-proof-contract.md](./three-migration-first-proof-contract.md) — steel-thread target + verification
