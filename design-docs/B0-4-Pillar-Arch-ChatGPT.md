Here is a **clean, standalone Architecture Reference Document (ARD)** for the **4-Pillar Blocks Overhaul**—fully extracted, normalized, and structured to act as a **source of truth**, not a chat transcript.

---

# Architecture Reference Document (ARD)

## Oscilla Blocks Overhaul: The 4-Pillar Node Abstraction

**Status:** Canonical Reference
**Scope:** Block system redesign, IR contracts, and modulation model
**Primary Goal:** Enable **total parameter modulation** without introducing architectural coupling or “God Objects” 

---

# 1. Executive Summary

The Oscilla block system is being re-architected to support:

* Arbitrary procedural rendering (fluids, parametric math, fields)
* Deep, composable modulation of *all* parameters
* A unified compiler → runtime pipeline with no special cases

The previous model incorrectly centralized parameter bindings inside `RenderIntent`, creating:

* Tight coupling between **data generation** and **data presentation**
* Exploding IR complexity
* Unscalable UI and validation logic

### Core Resolution

We replace the monolithic model with a **4-Pillar Architecture**, enforcing strict separation of concerns:

| Concept      | Role                 | Linguistic Type |
| ------------ | -------------------- | --------------- |
| Generator    | Produces data        | **Noun**        |
| Modifier     | Transforms data      | *(Operator)*    |
| Material     | Describes appearance | **Adjective**   |
| RenderIntent | Executes draw        | **Verb**        |

This separation enables:

* **Total Modulation**
* **Zero duplicate rendering paths**
* **Future-proof extensibility**

---

# 2. Core Problem: The “God Object” Anti-Pattern

### Invalid Design (Deprecated)

```ts
RenderIntent.paramBindings: Map<SemanticId, ValueRef>
```

### Why This Fails

This design forces `RenderIntent` to manage:

* Geometry parameters (e.g., radius)
* Simulation parameters (e.g., viscosity)
* Visual parameters (e.g., color)
* Render state (e.g., blending)

This violates fundamental pipeline separation:

* **Creation ≠ Presentation**
* **Data ≠ Rendering instruction**

### Resulting Issues

* UI becomes unmanageable (too many mixed concerns)
* Compiler must validate unrelated domains together
* Impossible to scale to complex systems (e.g., Milkdrop-style math graphs)

---

# 3. Architectural Principle: Separation by Meaning

The system is organized by **semantic responsibility**, not implementation detail.

### Definitions

* **Source (Noun):** Produces structured data
* **Material (Adjective):** Describes how data looks
* **Intent (Verb):** Tells the engine what to do

> A `FluidSolver` owns viscosity.
> A `Material` owns color.
> A `RenderIntent` only decides how to draw. 

---

# 4. The 4-Pillar Architecture

---

## 4.1 Pillar 1 — Generators (`RenderSource`)

### Purpose

Introduce data into the pipeline.

### Key Design

* Implemented as a **sum type**
* Own **all generation parameters**
* Emit a **ResourceProxy**

### Variants

```ts
type RenderSourceKind =
  | 'Topology'
  | 'Parametric'
  | 'Field'
  | 'SolverResource';
```

### Examples

* Mesh topology
* Parametric splines
* SDF fields
* Fluid simulation outputs

### IR Contract

```ts
interface RenderSource {
  kind: RenderSourceKind;

  // Generator owns its own parameters
  sourceBindings: Map<SemanticId, ValueExprId>;

  output: ResourceProxyId;
}
```

### Key Rule

> Generation parameters NEVER leave the source.

---

## 4.2 Pillar 2 — Modifiers

### Purpose

Transform or process data between generation and rendering.

### Behavior

* Input: `ResourceProxyId`
* Output: `ResourceProxyId`
* Runs compute kernels

### Examples

* `TwistGeometry`
* `AdvectFluid`
* `RemapField`
* Future: Milkdrop-style math blocks

### Key Insight

Modifiers allow:

* Arbitrary procedural complexity
* Infinite extensibility
* No change to renderer

---

## 4.3 Pillar 3 — Materials

### Purpose

Define visual appearance independently of structure.

### Properties

* Completely agnostic to source type
* Own their own parameter bindings

### Examples

* `BasicUnlit`
* `MatCap`
* `FluidColorWarp`

### IR Contract

```ts
interface Material {
  kind: 'ShaderAST' | 'ComputeComposite';

  materialBindings: Map<SemanticId, ValueExprId>;

  output: MaterialProxyId;
}
```

