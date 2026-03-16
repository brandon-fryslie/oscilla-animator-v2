# Canonical Render Sink Design Prompt

You are starting with completely fresh context in the `oscilla-animator-v2` repository.

Your job is **not** to implement code immediately.

Your job is to design and plan a **professional-grade final render boundary** for the WebGPU renderer so the system is built **backwards from the renderer** rather than by forcing old authoring concepts into a new GPU path.

The immediate motivation is:

- the current `WebGPUType1Sink` is a useful bootstrap sink
- it renders and is useful
- but it is **not yet proven** to be the correct long-term sink contract
- there is no fully authoritative final renderer-boundary spec yet
- the current backend still carries legacy `RenderInstances2D` concepts in important places

You must produce a design artifact that answers:

1. what the **final canonical render sink contract** should be
2. what the **transform/material field packer** contract should be
3. what the **render backend contract** should consume
4. how to move from the current bootstrap sink/backend shape to that final design

This is a **design-and-roadmap** task, not a code-writing task.

## Core Intent

We want to stop bolting incorrect legacy graph concepts onto the GPU renderer.

We want to design:

- from the renderer backwards
- from Type 1 execution reality backwards
- with explicit ownership boundaries
- with stable contracts between:
  - authoring sink block
  - field packing / materialization boundary
  - draw-prep / render backend

`// [LAW:dataflow-not-control-flow]` The design must follow the real renderer dataflow, not the historical control flow of old blocks.
`// [LAW:one-source-of-truth]` Each concept must have one canonical representation. Do not define two competing sink meanings.
`// [LAW:single-enforcer]` Cross-cutting contract validation belongs at one boundary only.
`// [LAW:one-way-deps]` Authoring contracts feed backend contracts. Backends must not leak legacy requirements upward into the authoring graph without an explicit seam.

## Scope

Focus specifically on the final design for:

1. **Canonical Type 1 render sink contract**
2. **Transform/material field packer contract**
3. **Renderer-facing backend contract**
4. **Migration path from current bootstrap contract to final contract**

Do **not** broaden into:

- Type 2 full implementation design
- text pipeline design
- future render graph feature composition beyond what is needed to define the sink/backend boundary
- random cleanup work

You may mention later shape classes only when they create requirements the final sink architecture must leave room for.

## Starting Facts You Must Respect

At the time of this prompt:

- `WebGPUType1Sink` exists and is intentionally bootstrap-oriented
- `GpuTriangleRigid` exists and is intentionally bootstrap-oriented
- the system can now render through the WebGPU path
- the current sink works by producing hidden outputs such as `_position`, `_color`, `_scale`, `_rotation`, `_shape`
- the backend still contains legacy `RenderInstances2D` assumptions and naming in places like render materialization
- there is no fully written final spec for the renderer boundary yet

Treat the current sink as evidence, not as truth.

## Mandatory Inputs To Read

You must inspect these first:

### Current bootstrap sink and source

- `/Users/bmf/code/oscilla-animator-v2/src/blocks/render/webgpu-type1-sink.ts`
- `/Users/bmf/code/oscilla-animator-v2/src/blocks/shape/gpu-triangle-rigid.ts`

### Current backend seams

- `/Users/bmf/code/oscilla-animator-v2/src/compiler/backend/render-materialization-pipeline.ts`
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/DrawPrepSinkTablePacker.ts`
- `/Users/bmf/code/oscilla-animator-v2/src/services/runtime-hotpath-install.ts`
- `/Users/bmf/code/oscilla-animator-v2/src/render/webgpu/RustWasmWebGPURenderer.ts`
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs`
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/render.rs`

### Shape / renderer docs

- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Complete/shapes/Shapes 0_ Shape Taxonomy_ A Rendering Overview.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Complete/shapes/Shapes 2_ The Parametric Curve (Template Instancing).md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Future/README.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Top-Priority-Next-Work-No-Exceptions/ROADMAP.md`

### Bootstrap demo / current verified slice

- `/Users/bmf/code/oscilla-animator-v2/src/demo/hcl/gpu-bootstrap-triangle.hcl`

