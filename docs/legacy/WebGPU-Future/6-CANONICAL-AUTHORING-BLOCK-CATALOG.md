# Canonical Authoring Block Catalog

This document defines the concrete MVP block catalog for the canonical authoring model.

It turns the higher-level object model in:

- [4-CANONICAL-AUTHORING-MODEL-DESIGN.md](./4-CANONICAL-AUTHORING-MODEL-DESIGN.md)
- [3-CANONICAL-PATCH-STRUCTURE-DESIGN.md](./3-CANONICAL-PATCH-STRUCTURE-DESIGN.md)
- [1-CANONICAL-RENDER-SINK-DESIGN.md](./1-CANONICAL-RENDER-SINK-DESIGN.md)

into an explicit user-facing graph vocabulary.

// [LAW:one-source-of-truth] This document is the canonical MVP block catalog for the new authoring model. New blocks should be evaluated against this catalog instead of inventing parallel render-boundary concepts.

## 1. Scope

This is the minimum block set required to construct scenes that compile into:

- `RenderPrimitive[]`
- `RenderView`
- `SceneRenderSink`

It is intentionally small.

## 2. Canonical Graph Datatypes

The graph should expose only these data categories.

### Value Types

- `Scalar`
- `Bool`
- `Trigger`
- `Color`
- `Vec2`
- `Vec3`
- `Vec4`
- `Field<Scalar>`
- `Field<Vec2>`
- `Field<Vec3>`
- `Field<Color>`

### Definition / Reference Types

- `GeometryRef`
- `MaterialRef`
- `TextureRef`
- `ViewTemplateRef`
- `PrimitiveDefRef`

### Assembly Types

- `TransformBindingSet`
- `MaterialBindingSet`
- `VisibilityBindingSet`
- `PrimitiveStream`
- `RenderView`
- `SceneRef`

// [LAW:one-type-per-behavior] Graph datatypes are finite and semantic. Do not add backend transport types like slot IDs, sink-table descriptors, or indirect records here.

## 3. Block Families

There are five block families in the MVP:

1. resource blocks
2. modulator blocks
3. binding blocks
4. assembly blocks
5. output blocks

## 4. Resource Blocks

### 4.1 `GeometryResource`

Purpose:

- defines reusable geometry identity

Inputs:

- none in MVP

Params:

- `family`
- `variant`
- family-specific static properties

Outputs:

- `geometry: GeometryRef`

MVP variants:

- `triangle`

### 4.2 `MaterialResource`

Purpose:

- defines reusable material identity and parameter schema

Inputs:

- none in MVP

Params:

- `family`
- family-specific static properties

Outputs:

- `material: MaterialRef`

MVP variants:

- `flatColor`

### 4.3 `ViewTemplate`

Purpose:

- defines reusable camera/output baseline

Inputs:

- none in MVP

Params:

- `projectionMode`
- `clearPolicy`
- `defaultPassMask`

Outputs:

- `viewTemplate: ViewTemplateRef`

MVP variants:

- `ortho2d`

## 5. Modulator Blocks

These blocks produce typed control values only.

### 5.1 `Const`

Inputs:

- none

Params:

- typed literal value

Outputs:

- `out: Scalar | Color | Vec2 | Vec3 | Vec4 | Bool`

### 5.2 `Time`

Inputs:

- none

Outputs:

- `seconds: Scalar`
- `phase01: Scalar`

### 5.3 `Sine`

Inputs:

- `x: Scalar`

Outputs:

- `out: Scalar`

### 5.4 `Add`

Inputs:

- `a: Scalar | Vec2 | Vec3 | Vec4 | Color`
- `b: same-as-a`

Outputs:

- `out: same-as-input`

### 5.5 `Multiply`

Inputs:

- `a: Scalar | Vec2 | Vec3 | Vec4 | Color`
- `b: same-as-a or Scalar`

Outputs:

- `out: same-as-a`

### 5.6 `Colorize`

Inputs:

- `hue: Scalar`
- `alpha: Scalar`

Defaults:

- `hue = 0`
- `alpha = 1`

Outputs:

- `color: Color`

## 6. Binding Blocks

Binding blocks are the canonical seam between modulation and scene assembly.

### 6.1 `TransformBindings`

Purpose:

- collects live transform-related authoring values

Inputs:

- `positionX: Scalar`
- `positionY: Scalar`
- `rotation: Scalar`
- `scale: Scalar`

Defaults:

- `positionX = 0`
- `positionY = 0`
- `rotation = 0`
- `scale = 1`

Outputs:

- `transform: TransformBindingSet`

Notes:

- MVP uses scalar uniform scale only.
- anisotropic scale and 3d transforms are future additions to this same block family.

### 6.2 `MaterialBindings`

Purpose:

- collects live material parameter values

Inputs:

- `color: Color`
- `opacity: Scalar`

Defaults:

- `color = white`
- `opacity = 1`

Outputs:

- `material: MaterialBindingSet`

Notes:

- actual exposed ports are material-schema-driven
- MVP flat-color material exposes only `color` and `opacity`

### 6.3 `VisibilityBindings`

Purpose:

- collects live visibility and phase properties

Inputs:

- `visible: Bool`
- `sortBias: Scalar`

Defaults:

- `visible = true`
- `sortBias = 0`

Outputs:

- `visibility: VisibilityBindingSet`

Notes:

- render phase is a parameter in MVP, not a dynamic input

## 7. Assembly Blocks

### 7.1 `PrimitiveDefinition`

Purpose:

- combines one geometry resource, one material resource, and binding schemas