### Key Rule

> Materials NEVER care what they are rendering.

---

## 4.4 Pillar 4 — Render Sink (`RenderIntent`)

### Purpose

Execute rendering.

### Design

* Extremely thin
* Combines Source + Material
* Adds ONLY presentation state

### IR Contract

```ts
interface RenderIntent {
  source: ResourceProxyId;
  material: MaterialProxyId;

  intentBindings: Map<
    'blendMode' | 'depthTest',
    ValueExprId
  >;
}
```

### Key Rule

> `RenderIntent` is NOT allowed to own generation or material parameters.

---

# 5. Total Modulation Model

The architecture guarantees that **every parameter in the system is modulatable**, while remaining structurally clean.

### Example

| Target          | Binding Type     | Example                              |
| --------------- | ---------------- | ------------------------------------ |
| Fluid viscosity | Source Binding   | Oscillator → `FluidSolver.viscosity` |
| Color hue       | Material Binding | Noise → `Material.hue`               |
| Blend mode      | Intent Binding   | Constant → `Draw.blendMode`          |

### Why This Works

* Each parameter is evaluated in its **correct stage**
* Compiler resolves them into **isolated passes**
* Runtime executes blindly

> Everything is modulatable, but nothing is coupled. 

---

# 6. System Properties

---

## 6.1 Zero Duplicate Code

You do NOT need:

* `RenderFluid`
* `RenderMesh`
* `RenderSpline`

Instead:

* One `Draw` block
* One unified pipeline

---

## 6.2 Future-Proofing

Supports:

* Arbitrary math graphs
* Legacy preset systems (e.g., Milkdrop)
* New simulation domains

Because:

* New features become **Generators or Modifiers**
* Renderer remains unchanged

---

## 6.3 Compiler Simplicity

Each stage validates independently:

| Stage    | Validates                  |
| -------- | -------------------------- |
| Source   | Required semantics present |
| Modifier | Input/output compatibility |
| Material | Shader bindings            |
| Intent   | Rendering state only       |

---

# 7. Boundaries of the Architecture

The system supports **value modulation**, but not **structural mutation** at runtime.

---

## 7.1 Supported (Fast, Real-Time)

* Parameter modulation (positions, colors, velocities)
* Instance count (via preallocated buffers)
* Camera transforms (via global uniforms)

---

## 7.2 Not Supported (Requires Rebuild)

### 1. Dynamic Topology

* Cannot change mesh resolution per frame
* Requires reallocation of buffers

---

### 2. Variable-Length Data

* Cannot spawn unbounded particles dynamically
* Must use **fixed pools**

---

### 3. Graph Structure Changes

* Cannot dynamically add/remove nodes
* Must use parameter modulation instead

---

# 8. Design Laws (Non-Negotiable)

### LAW: one-type-per-behavior

One unified `RenderSource` with variants
→ No parallel systems per shape type 

---

### LAW: one-source-of-truth

All source metadata lives in IR
→ Runtime never infers or guesses 

---

### LAW: dataflow-not-control-flow

No dynamic branching at graph level
→ Only data modulation

---

# 9. Implementation Guardrails

### 9.1 No Leaky Bindings

* `RenderIntent` must reject source/material params

---

### 9.2 Proxy Integrity

* Blocks operate ONLY on `ResourceProxyId`
* No introspection of upstream data

---

### 9.3 Strict Ownership

| Binding Type     | Owner        |
| ---------------- | ------------ |
| sourceBindings   | Generator    |
| modifierBindings | Modifier     |
| materialBindings | Material     |
| intentBindings   | RenderIntent |

---

# 10. Mental Model

Think of the system as:

```
[ Generator ] → [ Modifier ] → [ Material ] → [ RenderIntent ]
      Noun         Operator       Adjective        Verb
```

---

# 11. Final Verdict

This architecture achieves:

* ✅ Total modulation across all parameters
* ✅ Clean IR with strict ownership boundaries
* ✅ Unified rendering pipeline (no special cases)
* ✅ Long-term scalability to complex procedural systems

And most importantly:

> It prevents the system from collapsing into a “God Object” architecture while still allowing unlimited expressive power. 

---

If you want, next step I’d recommend is:

* defining the **exact TypeScript schemas + compiler passes**
* or designing the **block UI layer** that maps cleanly to this IR

Those are where this either becomes elegant—or falls apart.
