# Canonical Authoring Model Design

This document defines the concrete user-facing authoring model that sits above:

- [3-CANONICAL-PATCH-STRUCTURE-DESIGN.md](./3-CANONICAL-PATCH-STRUCTURE-DESIGN.md)
- [1-CANONICAL-RENDER-SINK-DESIGN.md](./1-CANONICAL-RENDER-SINK-DESIGN.md)

It answers three questions:

1. how users author resources
2. how users author modulators
3. how users author scene assembly objects

It also answers two scoping questions:

1. whether the authoring vocabulary is finite
2. what the minimum subset is that proves the pipeline end-to-end

// [LAW:one-source-of-truth] The authoring model must describe one canonical user intent model that compiles into the patch structure. Users should not need a second, renderer-shaped vocabulary to finish a patch.
// [LAW:one-way-deps] Authoring objects compile downward into patch structure, scene packets, and renderer packets. Renderer-stage details never become authoring requirements.

## 1. Problem

The new patch structure established the right strata:

- resources
- modulation
- scene assembly
- outputs

What is still missing is the concrete user-facing vocabulary.

If we do not define that vocabulary explicitly, the system will drift back into:

- generic graph soup
- ad hoc block proliferation
- late compiler inference of scene semantics

The authoring model needs to be:

- finite at the architectural level
- expressive enough for realtime modulation
- small enough to prove end-to-end before broadening

## 2. Core Principle

Users should author:

- reusable definitions
- modulation networks
- bindings from modulation into scene properties
- scene outputs

Users should not author:

- draw records
- slot layouts
- backend resource binding details
- hidden transport fields

The authoring model is therefore a finite set of object kinds with open-ended instances.

## 3. The Finite Authoring Vocabulary

Yes: there should be a finite number of top-level authoring object kinds.

The canonical set is:

1. `GeometryResource`
2. `MaterialResource`
3. `TextureResource`
4. `ViewTemplate`
5. `ModulatorGraph`
6. `PrimitiveDefinition`
7. `PrimitiveEmitter`
8. `ViewDefinition`
9. `SceneDefinition`
10. `OutputDefinition`

That is the entire authoring vocabulary at the architecture level.

There can be many geometry families, many material families, and many modulator node implementations, but they all live inside this fixed envelope.

// [LAW:one-type-per-behavior] We should add new families or schemas inside these object kinds before inventing new top-level authoring categories.

## 4. How Users Author Resources

Resources are reusable definitions. Users author them declaratively.

### 4.1 Geometry Resource

A `GeometryResource` answers:

- what geometry family is this
- what static topology/template data does it own
- what local bounds does it own
- which properties are static vs bindable later

```ts
interface GeometryResource {
  id: string;
  family: GeometryFamily;
  staticProps: Record<string, unknown>;
  bindableProps: readonly BindableProperty[];
}
```

Examples:

- rigid circle
- rigid polygon
- parametric curve template
- ribbon profile
- sdf proxy shape

Users author geometry resources by selecting a family and setting its declared properties. The family schema decides what exists; the user does not invent fields ad hoc.

### 4.2 Material Resource

A `MaterialResource` answers:

- what shader/material family is this
- what parameter schema does it expose
- what render policies does it lock

```ts
interface MaterialResource {
  id: string;
  family: MaterialFamily;
  staticProps: Record<string, unknown>;
  paramSchema: readonly MaterialParamDefinition[];
}
```

Examples:

- flat color
- neon emissive
- matcap
- sdf fill/stroke
- text msdf

### 4.3 Texture Resource

A `TextureResource` declares imported or generated image data that material resources may reference.

### 4.4 View Template

A `ViewTemplate` declares a reusable camera/output baseline:

- orthographic 2d
- perspective 3d
- transparent overlay view

### Resource Authoring Rule

Resources are edited like definitions, not like live per-frame graphs.

They should expose:

- stable family choice
- stable schema-driven properties
- named bindable slots for later scene assembly

// [LAW:one-source-of-truth] Resource identity and schema live here once. Scene assembly references resources; it does not redefine them.

## 5. How Users Author Modulators

Users author modulators as graphs.

That graph is intentionally narrow in responsibility: it produces typed control values.

### 5.1 Modulator Node Roles

The modulator graph should be finite at the role level:

1. `Source`
2. `Math`
3. `Shape`
4. `State`
5. `Select`
6. `Map`

Examples inside each role:

- `Source`: time, mouse, audio, random, midi, constant
- `Math`: add, multiply, clamp, mix
- `Shape`: sine, envelope, noise, curve remap
- `State`: delay, integrator, latch, smooth
- `Select`: switch, gate, compare, quantize
- `Map`: scalar->color, scalar->vec2, domain remap, normalize

This keeps the modulation graph conceptually finite without restricting the actual node library too aggressively.

### 5.2 Modulator Outputs

Every modulator output is a typed authoring value:

```ts
type ModulatorOutput =
  | Scalar
  | Vec2
  | Vec3
  | Vec4
  | Color
  | Bool
  | Trigger
  | Field<T>;
```

### 5.3 What Users Do With Modulators

Users wire modulators into named binding slots exposed by scene assembly objects.

Examples:

- oscillator -> `transform.position.x`
- envelope -> `transform.scale`
- audio band -> `material.glow`
- mouse -> `view.pan`

They do not wire modulators straight into the renderer sink.

## 6. How Users Author Scene Assembly Objects

Scene assembly is where the patch becomes scene intent.

Users author five things here:

1. binding sets
2. primitive definitions
3. primitive emitters
4. view definitions
5. scenes

### 6.1 Binding Sets

Binding sets are the central authoring seam.

There are three binding-set categories:

- `TransformBindingSet`
- `MaterialBindingSet`
- `VisibilityBindingSet`

Each binding set is schema-driven. Users select a target property and then connect:

- a constant
- a modulator output
- a variant selector

```ts
interface PropertyBinding {
  target: string;
  source: BindingSource;
  updateClass: 'static' | 'variant' | 'view' | 'instance';
}
```

### 6.2 Primitive Definition

`PrimitiveDefinition` combines:

- one geometry resource
- one material resource
- binding schemas for transform/material/visibility

It answers: “what kind of thing is this renderable?”

### 6.3 Primitive Emitter

`PrimitiveEmitter` answers: “how many of these exist, and over what instance source?”

Finite emitter kinds should be:

1. `SingleEmitter`
2. `RepeatEmitter`
3. `DomainEmitter`

That is enough for the architecture.

`SingleEmitter`

- one instance

`RepeatEmitter`

- N instances with deterministic indexing

`DomainEmitter`

- instances driven by an explicit upstream domain/field source

More specialized emitters can exist later as schemas or presets inside these families.

### 6.4 View Definition

`ViewDefinition` takes one `ViewTemplate` and binds live camera/view properties.

Examples:

- zoom bound to oscillator
- pan bound to mouse
- exposure bound to envelope

### 6.5 Scene Definition

`SceneDefinition` is just a collection boundary:

```ts
interface SceneDefinition {
  primitives: readonly PrimitiveEmitterRef[];
}
```

Users author scenes by choosing which emitters participate together.

## 7. Composition Rules

The authoring model should enforce these legal flows:

- resources -> scene assembly
- modulators -> scene assembly
- scene assembly -> scenes
- scenes + views -> outputs

Illegal flows:

- outputs -> modulators
- renderer transport -> resources
- materials directly mutating geometry schemas
- modulators directly producing renderer packets

// [LAW:one-way-deps] Composition rules should be structural, not advisory. The editor and compiler should prevent upward dependencies.

## 8. Is The Authoring Model Finite?

Yes, in the only way that matters architecturally.

### Finite

These are finite:

- top-level authoring object kinds
- modulator node roles
- binding-set categories
- emitter kinds
- update classes

### Open-Ended

These are intentionally open-ended:

- the number of user-created resources
- the number of modulator nodes/instances
- the number of scenes/views/outputs
- the number of geometry or material families the engine eventually supports

That gives us a stable compiler model without forcing a tiny creative surface.

## 9. Minimal Subset To Prove The Pipeline

Yes: there is a very small subset that proves the whole pipeline.

### 9.1 Minimal Resources

1. `GeometryResource`
   One rigid 2D geometry family, for example `triangle`.
2. `MaterialResource`
   One unlit/flat-color material family.
3. `ViewTemplate`
   One orthographic 2D view template.

### 9.2 Minimal Modulators

