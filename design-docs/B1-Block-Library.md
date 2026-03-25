---
status: CANONICALIZED_FROM_RAW
scope: block-library-overhaul
source: /Users/bmf/code/oscilla-animator-v2/design-docs/B1-Block-Library-RAW.md
last_updated: 2026-03-25
precedence: later-statements-in-source-win
---

# B1 Block Library Overhaul ARD (Complete Canonicalization)

> This document is a complete, implementation-focused canonicalization of `B1-Block-Library-RAW.md`.
> It retains all technical information from the source conversation except statements explicitly superseded by later statements in that same source.

// [LAW:one-source-of-truth] This file is the single consolidated architecture reference derived from B1 raw.

## 0) Canonicalization Rules Applied

1. Later statements in the source thread override earlier statements.
2. Repository conventions and live interfaces are used for concrete naming and integration.
3. Superseded statements are either removed or explicitly marked as superseded.
4. Corrections made by the user in the source thread are treated as final.

### 0.1 Superseded Statements (Explicit)

1. Superseded: JS compiler computes byte counts/offsets as authoritative runtime memory management.
- Final: JS emits symbolic/typed resource requirements; Rust/WASM MMU owns physical byte layout and offset realization.

2. Superseded: JS emits/owns raw Naga AST objects.
- Final: JS emits serializable application IR; Rust/WASM constructs raw `naga::Module` and WGSL output.

3. Superseded: monolithic `RenderIntent.paramBindings` as global parameter ownership model.
- Final: parameter ownership is split across Source/Modifier/Material/Intent according to consumption responsibility.

## 1) Executive Intent and Problem Statement

Oscilla block-library architecture is being overhauled from specialized/legacy shape rendering patterns into a generalized, modulatable, reusable dataflow rendering system.

Primary objective:

- Make blocks maximally flexible and reusable.
- Ensure everything can be modulated by graph dataflow.
- Keep architecture coherent across block definitions, lowering, IR scheduling, and runtime execution.

Primary anti-pattern being removed:

- A God-object `RenderIntent` that owns generation + material + presentation parameters simultaneously.

Rationale:

- Coupling generation/presentation causes UI complexity, IR complexity, and long-term extensibility issues.

## 2) Core Linguistic and Architectural Model

The source thread repeatedly stresses strict semantic separation:

1. Source (Noun): produces data.
2. Material (Adjective): describes appearance.
3. Intent (Verb): execution instruction to renderer/engine.

A fourth pillar is added:

4. Modifier: transforms source data between generation and intent.

### 2.1 Why this separation is mandatory

Without separation, one node must own incompatible responsibilities:

- geometry/simulation generation bindings
- appearance/shading bindings
- render-state bindings

That creates high fan-in, high fan-out, and impossible-to-reason validation boundaries.

// [LAW:one-type-per-behavior] One behavior class per type boundary; no monolithic mixed-behavior type.

## 3) 4-Pillar Abstraction (Final Form)

## 3.1 Pillar 1: Generators (`RenderSource` family)

Generators introduce source/topology/resources and own generation parameters.

Source kinds specified in raw thread:

1. `TopologySource`.
2. `ParametricTemplateSource`.
3. `FieldSource`.
4. `SolverResourceSource`.

Generator responsibility:

- Own generation semantics/bindings (`radius`, `viscosity`, `simResolution`, etc.).
- Emit resource/source proxy handle(s) for downstream consumers.

## 3.2 Pillar 2: Modifiers

Modifiers consume source proxies, run transformation compute, and emit modified proxies.

Examples from raw thread:

- `TwistGeometry`
- `AdvectFluid`
- `RemapFieldLUT`
- `EjectFluidSpray`

Modifier responsibility:

- Transform structure/state over existing resources.
- Not a sink.
- Not a material.

## 3.3 Pillar 3: Materials

Materials consume source-aligned semantics and map them to visual properties.

Examples from raw thread:

- `MatCap2.5D`
- `FluidColorWarp`
- `BasicUnlit`
- `SprayDroplet`

Material responsibility:

- Own visual semantics (`hue`, `roughness`, opacity mapping, velocity stretch mapping).
- Output material proxy/evaluation contract.

## 3.4 Pillar 4: Render Sink (`RenderIntent`)

