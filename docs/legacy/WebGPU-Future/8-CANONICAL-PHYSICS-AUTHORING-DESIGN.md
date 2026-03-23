# Canonical Physics Authoring Design

This document extends the canonical authoring model so it can express GPU-native simulation compatible with:

- [P6-1__GPU_Physics_Engine_with_Compute_Shaders.md](../WebGPU-Complete/P6-1__GPU_Physics_Engine_with_Compute_Shaders.md)
- [4-CANONICAL-AUTHORING-MODEL-DESIGN.md](./4-CANONICAL-AUTHORING-MODEL-DESIGN.md)
- [3-CANONICAL-PATCH-STRUCTURE-DESIGN.md](./3-CANONICAL-PATCH-STRUCTURE-DESIGN.md)
- [1-CANONICAL-RENDER-SINK-DESIGN.md](./1-CANONICAL-RENDER-SINK-DESIGN.md)

It answers one gap in the current design:

- how simulation-owned domains and physics state become first-class authoring concepts without leaking GPU runtime transport upward

// [LAW:one-source-of-truth] Physics authoring must describe simulation intent once, then compile into canonical arena/constraint/runtime products once. Users must not author arena channels, batch IDs, or compute dispatch loops directly.
// [LAW:one-way-deps] Physics authoring feeds simulation compilation, which feeds scene assembly, which feeds rendering. Render/runtime details never push upward into physics authoring.

## 1. Problem

The current clean-sheet authoring model already supports:

- resources
- modulation
- scene assembly
- outputs

That is enough for render-only animation, but P6-1 requires explicit simulation concepts:

- physics world configuration
- dynamic bodies/particles
- colliders
- constraints
- simulation-produced instance domains

If these are not made first-class, the system will regress into one of two bad shapes:

1. physics hidden inside renderer-facing blocks
2. generic graph outputs that the compiler must reinterpret later as bodies, constraints, or colliders

## 2. Core Principle

Physics authoring should be added as an extension of the existing authoring strata, not as a parallel architecture.

That means:

- resources still own stable definitions
- modulation still owns live control values
- scene assembly still owns renderable scene intent
- outputs still own final scene/view pairing

The new addition is:

- simulation resources and simulation assemblies that produce authoritative dynamic domains for scene assembly

## 3. New Authoring Concepts

The top-level authoring model stays finite.

We do not add a new top-level stratum.

Instead, we extend existing categories with simulation-aware object kinds:

### Resource Extensions

1. `PhysicsWorldResource`
2. `BodyResource`
3. `ConstraintResource`
4. `ColliderResource`

### Assembly Extensions

1. `BodyEmitter`
2. `ConstraintEmitter`
3. `ColliderBinding`
4. `SimulationDefinition`
5. `SimulationInstanceSource`

// [LAW:one-type-per-behavior] Physics is not a separate top-level authoring universe. It extends resources and assembly with simulation-specific families.

## 4. Physics Resources

### 4.1 `PhysicsWorldResource`

Declares stable world-level simulation settings.

```ts
interface PhysicsWorldResource {
  id: string;
  solver: 'xpbd';
  staticProps: {
    gravity: Vec2 | Vec3;
    substeps: number;
    iterations: number;
    collisionMode: 'spatialHash';
  };
  bindableProps: readonly BindableProperty[];
}
```

This corresponds to the user-facing role of the “Physics World” concept in P6-1, without exposing dispatch loops or kernel wiring.

### 4.2 `BodyResource`

Declares reusable physical body/particle schemas.

```ts
interface BodyResource {
  id: string;
  family: 'particle' | 'cluster';
  staticProps: {
    invMass: number;
    friction: number;
    bounce: number;
    radius?: number;
  };
  bindableProps: readonly BindableProperty[];
}
```

### 4.3 `ConstraintResource`

Declares reusable constraint schemas.

```ts
interface ConstraintResource {
  id: string;
  family: 'distance' | 'angle';
  staticProps: Record<string, unknown>;
  bindableProps: readonly BindableProperty[];
}
```

### 4.4 `ColliderResource`

Declares reusable collider semantics tied to geometry identity.

```ts
interface ColliderResource {
  id: string;
  geometry: GeometryRef;
  staticProps: {
    mode: 'solid';
  };
  bindableProps: readonly BindableProperty[];
}
```

This is the correct authoring-side place for “this shape participates in collision,” instead of burying it in renderer headers or hidden flags.

## 5. Physics Modulation

The modulation layer does not change structurally.

Physics still consumes modulation outputs as typed values:

- gravity override
- field forces
- damping multipliers
- spawn rates
- constraint strength
- collider enable/disable

P6-1’s “Force Field” concept fits naturally here as a normal modulation/field producer, not as a renderer or simulation transport block.

## 6. Physics Assembly

Physics assembly is the simulation analogue of scene assembly.

It binds resources and modulation into simulation intent.

### 6.1 `BodyEmitter`

Produces one or more live simulation bodies.

```ts
interface BodyEmitter {
  body: BodyResourceRef;
  instanceSource: InstanceSource;
  bindingValues: BindingValueMap;
}
```

Examples:

- emit one particle
- emit a grid of particles for cloth
- emit a cluster body

### 6.2 `ConstraintEmitter`

Produces live constraint sets over emitted bodies.

```ts
interface ConstraintEmitter {
  constraint: ConstraintResourceRef;
  sourceBodies: BodyEmitterRef | BodyDomainRef;
  topology: ConstraintTopology;
  bindingValues: BindingValueMap;
}
```