## What You Must Figure Out

You must answer these concrete design questions.

### A. Final sink boundary

Determine:

- what inputs belong on the final Type 1 sink
- which inputs are authoring-facing semantic inputs vs backend-facing packed fields
- whether `shape`, `position`, `rotation`, `scale`, `color`, etc. belong directly on the sink
- whether transform and material semantics should remain combined in one sink or be split by seam
- what the sink is explicitly **not allowed** to know about

You must explicitly distinguish:

- bootstrap sink shape
- final canonical sink shape

### B. Field packer boundary

Determine:

- whether the sink should emit hidden field outputs at all
- whether there should be an explicit transform/material packer stage
- what data that packer owns
- whether shape handle publication, transform packing, and material packing should be one thing or separate things
- what stable IR/backend payload should come out of that stage

Be explicit about ownership:

- compile-time/static metadata
- arena-time/per-instance runtime fields
- draw-prep metadata
- render-pass inputs

### C. Backend contract

Determine the minimal backend-facing contract that Type 1 rendering should consume.

Define:

- what the backend expects as canonical Type 1 input
- what must be derived before draw-prep
- what draw-prep owns
- what render pass owns
- what legacy assumptions must be removed from backend code

### D. Migration design

Describe how to get from:

- current bootstrap sink + legacy-shaped backend

to:

- final canonical sink + explicit field packer + clean backend contract

The migration must preserve a working render path and must not rely on “replace everything at once.”

`// [LAW:locality-or-seam]` If the current system lacks a clean boundary, propose the seam first, then the replacement.

## Deliverables

Create a design document in the repo. Put it here:

- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Future/CANONICAL-RENDER-SINK-DESIGN.md`

The document must contain these sections:

1. **Problem**
2. **Current State**
3. **Why The Current Bootstrap Sink Is Not Yet Final**
4. **Canonical Design Principles**
5. **Final Sink Contract**
6. **Transform / Material Field Packer Contract**
7. **Renderer Backend Contract**
8. **Forbidden Legacy Concepts**
9. **Migration Plan**
10. **Risks / Open Questions**
11. **Concrete Follow-Up Tickets**

## Output Requirements

Your document must include:

- at least one diagram for current vs final dataflow
- one explicit table comparing:
  - current bootstrap sink
  - proposed final sink
  - legacy `RenderInstances2D` shape
- one explicit “contract surface” section with input/output definitions
- one explicit “non-goals” section
- one explicit “what remains Type 1-specific vs what should generalize later” section

## Required Quality Bar

You are not done when you have an opinion.

You are done when the result is:

- internally consistent
- clearly derived from the actual renderer dataflow
- explicit about ownership boundaries
- explicit about what should be deleted later
- concrete enough that implementation work can be ticketed from it

`// [LAW:verifiable-goals]` The design must define boundaries and outputs clearly enough that future implementation tickets can have deterministic acceptance criteria.

## Anti-Patterns To Avoid

Do not do any of the following:

- do not simply bless the current `WebGPUType1Sink` as final because it works
- do not simply mirror legacy `RenderInstances2D` ideas under a new name
- do not let backend implementation details fully dictate authoring-facing sink semantics
- do not leave hidden outputs unnamed or conceptually unowned
- do not propose a vague “we’ll clean it up later” sink
- do not produce a plan that requires a flag explosion or dual long-term sink systems

`// [LAW:no-mode-explosion]` There must be one canonical final sink path, not multiple permanent sink modes.

## Suggested Working Method

1. Read the current sink/source/backend files.
2. Write down the **actual current dataflow** from authoring sink to draw-prep to render.
3. Identify where legacy concepts still leak into that path.
4. Define the **final renderer-facing contract first**.
5. Define the **field packer** that must exist, if any, to bridge authoring semantics to that backend contract.
6. Only then define the **final sink block contract**.
7. Compare the proposed design against current Type 1 needs and future extensibility needs.
8. Write a migration sequence that preserves a working path.

Design from the renderer backward.

That is the whole point of this prompt.