Inputs:

- `geometry: GeometryRef`
- `material: MaterialRef`
- `transform: TransformBindingSet`
- `materialParams: MaterialBindingSet`
- `visibility: VisibilityBindingSet`

Outputs:

- `primitive: PrimitiveDefRef`

Invariants:

- exactly one geometry input
- exactly one material input
- all binding sets are optional at authoring time and defaulted canonically

### 7.2 `SingleEmitter`

Purpose:

- emits one live render primitive from a primitive definition

Inputs:

- `primitive: PrimitiveDefRef`

Outputs:

- `primitives: PrimitiveStream`

### 7.3 `RepeatEmitter`

Purpose:

- emits N live render primitives from one primitive definition

Inputs:

- `primitive: PrimitiveDefRef`
- `count: Scalar`

Outputs:

- `primitives: PrimitiveStream`

Invariants:

- `count` is compiled as deterministic integer instance count
- per-instance indexing is canonical and stable

### 7.4 `ViewDefinition`

Purpose:

- produces a live `RenderView`

Inputs:

- `template: ViewTemplateRef`
- `zoom: Scalar`
- `pan: Vec2`

Defaults:

- `zoom = 1`
- `pan = vec2(0, 0)`

Outputs:

- `view: RenderView`

### 7.5 `Scene`

Purpose:

- collects one or more primitive streams into a scene

Inputs:

- `primitives: PrimitiveStream` (multi-input)

Outputs:

- `scene: SceneRef`

Invariants:

- input ordering is deterministic
- scene composition is additive in MVP

## 8. Output Blocks

### 8.1 `Output`

Purpose:

- terminal block that defines one rendered output

Inputs:

- `scene: SceneRef`
- `view: RenderView`

Outputs:

- none

Invariants:

- output is terminal
- no downstream graph edges

## 9. Canonical Legal Connections

Legal connections are finite.

### Resource -> Assembly

- `GeometryRef -> PrimitiveDefinition.geometry`
- `MaterialRef -> PrimitiveDefinition.material`
- `ViewTemplateRef -> ViewDefinition.template`

### Modulator -> Binding / View

- value types -> `TransformBindings`
- value types -> `MaterialBindings`
- value types -> `VisibilityBindings`
- value types -> `ViewDefinition`

### Binding -> Assembly

- `TransformBindingSet -> PrimitiveDefinition.transform`
- `MaterialBindingSet -> PrimitiveDefinition.materialParams`
- `VisibilityBindingSet -> PrimitiveDefinition.visibility`

### Assembly -> Assembly

- `PrimitiveDefRef -> SingleEmitter.primitive`
- `PrimitiveDefRef -> RepeatEmitter.primitive`
- `PrimitiveStream -> Scene.primitives`

### Assembly -> Output

- `SceneRef -> Output.scene`
- `RenderView -> Output.view`

Illegal examples:

- `GeometryRef -> MaterialBindings`
- `PrimitiveStream -> TransformBindings`
- `RenderView -> PrimitiveDefinition`
- any value type directly into `Output`

// [LAW:one-way-deps] The block graph must enforce these dependency directions mechanically.

## 10. Minimal Proof Graph

This is the smallest canonical scene graph:

```text
GeometryResource(triangle) -> PrimitiveDefinition.geometry
MaterialResource(flatColor) -> PrimitiveDefinition.material

Time.seconds -> Multiply.a
Const(0.5) -> Multiply.b
Multiply.out -> Sine.x

Sine.out -> Add.a
Const(0.0) -> Add.b
Add.out -> TransformBindings.positionX

Sine.out -> Colorize.hue
Const(1.0) -> Colorize.alpha
Colorize.color -> MaterialBindings.color
Const(1.0) -> TransformBindings.scale

TransformBindings.transform -> PrimitiveDefinition.transform
MaterialBindings.material -> PrimitiveDefinition.materialParams

PrimitiveDefinition.primitive -> SingleEmitter.primitive
SingleEmitter.primitives -> Scene.primitives

ViewTemplate(ortho2d) -> ViewDefinition.template
Const(1.0) -> ViewDefinition.zoom
Const(vec2(0,0)) -> ViewDefinition.pan

Scene.scene -> Output.scene
ViewDefinition.view -> Output.view
```

### What This Proves

- resource refs flow correctly
- value modulation flows correctly
- binding sets compile correctly
- primitive definition assembly works
- primitive emission works
- scene collection works
- view generation works
- output maps directly into `SceneRenderSink`

## 11. MVP Block Count

The complete MVP block set is 18 blocks:

1. `GeometryResource`
2. `MaterialResource`
3. `ViewTemplate`
4. `Const`
5. `Time`
6. `Sine`
7. `Add`
8. `Multiply`
9. `Colorize`
10. `TransformBindings`
11. `MaterialBindings`
12. `VisibilityBindings`
13. `PrimitiveDefinition`
14. `SingleEmitter`
15. `RepeatEmitter`
16. `ViewDefinition`
17. `Scene`
18. `Output`

The minimum proof patch does not need every block instance, but the MVP catalog should contain this full set.

## 12. Future Additions

Future additions should extend one of the existing families:

- more geometry resource families
- more material families
- more modulator nodes
- more binding-set ports
- more emitter schemas

Do not add new top-level block families unless the existing families provably cannot model the behavior.

## 13. Bottom Line

The user-facing graph should be small and explicit:

- resource refs
- typed control values
- binding sets
- primitive definitions
- emitters
- views
- scenes
- outputs

That is enough to build real scenes while keeping the graph aligned with the renderer pipeline.