The user authors the relationship semantically:

- connect neighbors in a grid
- connect points in a chain
- connect a fixed pair set

The compiler still owns graph coloring, batch ordering, and bank packing as in P6-1.

### 6.3 `ColliderBinding`

Binds colliders into a simulation.

```ts
interface ColliderBinding {
  collider: ColliderResourceRef;
  transformBindings: TransformBindingSet;
  enabled: Bool | Scalar;
}
```

### 6.4 `SimulationDefinition`

Collects a world, bodies, constraints, colliders, and force fields into one simulation unit.

```ts
interface SimulationDefinition {
  world: PhysicsWorldResourceRef;
  bodies: readonly BodyEmitterRef[];
  constraints: readonly ConstraintEmitterRef[];
  colliders: readonly ColliderBindingRef[];
  forces: readonly FieldForceRef[];
}
```

## 7. Simulation Outputs

Simulation must produce explicit typed outputs, not hidden side effects.

The canonical outputs are:

1. `BodyDomainRef`
2. `Field<Scalar | Vec2 | Vec3 | Color>` snapshots derived from simulation state

### `BodyDomainRef`

`BodyDomainRef` is the crucial seam.

It is a simulation-owned instance source that scene assembly can consume.

```ts
interface BodyDomainRef {
  domainId: string;
}
```

Scene assembly does not need arena offsets or solver buffers. It only needs an authoritative domain identity and typed per-instance properties exposed from that domain.

## 8. Bridge To Scene Assembly

This is the main compatibility seam with the render design.

`PrimitiveEmitter` already supports emitting over a domain/instance source in the clean-sheet design. Physics should compile to exactly that seam.

```ts
interface SimulationInstanceSource {
  bodyDomain: BodyDomainRef;
  propertyBindings: {
    position: Field<Vec2> | Field<Vec3>;
    rotation?: Field<Scalar>;
    scale?: Field<Scalar | Vec2>;
    color?: Field<Color>;
  };
}
```

Then scene assembly works unchanged:

- simulation produces a domain
- primitive emitter uses that domain as its `instanceSource`
- transform/material bindings read simulation-derived fields
- scene assembly emits `RenderPrimitive[]`

// [LAW:single-enforcer] Simulation is the single authority for dynamic body state. Scene assembly consumes simulation-owned fields; it must not recompute or reinterpret solver state.

## 9. Canonical User-Facing Physics Blocks

These are the appropriate user-facing blocks for a first physics-capable authoring extension:

1. `PhysicsWorldResource`
2. `BodyResource`
3. `ConstraintResource`
4. `ColliderResource`
5. `BodyEmitter`
6. `ConstraintEmitter`
7. `ColliderBinding`
8. `Simulation`
9. `ForceField`
10. `SimulationToTransform`
11. `SimulationToMaterial`

The last two are not transport blocks. They are typed extraction/binding helpers that expose simulation-owned fields to scene assembly in a schema-driven way.

## 10. Example: Particle Ribbon

```text
Resources
  PhysicsWorldResource(mainWorld)
  BodyResource(particle)
  ConstraintResource(distance)
  GeometryResource(ribbonProfile)
  MaterialResource(neonRibbon)
  ViewTemplate(ortho2d)

Modulation
  gravityOverride
  windForceField
  hueShift

Physics Assembly
  BodyEmitter(gridParticles)
  ConstraintEmitter(structuralLinks)
  Simulation(mainWorld, gridParticles, structuralLinks, windForceField)

Scene Assembly
  PrimitiveDefinition(ribbonProfile, neonRibbon)
  PrimitiveEmitter(instanceSource = Simulation.bodyDomain)
  TransformBindings(position <- SimulationToTransform.position)
  MaterialBindings(color <- SimulationToMaterial.color(hueShift))
  ViewDefinition(ortho2d)

Outputs
  Scene + View -> Output
```

This is compatible with P6-1 because:

- world settings are explicit
- body/constraint topology is authored explicitly
- compiler still owns constraint-bank sorting and batching
- scene assembly consumes simulation results through typed domains, not hidden runtime channels

## 11. MVP Physics Subset

The smallest subset that proves physics compatibility is:

1. `PhysicsWorldResource`
2. `BodyResource(particle)`
3. `BodyEmitter`
4. `ForceField`
5. `Simulation`
6. `SimulationToTransform.position`
7. `PrimitiveEmitter` over `BodyDomainRef`

This proves:

- simulation-owned domains
- modulation-driven forces
- simulation-to-render binding
- renderable emission from solver state

No constraints are required for the first proof slice.

The second proof slice adds:

1. `ConstraintResource(distance)`
2. `ConstraintEmitter`

This proves compatibility with graph-colored constraint scheduling.

## 12. What We Must Not Do

Do not expose these as user authoring concepts:

- `OFFSET_VEL_X`
- `OFFSET_PREV_POS_X`
- `Arena_Ping`
- `ConstraintBank`
- batch IDs
- dispatch loop counts as graph blocks
- ShapeBank flags as direct authoring outputs

Those are runtime/compiler concepts, not authoring concepts.

## 13. Bottom Line

The current clean-sheet authoring architecture is compatible with P6-1 once simulation is modeled as:

- resource definitions
- simulation assembly
- simulation-owned domains
- scene assembly consumption of simulation outputs

That keeps physics first-class without breaking the renderer-aligned authoring boundaries.