Render sink is intentionally thin.

Intent responsibility:

- Zip source proxy + material proxy.
- Own presentation policy only (`blendMode`, `depthTest`, `depthWrite`, etc.).
- Emit final draw/render command intent.

Forbidden:

- Owning generation parameters.
- Owning material evaluation semantics.

// [LAW:single-enforcer] Ownership policy is enforced at compiler boundary once, not ad hoc at sink nodes.

## 4) Architecture Validation Claims (Retained)

The source thread provides three repeated validation claims.

### 4.1 Total Modulation

Users can modulate values in each ownership tier independently, for example:

1. `Oscillator -> FluidSolver.viscosity` (source binding).
2. `Noise -> FluidColor.hue` (material binding).
3. `Constant -> Draw.blendMode` (intent binding).

### 4.2 Zero Duplicate Code

One generalized draw sink should handle multiple source families by proxy contracts, instead of family-specific sink block explosion.

### 4.3 Future-Proofing

Formula-heavy systems (example: Milkdrop-like equations) should land as modifier/material blocks over shared proxy contracts, not architectural forks.

## 5) Implementation Guardrails (Retained and Canonicalized)

From source + project laws:

1. Do not rediscover source kinds at runtime from heuristics.
2. Keep source-kind metadata flowing in compiler IR/contracts.
3. Keep runtime blind to high-level semantics beyond compiled artifacts.
4. Prevent ownership leakage (intent consuming source/material semantics).

// [LAW:one-source-of-truth] Source-kind and semantic ownership metadata must be explicit in IR.
// [LAW:single-enforcer] Validation occurs at one compile boundary.

## 6) Camera and Instance Count Boundaries

## 6.1 Instance Count Modulation

Retained core model:

- Compile-time max capacity defines allocation ceiling.
- Runtime active count selects active lanes within ceiling.

Implication:

- Modulate active count without reallocating every frame.
- Capacity increase beyond max requires rebuild/reinstall.

## 6.2 Camera Modulation

Final model from source:

- Camera is global render context, not source/material/intent payload.
- Camera block writes to render-global slots/decls.
- Intents may optionally reference camera context for advanced pipelines.

## 6.3 Hard boundaries retained from source

1. Dynamic topology resolution changes at frame-time are disallowed (requires rebuild).
2. Unbounded variable-length spawn patterns are disallowed in hot loop for predictability.
3. Dynamic graph topology rewiring during runtime modulation is disallowed.

// [LAW:dataflow-not-control-flow] Runtime graph/pipeline structure is static; value-level modulation is dynamic.

## 7) Deterministic Fluid-to-Spray Design (Complete Retention)

Design chosen in source thread:

- fixed-capacity particle pool
- always-on lane evaluation
- state-driven activation/deactivation
- fluid sampling as respawn trigger

### 7.1 Strategy: always-on pool

- Preallocate N particles (example used repeatedly: 50,000).
- Each lane executes every frame.
- Dead particles try to respawn by sampling fluid state.
- Alive particles update ballistic state until death.

### 7.2 Why this strategy was selected

1. Predictable cost envelope.
2. No variable-length append operations.
3. Avoid heavy atomics for dynamic list growth.
4. Preserves dataflow determinism and scheduler simplicity.

### 7.3 Conceptual kernel behavior retained

Two phases in one lane update kernel:

1. Dead lane phase:
- random UV sample of fluid velocity
- threshold gate
- reset pos/vel/age

2. Alive lane phase:
- gravity/drag integration
- age decay
- write back

## 8) Block-by-Block Technical Detail (All Source Topics Consolidated)

The raw thread requested four block walkthroughs with same detail shape:

1. lowering behavior
2. resulting IR
3. schedule placement
4. JS -> Rust/WASM contract shape

All four are retained below with final corrections applied.

## 8.1 `EulerianFluidSolver` / `FluidSim`

### 8.1.1 Lowering behavior

Retained behavior:

- declare transient solver resources (velocity, pressure, divergence, ping-pong variants)
- emit ordered compute dispatch chain
- bind generation parameters from graph outputs

Corrected boundary:

- no JS-side physical byte offset authority
- JS emits symbolic resource IDs and typed requirements

Project mapping:

- existing `FluidSim` block in `src/blocks/render/fluid-sim.ts`
- uses `LowerEffects.memoryResources` and `LowerEffects.dispatchInstructions`

### 8.1.2 Resulting IR shape

Logical representation retained:

- node kind: solver source
- source bindings
- transient dependencies
- output proxy of solver resource

Project mapping surface:

- `MemoryResourceIR[]`
- `DispatchKernelInstruction[]`

### 8.1.3 Scheduled execution

Retained sequence:

1. parameter/materialization phase
2. fluid dispatch chain in strict order (advect/divergence/pressure iterations/projection)
3. dependent modifier passes execute after solver completion

### 8.1.4 JS -> Rust payload shape (corrected)

Retained concepts:

- manifest/resource requirements
- compute pass list
- dispatch dimensions

Corrected final contract:

- JS sends serializable program IR + symbolic identifiers
- Rust resolves physical memory layout and builds Naga pipelines

## 8.2 `InstanceDomain`

### 8.2.1 Lowering behavior

Retained core points:

- establishes domain/lane capacity contract
- exposes `index` and `rank`
- zero-allocation intrinsic path where possible

Project mapping:

- existing `InstanceDomain` lowers to domain property expressions and instance declarations

### 8.2.2 Resulting IR shape

Retained properties:

- allocation ceiling/capacity concept
- dynamic active count state
- outputs as intrinsics (`index`, `rank`)

### 8.2.3 Scheduled impact

Retained behavior:

- no dedicated standalone render pass requirement by itself
- influences dispatch sizes and active-lane logic
- participates in draw-prep instance count derivation

### 8.2.4 JS -> Rust payload shape (corrected)

Retained concept:

- capacity and active count are explicit artifacts

Corrected ownership:

- Rust MMU/runtime realizes final physical resource layout

### 8.2.5 Clarification retained: where `positionX` lives

Source-thread clarification retained:

- `positionX` is not inherent property of render intent.
- it belongs to transform/modifier or source-to-render mapping layer.
- render intent consumes resulting transformed source.

Project mapping:

- current sink contracts use `controlPoints`/shape field paths rather than direct `positionX` sink ownership.

### 8.2.6 Clarification retained: `rank` vs `index`

Retained rationale:

- use `rank` for normalized interpolation/phase mappings (line/circle).
- use `index` for integer-seeded discrete sampling patterns (swarm/scatter/hash/sequence behavior).

## 8.3 `EjectFluidSpray` (Modifier)

### 8.3.1 Lowering behavior

Retained and corrected:

- consume particle pool + fluid solver resource
- consume threshold and update params
- request required particle state semantics
- emit modifier compute pass contract

Corrected boundary:

- no JS byte math as authoritative runtime memory management
- pure lowering returns contracts/effects only

### 8.3.2 Resulting IR shape

Retained fields:

- modifier kind/type
- target and fluid inputs
- threshold/source binding
- required fields set
- output modified pool proxy

### 8.3.3 Schedule placement

Retained ordering:

1. fluid solver updates
2. spray modifier consumes fluid outputs and updates pool
3. draw-prep
4. render

### 8.3.4 JS -> Rust contract shape

Retained:

- symbolic manifest requirements
- compute pass declarations and texture dependencies

Corrected:

- Rust MMU computes final layout, patches symbolic loads/stores to physical addressing, constructs final GPU executable modules.

## 8.4 `SprayDroplet` (Material) + `DrawInstances` (Intent)

### 8.4.1 Lowering behavior

Retained behavior:

- Material block emits visual evaluation logic based on semantics (`age`, `velocity`, color params)
- Intent block zips source proxy + material proxy + render state

Corrected boundary:

- JS emits serializable material/render contracts
- Rust constructs final Naga/module pipeline path

### 8.4.2 Resulting IR shape

Retained logical pieces:

- material node requiring semantics and emitting material proxy
- intent node linking source + material + state

### 8.4.3 Schedule placement

Retained:

- render pass executes after compute/materialize/draw-prep dependencies

### 8.4.4 JS -> Rust contract shape

Retained:

- render pass list with state + source/material references

Corrected:

- no JS raw Naga AST ownership
- serializable IR only; Rust builds raw modules

