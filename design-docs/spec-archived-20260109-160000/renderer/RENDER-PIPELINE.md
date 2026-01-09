# Render Pipeline Architecture

**Status**: Canonical
**Created**: 2026-01-05

This document defines how patches connect to the renderer in Oscilla v2.

---

## 1. Minimal Patch: Animated Particles

The smallest "real" patch that exercises the whole pipeline:
**time → per-element field eval → materialize buffers → render assemble → Canvas draw**

### Blocks

#### 1. TimeRoot (Infinite)
- **Outputs**:
  - `tMs` : `signal<int>` - simulation time in ms
  - `phaseA` : `signal<phase>` - 0..1 wrapping, derived from time
  - `pulse` : `signal<trigger>` - tick, once per frame

#### 2. DomainPointsN
- **Inputs**:
  - `count` : `signal<number>` (e.g. 2000)
- **Outputs**:
  - `domain` : `domain<points>` - opaque handle ("there are N elements, ids 0..N-1")

#### 3. FieldFromDomainId
- **Inputs**:
  - `domain`
- **Outputs**:
  - `id01` : `field<number>` - per-element normalized id in [0..1]

#### 4. PositionSwirl
- **Inputs**:
  - `domain`
  - `t` : `signal<number>` (from TimeRoot.tMs)
  - `id01` : `field<number>`
  - `center` : `signal<vec2>` (e.g. [0,0])
  - `radius` : `signal<number>` (e.g. 0.6)
  - `spin` : `signal<number>` (e.g. 0.25)
- **Outputs**:
  - `pos` : `field<vec2>` - per-element XY in normalized canvas space

#### 5. HueRainbow
- **Inputs**:
  - `phase` : `signal<phase>` (from TimeRoot.phaseA)
  - `id01` : `field<number>`
  - `sat` : `signal<number>` (1.0)
  - `val` : `signal<number>` (1.0)
- **Outputs**:
  - `color` : `field<color>` - per-element color

#### 6. ConstSize
- **Output**:
  - `size` : `field<number>` or `signal<number>` (broadcast 2.0 px equivalent)

#### 7. RenderInstances2D
- **Inputs**:
  - `domain`
  - `pos` : `field<vec2>`
  - `size` : `field<number>` or `signal<number>`
  - `color` : `field<color>`
  - `opacity` : `signal<number>` (optional; default 1.0)
- **Output**:
  - none (registers a render sink in the normalized graph)

**Summary**: Domain + position field + color field + render sink.

---

## 2. Three Representations, Two Bridges

### A) RawGraph (what the editor stores)
- User blocks and user edges only
- UI attachments (default sources, bus wiring UI, wire-state) stored as attachments, not blocks

### B) NormalizedGraph (what the compiler consumes)
- Produced by editor normalization
- Every attachment becomes explicit blocks+edges
- Render sink is just a normal block (RenderInstances2D) with normal inputs

### C) CompiledProgramIR (what runtime executes)
- Produced by the compiler
- Contains:
  - `signalExprs` - signal evaluation DAG
  - `fieldExprs` - field evaluation DAG
  - `schedule.steps` - (timeDerive, signalEval, materialize*, renderAssemble, ...)
  - `render.sinks` - which sinks exist and which slots feed them
  - `slotMeta`, `stateLayout`, etc.

**Key invariant**: The renderer never reads the patch graph directly. It reads `RenderFrameIR` assembled at runtime from compiled buffers.

---

## 3. What the Compiler Produces

For the minimal patch above, compilation produces:

### 3.1 SignalExprs
- `tMs` produced by timeDerive (or exposed as derived slot)
- `phaseA` derived from tMs
- Constants: count=2000, center, radius, spin, sat, val, opacity

These become nodes in `program.signalExprs`.

### 3.2 FieldExprs
- `id01 = f(elementId)` depends on domain
- `pos = swirl(domain, tMs, id01, ...)`
- `color = hsv(phaseA + id01, sat, val)`

These become nodes in `program.fieldExprs`.

### 3.3 Schedule Steps

The schedule contains (names illustrative):

1. **StepTimeDerive**
   - Writes `tMsSlot`, `phaseA_slot` (and possibly `pulseSlot`) into ValueStore

2. **StepSignalEval**
   - Evaluates required signals into slots (constants + derived signals)
   - Result: ValueStore has scalar inputs needed by fields/materializers

3. **StepMaterializeVec2**
   - Materializes `pos : field<vec2>` into buffers

4. **StepMaterializeColor**
   - Materializes `color : field<color>` into RGBA buffers

5. **StepRenderAssemble**
   - Reads: domain handle/count, pos buffers, size buffer (or broadcast), rgba buffers
   - Produces `RenderFrameIR` into `outFrameSlot`

At this point the runtime has produced a render frame that is **independent of the patch graph**.

---

## 4. What the Renderer Consumes

The Canvas renderer consumes:
- `RenderFrameIR` - pure data: passes, buffers, counts, blend modes
- `ValueStore` - to look up buffer handles by slot

Render call is conceptually:

```typescript
renderer.renderFrame(frameIR, runtime.values)
```

For an Instances2D pass, it:
1. Resolves buffer slots → typed arrays (x/y, size, r/g/b/a)
2. Loop or batch draw (Canvas2D)
3. Clear / composite based on frame clear spec

---

## 5. End-to-End Wiring Summary

```
1. User edits patch
   → editor updates RawGraph

2. Editor normalizes (attachments → explicit derived blocks/edges)
   → NormalizedGraph

3. Compiler compiles NormalizedGraph
   → CompiledProgramIR
   (builds signalExprs, fieldExprs, schedule, render.sinks, slotMeta)

4. Runtime executes schedule each frame:
   - derives time
   - eval signals
   - eval fields lazily / materialize required buffers
   - assembles RenderFrameIR

5. PreviewPanel calls renderer:
   - renderFrame(frameIR, runtime.values)

6. Canvas draws pixels
```

**The compiler's "renderable whatever" is `RenderFrameIR`, produced by `StepRenderAssemble` at runtime from materialized buffers, not by directly emitting drawing commands during compilation.**

---

## Key Insights

1. **RenderInstances2D IS a block** - it's a sink that registers in the normalized graph
2. **Three representations**: RawGraph → NormalizedGraph → CompiledProgramIR
3. **Renderer is decoupled** - never reads patch graph, only reads RenderFrameIR
4. **Buffers are materialized at runtime** - compiler produces the recipe, runtime executes it
