# Three Fork Deltas: Vendor Strategy & Capability Surface

**Date:** 2026-06-23
**Status:** Groundwork
**Backlog:** `oscilla-pillars-cleanup-ulu.6`
**Decision rule:** [three-migration-backend-canon.md](./three-migration-backend-canon.md) §"Fork Delta Decision Rule"

## Purpose

This is the single register of justified Three-fork deltas, the workflow for
vendoring and updating the fork, the capability surface the app is allowed to
rely on from it, and the reconciliation of the legacy vm4 gap-analysis against
Three adoption.

`// [LAW:one-source-of-truth]` The canon states the *rule* that admits a fork
delta; this doc is the one *register* of deltas that have passed it. There is no
second place where fork-specific behavior is justified — not code comments, not
ticket text.
`// [LAW:single-enforcer]` Every delta enters through one gate (the canon's
decision rule). A change that has not passed all six clauses of that rule is not
a fork delta and does not appear in the register below.
`// [LAW:carrying-cost]` A fork is the highest-carrying-cost artifact in the
project: every delta must be re-applied onto every upstream Three update for the
life of the fork. The default state of the register is therefore **empty**, and
the burden of proof is on the delta, not on upstream.

## 1. Capability Inventory: Fork vs. Adapter vs. Upstream

`// [LAW:no-mode-explosion]` Capabilities are sorted into three tiers by *where*
they are satisfied. A capability is only allowed to climb a tier when the tier
below provably cannot serve it. Most of the app lives in Tiers A and B; Tier C
is exceptional and individually justified.

### Tier A — Upstream Three / TSL serves it directly

No Oscilla code beyond ordinary use of the published Three API. These are the
reason the migration exists: capabilities Oscilla was paying to own that Three
already provides.

- WebGPU device/adapter lifecycle, pipeline construction, bind-group layout
  inference (`WebGPURenderer`)
- Material/shader expression authoring (`NodeMaterial`, TSL expression and
  function composition)
- Geometry realization and instancing (`InstancedMesh`, `Points`,
  `BufferGeometry`)
- Per-frame update hooks and time/uniform plumbing (`NodeFrame`, node uniforms)
- Postprocessing chains (Three post node graph)
- Compute graphs and storage resources (TSL compute nodes, storage buffers)
- Asset decoding/loading (`LoadingManager`, `TextureLoader`, `GLTFLoader`,
  `NodeMaterialLoader`)
- The full WebGPU render-pipeline surface that the old GPU-IR was trying to
  re-expose by hand: custom blend, MRT + per-attachment write masks, `discard`,
  `frag_depth`, varying types/interpolation, mip levels, comparison samplers,
  depth bias, vertex attribute formats, full depth-compare set, control flow
  (`while`/`switch`/early return), structs, fixed-size arrays, matrix/math
  builtins. See §4.

### Tier B — Backend-local composition on top of upstream Three

Oscilla backend code (the renderer behind `createWebGPURenderer()`, the
ScenePlan lowering, the asset bridge) composes published Three APIs to express
an Oscilla concept. **This is not a fork delta** — it is our code calling their
code, and it carries near-zero coupling to fork internals.

`// [LAW:locality-or-seam]` These compositions sit behind the renderer seam, so
the app depends on the Oscilla capability, not on the Three call sequence that
realizes it.

- Mapping a backend-neutral `ScenePlan` (one instanced shape + one material +
  one time input) onto a Three scene/camera/`InstancedMesh` — the steel thread.
- Oscilla domain semantics (instance count, per-instance fields) realized as
  instanced attributes / storage buffers feeding a `NodeMaterial`.
- Domain-driven indirect draw / GPU-computed instance counts realized via Three
  compute + indirect attributes, if and when a ticket needs it.