1. `Const`
2. `Time`
3. `Sine`
4. `Add`
5. `Multiply`
6. `Colorize`

That is enough to prove:

- time-driven modulation
- value composition
- scalar-to-color mapping
- binding propagation

### 9.3 Minimal Scene Assembly

1. `TransformBindingSet`
2. `MaterialBindingSet`
3. `PrimitiveDefinition`
4. `SingleEmitter`
5. `ViewDefinition`
6. `SceneDefinition`
7. `OutputDefinition`

### 9.4 First Proof Patch

One primitive on screen with:

- modulated x position
- modulated scale
- modulated color
- modulated view zoom

That proves:

- resource compilation to catalogs
- modulator graph execution
- scene assembly binding
- `RenderPrimitive` generation
- `RenderView` generation
- `SceneRenderSink`
- `RenderPrepare`
- `DrawQueueBuilder`
- render execution

### 9.5 Second Proof Patch

Add one more thing only:

- `RepeatEmitter`

Now prove:

- N-instance emission
- deterministic instance indexing
- per-instance parameter packing

That is enough to validate the pipeline shape before adding parametric, ribbon, SDF, text, or deeper scene semantics.

## 10. Canonical MVP Scope

The minimum viable authoring surface should therefore be:

```text
Resources:
  - GeometryResource(rigid triangle)
  - MaterialResource(flat color)
  - ViewTemplate(ortho2d)

Modulators:
  - Const
  - Time
  - Sine
  - Add
  - Multiply
  - Colorize

Scene Assembly:
  - TransformBindingSet
  - MaterialBindingSet
  - PrimitiveDefinition
  - SingleEmitter
  - RepeatEmitter
  - ViewDefinition
  - SceneDefinition
  - OutputDefinition
```

That is the smallest authoring vocabulary that proves the real architecture rather than a toy branch.

## 11. Authoring Workflow

The intended user workflow should be:

1. Define a geometry resource.
2. Define a material resource.
3. Define a view template.
4. Build a modulation graph that produces reusable control signals.
5. Create a primitive definition from geometry + material.
6. Bind modulation outputs into transform/material slots.
7. Choose an emitter kind.
8. Create a view definition from a template and bind view properties.
9. Add the emitter to a scene.
10. Route the scene and view to an output.

This is a much cleaner mental model than wiring isolated values directly into a sink.

## 12. Example

```text
Resources
  GeometryResource: triangle
  MaterialResource: flatColor
  ViewTemplate: ortho2d

Modulators
  time
  sine(time * 0.4)
  sine(time * 0.7)
  colorize(sine(time * 0.4))

Scene Assembly
  PrimitiveDefinition(triangle, flatColor)
  TransformBindingSet:
    position.x <- sine(time * 0.4)
    scale <- 0.5 + sine(time * 0.7) * 0.2
  MaterialBindingSet:
    color <- colorize(sine(time * 0.4))
  SingleEmitter
  ViewDefinition(ortho2d):
    zoom <- 1.0 + sine(time * 0.2) * 0.1

Scene
  mainScene <- [triangleEmitter]

Output
  mainScene + mainView
```

## 13. What We Should Not Do

Do not make resources, modulators, and assemblies all look like the same generic node kind at the render boundary.

Do not let:

- geometry identity
- material identity
- transform bindings
- view bindings
- instance emission strategy

be recovered implicitly later by compiler guesswork.

## 14. Concrete Follow-Up Tickets

1. Define the schema for the 10 canonical authoring object kinds.
2. Define the finite modulator role taxonomy and its first allowed node families.
3. Define binding-set schemas and the canonical `updateClass` table for every bindable property.
4. Implement the MVP authoring surface only, with one rigid geometry, one flat material, one ortho view, and the five minimal modulators.
5. Add proof patches for `SingleEmitter` and `RepeatEmitter`.
6. Add compiler tests that prove the MVP authoring model lowers to `RenderPrimitive[]` and `RenderView` without hidden render transport fields.

## 15. Bottom Line

Users should author a finite vocabulary:

- resources
- modulators
- bindings
- emitters
- views
- scenes
- outputs

That vocabulary is small enough to implement and verify, but broad enough to let users modulate everything that matters in realtime.

The finite architecture is what makes the system coherent. The open-ended instances and families are what make it expressive.