## 9) Clarifications and Corrections (Full Retention)

This section preserves all technical clarifications requested in-thread.

## 9.1 No validity checks inside lowerers (as policy)

User correction retained:

- frontend elaboration/typing guarantees valid, fully typed graph before lowering
- lowering should not duplicate argument type validation logic

Project-compatible interpretation:

- lowerers may assert internal compiler invariant failures (normalization defects)
- user-type validation belongs upstream

## 9.2 Semantic proxy taxonomy retained and consolidated

Retained taxonomy from source thread:

Base dataflow primitives:

- `Scalar<T>`
- `Field<T>`

Resource/source proxies:

- `GeometryTopology`
- `ParametricTemplate`
- `ParticlePool` / `InstancePool`
- `SolverResource`

Presentation proxies:

- `MaterialProxy`
- `RenderIntent`

Project mapping note:

- concrete runtime transport still flows through `CompiledProgramIR` + schedule/effects contracts.

## 9.3 `resolveDataflow` vs `resolveConstantOrSignal` distinction retained

Retained distinction:

- one path for uniform/scalar-only requirements
- one path for expressions that can vary across lanes

Project mapping:

- this distinction maps to cardinality/extent and expression materialization semantics in typed compiler IR.

## 9.4 Pure lowering adaptation retained

Retained conclusion:

- imperative builder side-effects are replaceable by pure lowering outputs
- lowering returns declarative requests: resources, passes, outputs, render intents
- orchestrator composes/lifts these into global program artifacts

// [LAW:dataflow-not-control-flow] Compiler composition is data aggregation, not side-effect-driven execution branching.

## 9.5 Naga boundary correction retained verbatim in policy

Retained corrected model:

1. JS elaborates and lowers to serializable application IR.
2. ABI transports serializable IR.
3. Rust resolves symbolic memory references.
4. Rust constructs raw Naga modules and emits shader binaries/WGSL.

No JS-side raw Naga struct creation.

## 9.6 Builder-function explanation retained (canonicalized)

Source-thread explained conceptual helper functions:

- intrinsic expression creation (`createIntrinsicField` style)
- symbolic store assignment emission (`emitAstAssignment` style)
- modifier/material AST payload builders

Canonicalization:

- these are compiler-IR builder helpers, not runtime memory managers
- they produce serializable symbolic IR nodes, not physical addressing

## 10) Reference Simple Patch: Grid of Squares (Complete Retention)

Source-requested patch preserved and canonicalized:

Problem:

- grid of squares
- unique rotation and color per instance
- layout from math, no specialized grid-layout block

## 10.1 Blueprint retained

1. time source
2. `InstanceDomain(count=100)`
3. grid math from index:
- `x = index % cols`
- `y = floor(index / cols)`
- spacing scales to position
4. source shape block (rectangle topology)
5. transform/modifier assigns position and rotation fields
6. material computes color from rank/time
7. draw intent links transformed source + material

## 10.2 Compiler perspective retained and corrected

Retained idea:

- compiler outputs symbolic contracts for fields/scalars/passes

Corrected boundary:

- no JS authoritative byte math requirement
- Rust MMU performs physical layout realization

## 10.3 Architecture checks retained

1. layout is math-driven
2. per-instance uniqueness achieved via `index`/`rank` modulation
3. no god-object ownership coupling
4. boundary respects symbolic JS -> physical Rust split

## 11) Memory and ABI Principles (Retained + Corrected)

Retained principles:

1. SoA-oriented storage for per-lane values.
2. Decoupling active lane count from allocation ceiling.
3. Explicit pass roster and binding contracts.

Corrected final authority split:

- JS owns symbolic requirements.
- Rust owns physical bytes/offsets.

## 12) Repository Integration Requirements

To implement this initiative in this repository, changes MUST map to existing surfaces.

## 12.1 Block registry

- Add pillar/semantic ownership metadata to `BlockDef`.
- classify blocks in `src/blocks/*`.

## 12.2 Compiler passes

- add ownership validation phase before/within lowering pass
- reject intent ownership leaks

## 12.3 Runtime boundary

- ensure compile/install path remains sole source of physical realization
- prevent runtime semantic forensics

## 12.4 New block implementations from thread

- `EjectFluidSpray` (modifier)
- `SprayDroplet` (material)

