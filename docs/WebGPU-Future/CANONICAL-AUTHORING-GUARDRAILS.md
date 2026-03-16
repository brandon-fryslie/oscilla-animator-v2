# Canonical Authoring Guardrails

This document defines the concepts, rules, invariants, and boundary constraints for the canonical authoring model.

It exists to prevent the new authoring system from degenerating into:

- generic graph soup
- render-adjacent hidden fields
- ad hoc block proliferation
- duplicated ownership between authoring and renderer layers

It is the policy companion to:

- [CANONICAL-AUTHORING-MODEL-DESIGN.md](./CANONICAL-AUTHORING-MODEL-DESIGN.md)
- [CANONICAL-AUTHORING-BLOCK-CATALOG.md](./CANONICAL-AUTHORING-BLOCK-CATALOG.md)
- [CANONICAL-PATCH-STRUCTURE-DESIGN.md](./CANONICAL-PATCH-STRUCTURE-DESIGN.md)
- [CANONICAL-RENDER-SINK-DESIGN.md](./CANONICAL-RENDER-SINK-DESIGN.md)

// [LAW:single-enforcer] This document is the single high-level rule source for authoring-model boundaries and extension constraints.
// [LAW:verifiable-goals] Every rule below is phrased so it can be enforced by schema checks, editor constraints, compiler validation, or tests.

## 1. Core Concepts

The canonical authoring model has only four semantic layers:

1. `Resources`
2. `Modulation`
3. `Scene Assembly`
4. `Outputs`

These layers are not optional. They are the architecture.

### Resources

Resources define stable reusable identities:

- geometry
- materials
- textures
- view templates

### Modulation

Modulation produces typed live values:

- scalar
- vector
- color
- bool
- trigger
- fields

### Scene Assembly

Scene assembly binds resources and modulation into scene intent:

- primitive definitions
- emitters
- views
- scenes

### Outputs

Outputs connect scene intent to the terminal render boundary.

## 2. Architectural Invariants

### Invariant 1: Users Author Scene Intent, Not Renderer Transport

Users may author:

- resources
- control signals
- bindings
- primitive/view composition

Users may not author:

- indirect draw payloads
- sink-table rows
- slot addresses
- GPU binding indices
- render-pass ABI details

// [LAW:one-way-deps] Renderer transport belongs strictly below outputs.

### Invariant 2: Resource Identity Is Static Authority

Geometry, material, texture, and view-template identity are owned by resource blocks only.

No other block may redefine:

- geometry family
- material schema
- view template schema

// [LAW:one-source-of-truth] Identity is declared once in resources and referenced elsewhere.

### Invariant 3: Modulators Produce Values Only

Modulator blocks may produce only value types.

They may not produce:

- `GeometryRef`
- `MaterialRef`
- `PrimitiveDefRef`
- `SceneRef`
- `RenderView`
- renderer transport types

### Invariant 4: Binding Sets Are The Only Value-To-Scene Bridge

Live values enter scene assembly through binding sets and view definition inputs only.

There must not be alternate side channels such as:

- hidden render outputs
- implicit property discovery from loose graph adjacency
- magic port naming conventions

// [LAW:single-enforcer] Binding sets are the single authoring boundary where live values become scene properties.

### Invariant 5: Emitters Own Cardinality

Only emitters decide how many render primitives exist.

Neither resources nor primitive definitions decide runtime instance count.

### Invariant 6: Outputs Are Terminal

`Output` blocks do not feed anything else.

They are terminals that compile to `SceneRenderSink`.

## 3. Boundary Ownership

Each layer owns exactly one class of concern.

### Resources Own

- family identity
- static schemas
- static defaults
- static topology/material/view definitions

### Modulation Owns

- live value production
- control composition
- stateful animation logic
- realtime reactive logic

### Scene Assembly Owns

- property binding
- primitive composition
- instance emission
- view composition
- scene grouping

### Outputs Own

- final scene + view pairing

### Renderer Owns

- extraction
- prepare
- queueing
- draw packets
- render graph
- pass execution

Any feature proposal that crosses these ownership lines without a clear seam is wrong by default.

## 4. Allowed Graph Flows

Allowed:

- `Resource -> Scene Assembly`
- `Modulation -> Scene Assembly`
- `Scene Assembly -> Scene`
- `Scene + View -> Output`

Forbidden:

- `Output -> anything`
- `Renderer detail -> Authoring block`
- `Modulator -> Resource identity`
- `Resource -> direct render packet`
- `PrimitiveStream -> Modulator`