- `AssetId` → Three runtime object resolution via the `ThreeLoadingBridge`
  (see the proposal's asset model).
- Live modulation / hot-swap state preservation expressed as ScenePlan diffs
  applied to existing Three objects — owned by Oscilla runtime, not the fork.

### Tier C — Requires a fork delta (the register)

A capability reaches Tier C only when upstream Three/TSL **and** backend-local
composition both fail, per all six clauses of the canon decision rule.

**Register state: EMPTY.**

`// [LAW:verifiable-goals]` At the groundwork and steel-thread stage there is no
approved capability that upstream Three/TSL plus Tier-B composition cannot
serve. Inventing a fork delta now would be speculative — it would have no
approved ticket demanding it (decision-rule clause 1) and no owner. The
register stays empty until a concrete implementation ticket proves a Tier-C
need.

When the first real delta arrives, it is appended here as a row:

| Delta ID | Capability | Owning ticket | Why upstream+composition fail | Vendored files touched | Exit plan (upstream PR / removal) |
|----------|------------|---------------|-------------------------------|------------------------|-----------------------------------|
| *(none yet)* | | | | | |

`// [LAW:no-mode-explosion]` Every row must carry an exit plan: a fork delta is
a temporary divergence pending upstreaming or removal, never a permanent second
codebase. A row with no exit plan is rejected.

## 2. Vendoring & Update Workflow

`// [LAW:one-source-of-truth]` There is one vendored Three, one place its deltas
live, and one documented procedure to update it. No block, loader, or service
pulls Three from anywhere else.

### 2.1 How the fork is vendored

The fork is consumed as a **pinned dependency** (an exact version/commit of the
forked package), not a loose `^`/`~` range. Pinning makes "what Three are we on"
a single auditable fact and makes upstream drift an explicit, reviewed event
rather than an ambient one.

- The dependency is pinned in `package.json` to an exact ref of the fork.
- If/when Tier-C deltas exist, they are carried as a **patch set applied at
  install time** (e.g. a `patches/` directory consumed by a patch step), never
  as hand-edited files inside `node_modules`. The patch set *is* the register in
  §1 Tier C made executable: one patch file per delta row, named by delta ID.
- While the Tier-C register is empty, there is **no patch set** — the fork is
  plain upstream Three at a pinned version, and the "fork" is purely a pin plus
  the option to add deltas later.

`// [LAW:carrying-cost]` Patch-on-install keeps the divergence surface equal to
exactly the deltas and nothing else, so the cost of an update is proportional to
the number of deltas — which is why the register is kept minimal.

### 2.2 Where custom code lives

| Concern | Location | Notes |
|---------|----------|-------|
| App-facing renderer seam | [src/render/index.ts](../src/render/index.ts) | Unchanged export boundary; the app only sees `createWebGPURenderer()`. |
| Runtime↔render contract | [src/render/types.ts](../src/render/types.ts) | Backend-neutral types crossing the seam. |
| Three-backed renderer impl | [src/render/webgpu/index.ts](../src/render/webgpu/index.ts) | Rebuilt as the Three backend behind the seam (currently the stub). All Tier-B composition lives here and in sibling backend modules. |
| Fork deltas (if any) | install-time patch set (`patches/`) | One patch per Tier-C register row; none today. |
| Legacy Rust/WASM renderer | [src/render/wasm/rust/oscilla-rust-renderer](../src/render/wasm/rust/oscilla-rust-renderer) | Replaceable backend, not the migration target. Kept only for paths Three cannot serve. |

`// [LAW:one-way-deps]` Backend-local Three code may depend on the compiler/
runtime seams; editor, patch, and compile code must not depend upward on Three
objects or fork internals.

### 2.3 Update procedure

1. Bump the pinned fork ref in `package.json`.
2. Re-apply the patch set (empty today → no-op). Any patch that fails to apply
   is a signal that upstream moved under a delta — that delta's row is revisited
   (re-derive, upstream, or drop) before proceeding.
3. Run the verification contract for the active steel thread
   ([three-migration-first-proof-contract.md](./three-migration-first-proof-contract.md)):
   app boots, `createWebGPURenderer()` returns the Three backend, the known
   patch renders continuously, time modulation updates every frame.
4. Run typecheck + tests.

`// [LAW:no-silent-failure]` A patch that no longer applies must abort the update
loudly (step 2). It must never be silently skipped — a dropped delta is a silent
capability regression.

## 3. Capability Surface the App Relies On

`// [LAW:locality-or-seam]` This is the contract between Oscilla and the fork,
expressed as **capabilities behind the renderer seam**, not as Three classes.
The app depends on this list; it does not depend on how Three realizes it. If a
future Three update removes or changes one of these, that is a seam-breaking
event handled at the backend, invisible to app code.

The backend relies on the fork to provide:

- **Renderer lifecycle** — construct, configure, resize, dispose a WebGPU
  renderer against an app-provided canvas.
- **Scene realization** — instantiate and update scene objects (instanced
  meshes / points) from a backend-neutral ScenePlan.
- **Material execution** — compile and run node/TSL materials with
  app-controlled uniform/time inputs.
- **Per-frame update** — advance time-driven material/compute state once per
  frame, driven by the app's animation loop, not the fork's own clock.
- **Compute & storage** *(deferred until needed)* — run compute node graphs and
  own storage-resource lifetimes for solver-style work.
- **Postprocessing** *(deferred until needed)* — compose fullscreen post chains.
- **Asset decoding** *(deferred until needed)* — decode textures/geometry/models
  by URL behind the `ThreeLoadingBridge`, keyed by Oscilla `AssetId`.

The app does **not** rely on, and must not couple to:

- Three object UUIDs, class identities, or scene-graph layout as state.
- Three's internal node graph as an authoring model.
- Any fork-only internal that is not surfaced as one of the capabilities above.

`// [LAW:single-enforcer]` `createWebGPURenderer()` remains the one boundary that
selects and constructs the backend. The capability surface is the only thing
that crosses it.

## 4. Reconciliation of Legacy vm4 Gap-Analysis vs. Three

Source inventories: [gpu-ir-gap-analysis.md](./gpu-ir-gap-analysis.md) (48
items, P0/P1/P2) and [renderer-webgpu-coverage-audit.md](./renderer-webgpu-coverage-audit.md)
(28 findings). Those documents measured **Oscilla's custom GPU-IR + Rust
renderer against full WebGPU**. Adopting Three reframes every one of them,
because Three's `WebGPURenderer` already *is* a full-WebGPU abstraction.

`// [LAW:one-source-of-truth]` After this reconciliation, the gap-analysis and
coverage-audit docs are **historical**: they describe a renderer path that is no
longer the migration target (see the canon's "Dead Concepts"). They are not the
backlog for Three work. This section is the authoritative mapping.

### 4.1 Superseded — Three/TSL provides it; the custom-IR work is dead

These were gaps in *our* IR/Rust renderer. Three implements them as standard
WebGPU, so the corresponding GPU-IR expansion work is cancelled, not migrated.

- **All P0 items**: custom blend factors, per-attachment write mask, fragment
  `discard`, flat/typed varyings, mip levels + mip filter, comparison samplers +
  `textureSampleCompare`, depth bias, `frag_depth`, vertex attribute formats
  (Float32x3/x4+), `textureSampleLevel`, the missing depth-compare functions.
- **Most P1 items**: front-face winding, polygon/wireframe mode,
  alpha-to-coverage, WGSL control flow (`while`/`switch`/early return),
  fixed-size arrays, structs, uint32 indices, read-only depth/stencil, store-op
  discard, off-screen MSAA resolve, texture views, address mode W, anisotropy,
  matrix builtins (transpose/inverse/determinant), math builtins
  (exp2/log2/inverseSqrt/saturate), `select`/ternary, non-square matrices,
  workgroup shared memory + barriers, indirect draw/dispatch.
- **Coverage-audit MUST_FIX/SHOULD_FIX findings 1–18**: every one targeted the
  hand-written `engine.rs`/`translator.rs`/`mmu.rs` renderer. Superseded with
  the renderer.
- **The IR→Rust parity appendix** (Appendix of the gap-analysis): moot — the IR
  and the Rust translator it diverged from are both off the migration path.

### 4.2 Deferred — real, but not needed for the steel thread; served by Three when reached

Capabilities the app will want eventually, satisfied by Tier-A/Tier-B work at
that time — not by a fork.

- Postprocessing chains (Three post nodes).
- Compute / solver storage resources (TSL compute).
- Asset-backed textures/geometry/models (asset registry + `ThreeLoadingBridge`,
  proposal §5).
- External textures (video/canvas) — P2 in the gap-analysis; via Three when a
  ticket needs it.
- Remaining P2 niche items (f16, conservative raster, texture gather, pack/unpack
  builtins, dynamic offsets, timestamp/occlusion queries): deferred; re-evaluate
  per Three's support at point of need.

### 4.3 Still Oscilla-owned after Three — not a Three feature

These never were renderer-API gaps; they are app semantics that remain
Oscilla's responsibility regardless of backend, and are **not** fork deltas.

- Domain-based instance-count semantics and GPU-driven indirect draw *as an
  Oscilla concept* — realized as Tier-B composition over Three's instancing/
  indirect APIs (§1 Tier B), owned by ScenePlan lowering.
- Continuity / hot-swap state preservation across recompiles — owned by Oscilla
  runtime ([src/services/RuntimeService.ts](../src/services/RuntimeService.ts),
  [src/services/AnimationLoop.ts](../src/services/AnimationLoop.ts)).
- Zero-allocation hot-path / strict-allocator concerns from the Rust renderer —
  specific to that legacy backend; not carried into the Three backend.

`// [LAW:locality-or-seam]` Nothing in §4.3 motivates a fork: each is either
Tier-B composition or app-owned state behind the seam. The Tier-C register (§1)
remains empty.

## Related References

- [three-migration-backend-canon.md](./three-migration-backend-canon.md) — ownership, seams, dead concepts, and the fork-delta decision rule
- [three-fork-integration-proposal.md](./three-fork-integration-proposal.md) — scope source for the migration
- [three-migration-renderer-seam-inventory.md](./three-migration-renderer-seam-inventory.md) — file-by-file keep/freeze/delete
- [three-migration-first-proof-contract.md](./three-migration-first-proof-contract.md) — steel-thread verification contract
- [gpu-ir-gap-analysis.md](./gpu-ir-gap-analysis.md) — historical; reconciled in §4
- [renderer-webgpu-coverage-audit.md](./renderer-webgpu-coverage-audit.md) — historical; reconciled in §4