## 13) Migration Plan (Retained and Structured)

Phase 0: metadata and validation scaffolding.

Phase 1: enforce thin-intent ownership split.

Phase 2: implement spray chain blocks and integration.

Phase 3: remove redundant/legacy overlap paths.

// [LAW:delete-over-shim] Prefer deletion of obsolete architecture paths over long-lived compatibility shims.

## 14) Verification Plan (Retained and Expanded)

Compiler validation tests:

1. ownership policy enforcement by pillar
2. no unresolved source-kind contracts
3. static schedule ordering constraints

Block-level tests:

1. fluid dispatch ordering deterministic
2. instance-domain intrinsic outputs deterministic
3. spray modifier preserves identity/capacity contracts
4. spray material produces expected semantic mappings

Integration tests:

1. grid-of-squares patch
2. fluid-to-spray deterministic patch

Boundary tests:

1. serializable IR from JS remains free of raw Naga structs
2. Rust path remains sole raw Naga module constructor

// [LAW:verifiable-goals] Acceptance is test-defined and machine-verifiable.

## 15) Non-Goals (Retained)

1. No monolithic `RenderIntent` parameter ownership.
2. No per-source-family sink explosion.
3. No runtime graph topology modulation.
4. No JS-side raw Naga AST ownership.

## 16) Traceability Matrix (Raw -> This Doc)

Every major topic from raw source has a direct destination here:

1. Mixing verbs/nouns and God-object trap -> Sections 1, 2, 3.
2. 4-pillar definition and contracts -> Section 3.
3. Architecture validation (total modulation, zero duplicate code, future-proofing) -> Section 4.
4. Guardrails -> Section 5.
5. Camera and instance count boundaries -> Section 6.
6. Fluid-to-spray deterministic strategy -> Section 7.
7. Detailed block walkthroughs (EulerianFluidSolver, InstanceDomain, EjectFluidSpray, SprayDroplet/DrawInstances) -> Section 8.
8. Clarification Q/A (positionX, rank vs index, memory authority, Naga boundary, pure lowering, helper functions) -> Section 9.
9. Grid-of-squares patch and lowered perspective -> Section 10.
10. Memory/ABI principles -> Section 11.
11. Implementation and migration/testing -> Sections 12, 13, 14.

// [LAW:one-source-of-truth] This matrix is the completeness proof for raw-topic retention under precedence rules.

## 17) Final Decision Log (Post-Supersession)

Final architecture decisions after supersession resolution:

1. Keep 4-pillar model with strict ownership boundaries.
2. Keep camera as render context boundary.
3. Keep deterministic fixed-capacity pooling for spray.
4. Keep pure/declarative lowering model.
5. Keep JS serializable IR and Rust raw-Naga construction boundary.


## 18) Detailed Contract Snippets Preserved From Raw

This section preserves the explicit contract snippets from the source thread, normalized to final boundary rules.

### 18.1 `RenderSource` family contract

```ts
// Conceptual architecture contract (not raw runtime transport)
interface RenderSource {
  kind: 'Topology' | 'ParametricTemplate' | 'Field' | 'SolverResource';
  sourceBindings: Map<SemanticId, ValueRef>; // owned by source/generator
  output: ResourceProxyId;
}
```

### 18.2 `Material` contract

```ts
interface Material {
  kind: 'ShaderAST' | 'ComputeComposite';
  materialBindings: Map<SemanticId, ValueRef>; // owned by material
  output: MaterialProxyId;
}
```

### 18.3 `RenderIntent` contract

```ts
interface RenderIntent {
  source: ResourceProxyId;
  material: MaterialProxyId;
  intentBindings: Map<'blendMode' | 'depthTest' | 'depthWrite', ValueRef>; // presentation only
}
```

### 18.4 Ownership rule retained

- Source bindings MUST NOT move to intent.
- Material bindings MUST NOT move to intent.
- Intent bindings MUST stay presentation-scoped.

## 19) Boundary Clarifications Preserved in Full

### 19.1 `positionX` path clarification

Preserved source explanation:

- Position parameters are produced before intent, typically in transform/modifier chain.
- Intent consumes transformed source, not raw layout math semantics.

Project mapping:

- `RenderInstances2D` consumes `controlPoints` and render attributes.

### 19.2 `rank` versus `index`

Preserved rationale:

- `rank` for normalized interpolation/phase mappings.
- `index` for integer-seeded sampling/noise/sequence behavior.

### 19.3 Who owns byte-size prediction

Final corrected rule retained:

- JS describes symbolic requirements.
- Rust/WASM MMU computes final byte sizes/offsets/alignment.

### 19.4 Naga ownership clarification

Final corrected rule retained:

- JS does not own raw Naga AST structs.
- Rust owns raw `naga::Module` construction/serialization.

## 20) Full Technical Walkthroughs (Per-Block, 4-Part Format)

This section preserves the source-requested format exactly: lowering, IR, schedule, boundary payload.

## 20.1 `EulerianFluidSolver` / `FluidSim`

### A) Lowering (conceptual)

```ts
function lowerFluidSim(node, ctx): LowerResult {
  // resolve configured params (symbolic)
  // declare solver resources
  // emit deterministic dispatch chain
  return {
    outputsById: {},
    effects: {
      memoryResources: [/* velocity/pressure/divergence textures */],
      dispatchInstructions: [/* advect, divergence, jacobi..., projection */],
    },
  };
}
```

### B) IR shape

- solver source node with source bindings
- transient dependencies/resources
- output proxy for solver product

### C) schedule

- parameter/materialization
- fluid chain
- downstream modifiers/sinks

### D) JS -> Rust payload

- symbolic resource requirements
- dispatch list and dimensions
- Rust resolves physical realization and constructs executable shader modules

## 20.2 `InstanceDomain`

### A) Lowering (conceptual)

```ts
function lowerInstanceDomain(node, ctx): LowerResult {
  // create instance declaration with max capacity and optional dynamic count expr
  // emit intrinsic domain property exprs: rank/index
  return {
    outputsById: {
      rank: domainProperty('rank'),
      index: domainProperty('index'),
    },
    instanceContext: createdInstance,
    effects: {},
  };
}
```

### B) IR shape

- instance declaration and cardinality context
- domain-property expressions

### C) schedule

- affects dispatch/materialization paths
- does not require dedicated solver-style pass by itself

### D) JS -> Rust payload

- capacity and dynamic count contract in program artifacts
- runtime uses these to execute within fixed envelope

## 20.3 `EjectFluidSpray` (new modifier)

### A) Lowering (conceptual)

```ts
function lowerEjectFluidSpray(node, inputs): LowerResult {
  // pure lowering: consume target pool + fluid resource + params
  // declare required state semantics
  // emit dispatch contract
  return {
    outputsById: {
      poolOut: /* modified pool expression/proxy */,
    },
    effects: {
      dispatchInstructions: [
        { op: 'DispatchKernel', kernelId: 'eject_fluid_spray', arguments: {/* symbolic ids */} },
      ],
    },
  };
}
```

### B) IR shape

- modifier node
- required fields and source bindings
- updated pool proxy output

### C) schedule

- runs after fluid solver
- before draw-prep/render

### D) JS -> Rust payload

- symbolic field/resource references
- Rust patches symbolic accesses to physical addresses and compiles executable pipeline

## 20.4 `SprayDroplet` material + `DrawInstances` intent

### A) Lowering (conceptual)

```ts
function lowerSprayDroplet(node): LowerResult {
  return {
    outputsById: {
      materialColor: /* expr */,
      materialAlpha: /* expr */,
      materialScale: /* expr */,
    },
    effects: {},
  };
}

function lowerDrawInstances(node): LowerResult {
  // terminal sink linkage with render state
  return { outputsById: {}, effects: {/* render linkage via schedule/render pipeline */} };
}
```

### B) IR shape

- material proxy/eval outputs
- intent linking source + material + state

### C) schedule

- render after compute/materialization/draw-prep

### D) JS -> Rust payload

- render pass contracts with symbolic refs and state
- Rust builds final pipeline from compiler artifacts

## 21) Helper Function Semantics (Preserved)

From source Q/A, canonicalized as helper semantics:

1. Intrinsic expression helper (`createIntrinsicField` style):
- build IR expression for built-in lane/domain values.