## 5. Finite Vocabulary Rule

Top-level authoring object kinds are fixed:

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

New product features should extend existing categories first.

Adding a new top-level category requires proof that:

1. the concept cannot be modeled as a resource
2. it cannot be modeled as a modulator
3. it cannot be modeled as scene assembly
4. it cannot be modeled as output configuration

// [LAW:one-type-per-behavior] New top-level categories are exceptional, not routine.

## 6. Block Addition Rules

A new block is allowed only if all of these are true:

1. it belongs to an existing block family
2. its input and output types are already legal in that family, or the new type is justified globally
3. it does not create a second path to bind live values into scene properties
4. it does not leak renderer vocabulary upward
5. its behavior is schema-driven and machine-verifiable

Examples of allowed additions:

- new `GeometryResource` family
- new `MaterialResource` family
- new modulator node like `Noise`
- new property port on `TransformBindings`
- new emitter preset inside `RepeatEmitter`

Examples of forbidden additions:

- `WebGPUType1Sink2`
- `DrawPacketBuilder` authoring block
- `ShapeBankHeaderEditor`
- `MaterializeToSlot`
- hidden `_position` outputs on scene blocks

## 7. Binding Rules

Every bindable property must be declared explicitly with:

1. a property name
2. a type
3. an `updateClass`
4. a default value

```ts
interface BindablePropertyRule {
  name: string;
  type: string;
  updateClass: 'static' | 'variant' | 'view' | 'instance';
  defaultValue: unknown;
}
```

No bindable property may exist implicitly.

### Update Class Rules

`static`

- lives in resources

`variant`

- selects among declared resources/templates

`view`

- affects `RenderView`

`instance`

- affects `RenderPrimitive`

No other update classes are allowed without changing the canonical model.

## 8. Anti-Patterns

These are architectural regressions and should be blocked.

### Anti-Pattern 1: Generic Render Sink Wiring

Symptoms:

- user wires `shape`, `posX`, `rot`, `scale`, `color` directly into sink-like blocks

Why forbidden:

- it bypasses scene assembly

### Anti-Pattern 2: Hidden Transport Outputs

Symptoms:

- blocks emit hidden `_position`, `_shape`, `_rotation` style data

Why forbidden:

- it creates an unofficial second scene-assembly path

### Anti-Pattern 3: Compiler Guesswork

Symptoms:

- compiler infers primitive/view semantics from arbitrary graph adjacency

Why forbidden:

- semantics must be explicit in authoring

### Anti-Pattern 4: Flat Graph Everything

Symptoms:

- resources, modulation, and scene assembly all represented as interchangeable loose nodes with no family semantics

Why forbidden:

- destroys architectural boundaries

### Anti-Pattern 5: Renderer Leaks

Symptoms:

- authoring blocks mention draw modes, indirect strides, bind groups, shape-bank words

Why forbidden:

- breaks one-way dependency boundary

## 9. MVP Guardrails

For the MVP proving subset:

- only one geometry family is allowed
- only one material family is allowed
- only one view template family is allowed
- only `SingleEmitter` and `RepeatEmitter` are allowed
- only the minimal modulator set is allowed

This is deliberate.

// [LAW:no-mode-explosion] The MVP should prove the architecture with one canonical path, not with multiple temporary render-authoring modes.

## 10. Extension Strategy

Features should be added in this order:

1. extend resources
2. extend modulators
3. extend binding-set schemas
4. extend emitter schemas
5. extend view schemas

Do not extend outputs or renderer-facing authoring concepts first.

## 11. Mechanical Enforcement

These rules should become real enforcement:

1. schema validation for all block families
2. compile-time validation of allowed connections
3. tests that prove no authoring block exposes renderer transport fields
4. tests that every bindable property has explicit type/default/updateClass metadata
5. forbidden-pattern tests for hidden render outputs and sink-like render-authoring blocks

## 12. Definition Of Done For New Authoring Features

A new authoring feature is done only when:

1. it fits an existing family or proves a justified new family
2. its ownership boundary is explicit
3. its connection types are finite and validated
4. it compiles into scene intent rather than renderer transport
5. proof tests cover at least one end-to-end patch using it

## 13. Bottom Line

The canonical authoring model is not “a graph where anything can connect to anything.”

It is a constrained graph with:

- finite semantic layers
- finite top-level object kinds
- explicit binding boundaries
- explicit ownership
- hard prohibition on renderer transport leaking upward

Those constraints are what keep the system aligned with the renderer pipeline instead of decaying back into random crap.