2. Symbolic store helper (`emitAstAssignment` style):
- emit store to symbolic target id from expression tree.

3. Modifier/material AST builder helpers (`buildEject...`, `buildDroplet...` styles):
- produce serializable expression/statement IR trees.
- do not assign physical offsets.

Final rule:

- helper functions build symbolic compiler IR only.
- runtime/MMU resolves physical addressing.

## 22) Full Grid-of-Squares Worked Example (Preserved)

### 22.1 Graph recipe

1. Time source.
2. InstanceDomain count=100.
3. Layout math:
- `xCell = index % 10`
- `yCell = floor(index / 10)`
- `posX = xCell * spacing`
- `posY = yCell * spacing`
4. Rectangle source.
5. Transform/modifier applies `posX`, `posY`, `rotation`.
6. Material computes color from `rank` and optional time term.
7. Intent draws instanced output.

### 22.2 Why this example matters

1. proves layout is math-derived, not specialized layout block
2. proves per-instance modulation through `index`/`rank`
3. proves source/material/intent ownership split

### 22.3 Symbolic payload shape (conceptual)

```json
{
  "manifest": {
    "requirements": {
      "capacity": 100,
      "scalars": ["sys:time"],
      "fields": ["grid:pos_x", "grid:pos_y", "grid:rot", "grid:color"]
    }
  },
  "computePasses": [
    { "passId": "eval_grid_math", "dispatch": [2, 1, 1], "ir": "symbolic" }
  ],
  "renderPasses": [
    { "passId": "draw_grid", "state": { "blend": "alpha" }, "ir": "symbolic" }
  ]
}
```

Interpretation:

- JSON here is conceptual serialization shape.
- Rust/MMU owns physical resource realization.

## 23) Raw Source Heading Coverage Index

This appendix lists the major source headings captured. Superseded lines are intentionally replaced by final corrected counterparts.

Covered clusters:

1. Problem framing and God-object warning.
2. 4-pillar model and contracts.
3. validation rationale (modulation, duplication, future-proofing).
4. camera/instance-count/hard-boundary Q&A.
5. fluid-to-spray deterministic pool strategy and kernel behavior.
6. per-block deep dives: EulerianFluidSolver, InstanceDomain, EjectFluidSpray, SprayDroplet.
7. clarification Q&A: position path, rank/index, memory authority, JS/Rust boundary.
8. helper-function implementation semantics.
9. baseline patch example (grid of squares) and symbolic payload view.

Completeness statement:

- No technical topic from the raw heading set is omitted.
- Superseded statements are represented only by their final corrected forms.

// [LAW:one-source-of-truth] This appendix declares full-topic coverage for canonicalization completeness.

## 24) Source Heading Ledger (Verbatim Index)

Verbatim heading index from the raw source used during canonicalization:

```text
2:**You:**
21:**Gemini:**
38:### The Problem: Mixing Verbs and Nouns
48:### The 4-Pillar Abstraction (The Fix)
52:#### 1. Generators (The `RenderSource` Sum Type)
69:#### 2. Modifiers (The Math / Signal Processors)
76:#### 3. Materials (The Shaders)
92:#### 4. The Render Sink (The `RenderIntent`)
109:### Why this Overhaul Works
123:**You:**
126:**Gemini:**
138:## 1. Executive Summary
147:### 1.1 Architectural Invariants (The Laws)
156:## 2. The Authoring Graph: The 4-Pillar Abstraction
160:### Pillar 1: Generators (`RenderSource`)
173:### Pillar 2: Modifiers (Signal / Spatial Processors)
179:### Pillar 3: Materials (Surface Evaluators)
187:### Pillar 4: The Render Sink (`RenderIntent`)
196:## 3. Memory & Data ABI (Application Binary Interface)
200:### 3.1 Structure of Arrays (SoA)
207:### 3.2 Decoupled Domain
211:**You:**
216:**Gemini:**
226:## 1. Executive Summary
236:## 2. The Problem: The "God Object" Trap and Mixing Terminology
245:### Core Terminology
255:## 3. The 4-Pillar Abstraction (The Fix)
259:### Pillar 1: Generators (The `RenderSource` Sum Type)
282:### Pillar 2: Modifiers (Signal / Spatial Processors)
290:### Pillar 3: Materials (Surface Evaluators)
307:### Pillar 4: The Render Sink (`RenderIntent`)
327:## 4. Architecture Validation (Why this works)
329:### 4.1 Total Modulation
339:### 4.2 Zero Duplicate Code
344:### 4.3 Future-Proofing (The Milkdrop Standard)
353:## 5. Implementation Guardrails
363:**You:**
366:**Gemini:**
375:### 1. Modulating Instance Count (The Cardinality Boundary)
395:### 2. Modulating Camera Parameters (The Global Context)
412:### 3. The Hard Boundaries of the Architecture
433:### The Verdict
441:**You:**
444:**Gemini:**
457:### The Strategy: The "Always-On" Particle Pool
470:### 1. The Generators (Pillar 1)
487:### 2. The Modifier (Pillar 2)
550:### 3. The Material & Intent (Pillars 3 & 4)
564:### Why this is structurally superior
574:**You:**
579:**Gemini:**
588:### 1. The Lowering Function (JS/TS Compiler)
651:### 2. The Resulting IR (Intermediate Representation)
679:### 3. What it looks like Scheduled (The Pass Roster)
696:### 4. The Shape of the Data Passed from JS to WASM/Rust
742:**You:**
745:**Gemini:**
752:### 1. The Lowering Function (JS/TS Compiler)
795:### 2. The Resulting IR (Intermediate Representation)
818:### 3. What it looks like Scheduled (The Pass Roster)
834:### 4. The Shape of the Data Passed from JS to WASM/Rust
862:### Critical Context: Decoupling "How Many" from "Where"
880:**You:**
884:**Gemini:**
887:### 1. Where is `positionX` and how does it reach `RenderIntent`?
906:### 2. Why `rank` for lines/circles, but `index` for swarms?
913:### 3. `"arenaSizeBytes": 200004` — Who predicts this, and is it correct?
925:### 4. Bypassing WGSL Strings for Rust-Native Naga ASTs
959:**You:**
962:**Gemini:**
969:### Overview: The Bridge Block
973:### 1. The Lowering Function (JS/TS Compiler)
1025:### 2. The Resulting IR (Intermediate Representation)
1054:### 3. What it looks like Scheduled (The Pass Roster)
1079:### 4. The Shape of the Data Passed from JS to WASM/Rust
1120:### The Rust MMU Resolution (The WASM Side)
1138:**You:**
1141:**Gemini:**
1148:### 1. The Semantic Types (The Proxies)
1173:### 2. `resolveDataflow` vs. `resolveConstantOrSignal`
1184:### 3. Adapting to Pure / Referentially Transparent Lowering
1245:**You:**
1248:**Gemini:**
1257:### 1. The Pure Lowering Functions (JS/TS Compiler)
1320:### 2. The Resulting IR (Intermediate Representation)
1360:### 3. What it looks like Scheduled (The Pass Roster)
1377:### 4. The Shape of the Data Passed from JS to WASM/Rust
1407:### The Rust MMU Resolution (The Final Link)
1416:### Summary of the Overhaul
1428:**You:**
1431:**Gemini:**
1436:### 1. The JS-to-Rust Shader Boundary (Correcting the Terminology)
1454:### 2. The Implementation of the Builder Functions
1479:#### A. `builder.createIntrinsicField(expr)`
1494:#### B. `emitAstAssignment(slot, astNode)`
1511:#### C. `buildEjectSprayNagaAST(capacity, thresholdParam)`
1560:#### D. `buildDropletMaterialNagaAST(config)`
1594:### Summary
1602:**You:**
1606:**Gemini:**
1615:### The Blueprint: Modulated Grid of Squares
1617:#### 1. Global Context & Domain
1626:#### 2. The Layout Math (No "GridLayout" Block)
1635:#### 3. Pillar 1: The Generator (Noun)
1643:#### 4. Pillar 2: The Modifier (Spatial Processor)
1653:#### 5. Pillar 3: The Material (Adjective)
1664:#### 6. Pillar 4: The Intent (Verb)
1675:### The Compiler's Perspective (How it lowers to JSON)
1722:### Architectural Check: Did we meet the goals?
```

All headings in this ledger are represented in Sections 1-23 or collapsed as superseded under Section 0.1.
