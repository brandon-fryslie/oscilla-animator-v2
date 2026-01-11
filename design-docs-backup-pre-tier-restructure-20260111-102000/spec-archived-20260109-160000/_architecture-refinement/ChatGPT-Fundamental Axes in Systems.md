# Fundamental Axes in Systems

**User:** Brandroid Frizzle (brandroid@vast.wang)  
**Created:** 1/8/2026 5:15:06 PM  
**Updated:** 1/9/2026 12:05:16 AM  
**Exported:** 1/9/2026 12:07:00 AM  
**Link:** [https://chatgpt.com/c/69604796-87ac-8330-b7e5-1cb26d56ef27](https://chatgpt.com/c/69604796-87ac-8330-b7e5-1cb26d56ef27)  

## Prompt:
OK, please give me the final design spec that goes from this: https://gist.github.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849

To include what we've discussed here, in a way that does not 
- conflate any concepts
- add unnecessary complexity
- hide concepts under imprecision or false metaphors

and allows this application to have a clean architecture and performant runtime

This is the one that counts, be comprehensive.  I'll say Next for the next parts

## Response:
Thought for 10s

Below is the **canonical v2.5 design spec** that starts from your current “World + Domain + Events” model and upgrades it to the **five-axis** model we discussed, while keeping:

*   **no concept conflation**
*   **no unnecessary complexity**
*   **no runtime axis overhead**
*   **no optional fields**
*   **pure/stateless blocks by default**
*   **state only in state blocks**
*   **clean architecture + 5–10ms runtime** [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

I’m writing this in the same TypeScript/discriminated-union vocabulary as your current spec. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

* * *

Oscilla v2.5 Type + Domain System
=================================

**A looping, interactive visual instrument compiled from a typed reactive graph**

0\. Scope and non-goals
-----------------------

### Scope

This spec defines:

1.  The **type system** for values flowing through the graph, upgraded from `(World, ValueType, Domain?)` to a **5-axis coordinate**.
2.  The **domain system** as a **compile-time resource** that enables `field` semantics (N lanes).
3.  The **compile-time pipeline responsibilities** and **runtime erasure** rules needed for performance.

### Non-goals (explicitly deferred)

*   Perspective and Branch behavior beyond defaults (we encode them, but they are inert in v0).
*   Domain-to-domain mapping/resampling (v0 requires exact domain identity for alignment).
*   User-facing timeline features (the system is a looping instrument; time is signals + events). [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

* * *

1\. Current baseline model (for continuity)
-------------------------------------------

Current v2 defines: `ValueType`, `World`, `Type`, `Domain`, and the 2-axis insight (Cardinality + Temporality). [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

*   `World = static | signal | field | event` [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)
*   `field` requires `domain` (element topology) [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)
*   Events are orthogonal temporality: continuous behaviors vs discrete events [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)
*   Only a small set of primitives are stateful: UnitDelay, Phasor, Accumulator, SampleAndHold [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)
*   Pipeline: `RawGraph → GraphNormalization → NormalizedGraph → Compilation → CompiledProgramIR` [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

This spec keeps all of that _intact_ conceptually and makes the latent structure explicit.

* * *

2\. Definitions: what each concept means (no overlaps)
------------------------------------------------------

### 2.1 ValueType (payload kind)

Unchanged. These are the primitive payload types that flow through wires. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

```ts
type ValueType = 'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit';
```

### 2.2 Domain (lane topology) — compile-time resource

A **Domain** is a compile-time declared **stable index set** used only when cardinality is `many`.

*   It defines **how many lanes exist** and **how they line up**.
*   It does **not** define meaning, ownership, or “what the value is about”.
*   It does **not** flow on wires.
*   At runtime, a domain becomes loop bounds + layout constants (erased as an object).

This is the precise resolution of your “Domain (element topology)” section, without conflating it with meaning. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

### 2.3 Binding (referential anchoring) — semantic meaning, not topology

Binding answers: **what is this value about?**

*   `unbound`: pure value/signal/field
*   `weak`: measurement-like about a referent
*   `strong`: property-like about a referent
*   `identity`: stable entity identity

Binding is **independent** of domain:

*   same domain can host unbound image vs bound mask
*   same referent can have scalar properties and per-vertex fields

This resolves your open question “Binding: Is this what Domain currently represents?” with a strict “no”: domain is topology; binding is aboutness. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

### 2.4 Perspective and Branch — compile-time coordinates, inert by default

Perspective and Branch exist in the type coordinate so you can add multi-view and multi-history later, but they are **defaults-only in v0**, so they do not swamp simple patches. Your spec already anticipates preview/undo/export questions; this encodes them without implementing them. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

* * *

3\. The five axes as a coordinate system
----------------------------------------

### 3.1 AxisTag: “default unless instantiated” (no optionals)

We represent “default unless used” _explicitly_ using discriminated unions.

```ts
type AxisTag<T> =
  | { kind: 'default' }
  | { kind: 'instantiated'; value: T };
```

No optional fields; the union branch determines what exists.

### 3.2 DefaultSemantics: canonical now, inherit later

```ts
type DefaultSemantics<T> =
  | { kind: 'canonical'; value: T }  // v0
  | { kind: 'inherit' };             // v1+
```

An eval frame exists even in v0, but v0 uses canonical defaults.

```ts
type EvalFrame = {
  perspective: PerspectiveId;
  branch: BranchId;
};
```

### 3.3 Resolution (compile-time)

Resolution happens during compilation and never in the hot loop.

```ts
function resolveAxis<T>(
  tag: AxisTag<T>,
  semantics: DefaultSemantics<T>,
  frameValue: T,
): T {
  if (tag.kind === 'instantiated') return tag.value;
  return semantics.kind === 'canonical' ? semantics.value : frameValue;
}
```

* * *

4\. Axis definitions (concrete)
-------------------------------

### 4.1 Cardinality (how many lanes)

This is the formal replacement for `static/signal/field` in `World`. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

```ts
type DomainId = string;
type DomainRef = { kind: 'domain'; id: DomainId };

type Cardinality =
  | { kind: 'zero' }                      // compile-time constant, no runtime lanes
  | { kind: 'one' }                       // single lane
  | { kind: 'many'; domain: DomainRef };  // N lanes aligned by domain
```

Important: `one` and `zero` do **not** carry a domain, and that is still “no optionals” because this is a discriminated union (same pattern as your current `Type` union). [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

### 4.2 Temporality (when)

This is the formal replacement for `event` being orthogonal. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

```ts
type Temporality =
  | { kind: 'continuous' }  // value exists every frame/tick
  | { kind: 'discrete' };   // event occurrences only
```

### 4.3 Binding (to what)

```ts
type ReferentId = string;
type ReferentRef = { kind: 'referent'; id: ReferentId };

type Binding =
  | { kind: 'unbound' }
  | { kind: 'weak'; referent: ReferentRef }
  | { kind: 'strong'; referent: ReferentRef }
  | { kind: 'identity'; referent: ReferentRef };
```

### 4.4 Perspective and Branch (ids only)

```ts
type PerspectiveId = string;
type BranchId = string;
```

* * *

5\. The new Type (5-axis coordinate + payload kind)
---------------------------------------------------

This replaces the current:

````ts
type Type =
  | { world: 'static'; value: ValueType }
  | { world: 'signal'; value: ValueType }
  | { world: 'field'; value: ValueType; domain: DomainRef }
  | { world: 'event'; value: ValueType };
``` :contentReference[oaicite:16]{index=16}

with:

```ts
type Type = {
  value: ValueType;

  cardinality: AxisTag<Cardinality>;
  temporality: AxisTag<Temporality>;
  binding: AxisTag<Binding>;
  perspective: AxisTag<PerspectiveId>;
  branch: AxisTag<BranchId>;
};
````

No optional fields. All axes always exist.

* * *

6\. Canonical defaults (v0)
---------------------------

In v0, defaults are canonical singletons; perspective/branch do not exist as runtime concerns.

```ts
const DEFAULTS_V0 = {
  cardinality: { kind: 'canonical', value: { kind: 'one' } } as DefaultSemantics<Cardinality>,
  temporality: { kind: 'canonical', value: { kind: 'continuous' } } as DefaultSemantics<Temporality>,
  binding:     { kind: 'canonical', value: { kind: 'unbound' } } as DefaultSemantics<Binding>,
  perspective: { kind: 'canonical', value: 'global' } as DefaultSemantics<PerspectiveId>,
  branch:      { kind: 'canonical', value: 'main' } as DefaultSemantics<BranchId>,
};

const FRAME_V0: EvalFrame = { perspective: 'global', branch: 'main' };
```

* * *

7\. Join/unification rules (v0, compile-time only)
--------------------------------------------------

When a node has multiple inputs that must agree on some coordinate (or when you combine wires), each axis unifies independently using this strict rule:

*   default + default → default
*   default + instantiated(X) → instantiated(X)
*   instantiated(X) + instantiated(X) → instantiated(X)
*   instantiated(X) + instantiated(Y), X≠Y → **type error**

No implicit merges. No “best effort.” This keeps behavior predictable and avoids premature lattice design.

This applies to all five axes in v0, including domain via `Cardinality.many(domain)`.

* * *

8\. Mapping old World → new coordinate (mechanical equivalence)
---------------------------------------------------------------

Your current “Cardinality unification” table becomes a compile-time mapping. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

| Old World | New Cardinality | New Temporality |
| --- | --- | --- |
| static | zero | continuous |
| signal | one | continuous |
| field(domain) | many(domain) | continuous |
| event | one OR many(domain) (see below) | discrete |

Event cardinality convention:

*   “trigger” (single event stream) = `cardinality: one`, `temporality: discrete`
*   “element-trigger” (per-element event stream) = `cardinality: many(domain)`, `temporality: discrete` [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

This preserves your 2D space grid exactly, but expresses it without a bespoke `World` enum. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

* * *

9\. Domain system (practical, compile-time resource)
----------------------------------------------------

### 9.1 Domain declarations live in the patch as resources, not wires

A “domain block” is not an executable block; it is a **DomainDecl** resource entry that GraphNormalization materializes and the compiler consumes.

This keeps “domain” from being treated as a runtime value (which would violate your performance and erasure requirements).

### 9.2 DomainDecl schema (v0 minimal)

```ts
type DomainDecl =
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'fixed_count'; count: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'grid_2d'; width: number; height: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'voices'; maxVoices: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'mesh_vertices'; assetId: string } };
```

v0 invariant: every domain compiles to **dense lanes 0..N-1** and a fixed elementCount known at compilation.

### 9.3 How ports “use” a domain

Ports do not accept a domain wire. They carry a type whose cardinality references a domain:

```ts
cardinality: { kind: 'instantiated', value: { kind: 'many', domain: { kind:'domain', id:'D1' } } }
```

### 9.4 Alignment rule (v0)

Two `many` values are aligned iff they reference the **same DomainId**.  
No mapping/resampling exists in v0.

* * *

10\. Blocks, purity, and state (preserving your model)
------------------------------------------------------

### 10.1 Purity is default

All blocks are pure/stateless except the explicit stateful primitives you listed. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

### 10.2 Stateful primitives remain exactly the same set

*   UnitDelay
*   Phasor
*   Accumulator
*   SampleAndHold [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

### 10.3 The only new rule: per-lane state allocation is determined by cardinality

If a stateful block is typed as:

*   `cardinality = one` → allocate one state cell
*   `cardinality = many(domain)` → allocate `N(domain)` state cells (one per lane)
*   `cardinality = zero` → no runtime state exists

This is purely a compilation/layout consequence of existing behavior.

* * *

11\. Time system and rails (retyped, not redesigned)
----------------------------------------------------

Your TimeRoot outputs remain exactly as you wrote them. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)  
They are simply expressed with the new coordinate system.

*   `tMs`, `phaseA`, `phaseB`, `progress` are `one + continuous` [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)
*   `pulse` is `one + discrete` (a trigger stream) [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

Rails remain system-provided buses: `time`, `phaseA`, `phaseB`, `pulse`. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

* * *

12\. Combine modes (unchanged; axis unification happens first)
--------------------------------------------------------------

Combine modes remain exactly as specified (numeric: sum/avg/min/max/mul; any: last/first/layer; bool: or/and). [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

Rule order:

1.  unify types/axes
2.  then apply combine mode to payloads

No change to runtime design.

* * *

13\. Derived blocks, roles, and pipeline (architecture invariants preserved)
----------------------------------------------------------------------------

Your roles model remains editor-only; the compiler ignores roles. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

Pipeline remains:  
`RawGraph → GraphNormalization → NormalizedGraph → Compilation → CompiledProgramIR` [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

### 13.1 Where the five-axis model actually lives

*   **GraphNormalization**: assigns initial `Type` coordinates to ports/wires, mostly with `AxisTag.default` for binding/perspective/branch.
*   **Compilation**:
    *   unifies axes (join rules)
    *   resolves defaults (`DEFAULTS_V0`, `FRAME_V0`)
    *   specializes schedules and loops based on `(Cardinality, Temporality, Domain)`
    *   allocates state slots based on cardinality and stateful primitives
    *   erases axes from runtime IR

This keeps the runtime IR close to your current “signalExprs, fieldExprs, render sinks” intent. [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

* * *

14\. Runtime erasure requirements (hard constraints)
----------------------------------------------------

To meet the 5–10ms budget:

1.  No axis tags exist in runtime values.
2.  No referent ids exist in runtime values.
3.  No domain objects exist at runtime; only loop constants/layout.
4.  Perspective/Branch select program variants and state buffers (later); in v0 there is exactly one.

Runtime sees only:

*   scalar values
*   dense arrays
*   event buffers (if you represent discrete streams explicitly)
*   compiled schedules

* * *

15\. What changes for engineers vs what stays the same
------------------------------------------------------

### Stays the same

*   Your conceptual 2D model of continuous vs discrete and 0/1/N cardinality [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)
*   Your “state only in state blocks” rule [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)
*   Rails, default sources, combine modes, pipeline, roles separation [Gist](https://gist.githubusercontent.com/brandon-fryslie/888ae07d1c7da6fe8cfffc5659833849/raw/5d316a3e4205bb79755842f595c12ebe8bf28216/TYPE-SYSTEM-CURRENT-STATE.md)

### Changes (precise and limited)

*   Replace `World` with `Cardinality + Temporality` (plus the extra axes as default-only tags).
*   Treat `Domain` as a patch-level resource referenced by types, not a value flowing on wires.
*   Add Binding/Perspective/Branch tags to the type coordinate (but default-only in v0).

* * *

If you say **Next**, I’ll continue with the remaining sections: concrete compiler data structures (NormalizedGraph + CompiledProgramIR shape), scheduling rules for continuous vs discrete, how default sources/buses are typed in the new system, and the minimal UI model that configures domains without conflating them with runtime blocks.

## Prompt:
Next

## Response:
Thought for 16s

16\. NormalizedGraph: canonical compile-time representation
-----------------------------------------------------------

This is the single representation the compiler consumes. It is explicitly closed: all derived blocks and implicit wiring are materialized during normalization, and nothing “magical” happens after this point.

### 16.1 IDs and references

```ts
type NodeId = string;
type PortId = string;
type EdgeId = string;

type NodeRef = { kind: 'node'; id: NodeId };
type PortRef = { kind: 'port'; node: NodeRef; port: PortId };
type EdgeRef = { kind: 'edge'; id: EdgeId };
```

### 16.2 Ports and edges

Ports are typed; edges are simple connections. Combine behavior is an attribute of the _input port_, not the edge. This matches your existing “combine modes on connections” model but makes it deterministic: the input port is the accumulation site.

```ts
type CombineMode =
  | { kind: 'numeric'; op: 'sum' | 'avg' | 'min' | 'max' | 'mul' }
  | { kind: 'any'; op: 'last' | 'first' | 'layer' }
  | { kind: 'bool'; op: 'or' | 'and' };

type PortDirection = { kind: 'in' } | { kind: 'out' };

type Port = {
  id: PortId;
  dir: PortDirection;
  type: Type;              // 5-axis coordinate (AxisTag per axis)
  combine: CombineMode;     // only meaningful for inputs, still total
};

type Edge = {
  id: EdgeId;
  from: PortRef;  // out
  to: PortRef;    // in
};
```

### 16.3 Domain declarations as resources (not runtime nodes)

Domains exist in the patch model and normalization output so they can be referenced by types, but they are not part of the runtime dataflow. This is the “domain is not a wire value” rule made explicit.

```ts
type DomainDecl =
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'fixed_count'; count: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'grid_2d'; width: number; height: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'voices'; maxVoices: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'mesh_vertices'; assetId: string } };
```

### 16.4 NormalizedGraph container

```ts
type NormalizedGraph = {
  domains: DomainDecl[];
  nodes: Node[];
  edges: Edge[];
};
```

* * *

17\. Type propagation and unification (compile-time only)
---------------------------------------------------------

The type system is enforced in two passes:

1.  **Propagation**: infer missing structure (AxisTag.default is common)
2.  **Unification + resolution**: ensure every connection agrees, then resolve defaults to fully-instantiated coordinates for codegen

### 17.1 Unification rule (v0)

Per axis, unify tags with the strict v0 rule:

*   default + default → default
*   default + instantiated(X) → instantiated(X)
*   instantiated(X) + instantiated(X) → instantiated(X)
*   instantiated(X) + instantiated(Y), X≠Y → error

This prevents accidental implicit merges and keeps errors local.

### 17.2 What must unify where

*   **Edge**: `from.type` must unify with `to.type` (or be coerced by an explicit block; there are no implicit coercions)
*   **Multi-input op**: inputs must unify for required axes; output type is derived from unified inputs and operator rule
*   **Combine point**: all incoming edges to a given input port must unify with that port’s type before combine mode applies

### 17.3 Default resolution (v0)

Resolution happens once per compilation unit, after unification:

*   Use `DEFAULTS_V0` and `FRAME_V0` to resolve all `AxisTag.default` into concrete axis values
*   Produce a fully-instantiated “resolved type” for every port/wire used in codegen

This is what enables runtime erasure: no tag checks in the hot loop.

* * *

18\. Scheduling model: continuous vs discrete (instrument semantics)
--------------------------------------------------------------------

Your system is a **looping instrument**: it runs continuously, and events modulate the loop rather than defining a timeline.

### 18.1 One tick model (v0)

Define a fixed “tick” corresponding to a render frame (or engine step). Every tick:

1.  Sample external inputs (UI, MIDI-like controls, etc.)
2.  Update time rails (`tMs`, `phaseA`, `phaseB`, `progress`)
3.  Execute continuous subgraph
4.  Apply discrete events occurring in this tick
5.  Produce render outputs

### 18.2 Continuous values

A value with `temporality = continuous` exists every tick.

*   Scalars (`one`) compute once per tick.
*   Fields (`many(domain)`) compute by looping lanes.

### 18.3 Discrete values (events)

A value with `temporality = discrete` exists as **a set of occurrences per tick**.

You need exactly one representation decision (v0 simplest):

*   **Event stream per tick** represented as a compact buffer:
    *   `EventBuffer` for `cardinality=one`
    *   `EventBuffer[]` of length `N(domain)` for `cardinality=many(domain)` (or one buffer with tagged lane ids)

The payload structure is unchanged from your spec (key/value pairs), only its typing becomes axis-driven.

### 18.4 Rule: discrete never implicitly “fills time”

Discrete outputs do not become continuous signals unless an explicit stateful operator performs that conversion (SampleAndHold, Accumulator, etc.). This keeps causality explicit and prevents hidden state.

* * *

19\. CompiledProgramIR: what the runtime actually executes
----------------------------------------------------------

The core performance requirement is: the runtime executes specialized loops and state updates with no axis bookkeeping. That implies an IR that is already lowered into:

*   loop nests (for domains)
*   scalar ops
*   event buffer ops
*   state slot reads/writes
*   render sink writes

### 19.1 Runtime storage model (erased semantics)

At runtime, values are stored in one of these shapes:

```ts
type ScalarSlot = { kind: 'scalar_slot'; id: number };              // e.g. float, vec2, color
type FieldSlot  = { kind: 'field_slot'; id: number; domain: DomainId }; // dense lane array
type EventSlot  = { kind: 'event_slot'; id: number };              // per-tick buffer(s)
type StateSlot  = { kind: 'state_slot'; id: number };              // persistent across ticks
```

No binding/perspective/branch exists here. Domain may appear only as a slot classification to pick the right loop bounds; it is not a runtime object.

### 19.2 Lowered ops (example shape)

You don’t need a complex VM; you need a small, predictable opcode set for CPU (and possibly a separate lowering for GPU later). v0 IR can be minimal:

```ts
type Op =
  | { kind: 'scalar_unary'; op: 'sin' | 'cos' | 'abs' | 'clamp'; in: ScalarSlot; out: ScalarSlot }
  | { kind: 'scalar_binary'; op: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max'; a: ScalarSlot; b: ScalarSlot; out: ScalarSlot }

  | { kind: 'field_unary'; op: 'sin' | 'cos' | 'abs' | 'clamp'; in: FieldSlot; out: FieldSlot }
  | { kind: 'field_binary'; op: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max'; a: FieldSlot; b: FieldSlot; out: FieldSlot }

  | { kind: 'broadcast_scalar_to_field'; scalar: ScalarSlot; out: FieldSlot }  // explicit
  | { kind: 'reduce_field_to_scalar'; op: 'min' | 'max' | 'sum' | 'avg'; field: FieldSlot; out: ScalarSlot } // explicit

  | { kind: 'state_read'; state: StateSlot; out: ScalarSlot | FieldSlot }
  | { kind: 'state_write'; in: ScalarSlot | FieldSlot; state: StateSlot }

  | { kind: 'event_read'; events: EventSlot; out: ScalarSlot | FieldSlot }     // only via explicit ops
  | { kind: 'event_write'; in: ScalarSlot | FieldSlot; events: EventSlot }

  | { kind: 'render_sink_write'; sinkId: string; in: ScalarSlot | FieldSlot };
```

This is enough to compile your current stateless operators plus the explicit state blocks and event conversions.

### 19.3 Loop lowering (domain specialization)

Field ops are emitted inside domain loops determined by the referenced DomainDecl:

*   FixedCount/Voices: single contiguous loop
*   Grid2D: contiguous loop with optional (x,y) helpers
*   MeshVertices: contiguous loop over vertex count

These loop bounds are compile-time constants or asset-resolved constants.

### 19.4 Stateful blocks: state indexing rule

State exists only for explicit state blocks.  
Allocation rule:

*   If a stateful block operates on `cardinality=one`, allocate one state cell.
*   If it operates on `cardinality=many(domain)`, allocate `N(domain)` state cells.

State slots are assigned at compile time; runtime uses direct array indexing.

This is the main place domain becomes “practical reality” in codegen.

* * *

20\. Default sources, buses, and rails in the 5-axis system
-----------------------------------------------------------

Your spec’s “default sources are created for every port regardless of writer; combine mode decides how they interact” remains, but it becomes type-driven and deterministic.

### 20.1 Default sources

A default source is a synthetic node with **0 inputs** and one output, created by normalization.

*   Its output type is exactly the port’s expected type.
*   It produces a constant (for continuous) or empty buffer (for discrete).
*   Combine mode on the consumer input decides how it interacts with explicit writers.

### 20.2 Buses / rails

Rails (`time`, `phaseA`, `phaseB`, `pulse`) are also synthetic sources, but they are _system-defined_ and globally available.

In v2.5 terms, a rail is just a named output port with a fully-instantiated type:

*   `phaseA`: `one + continuous + (binding default)`
*   `pulse`: `one + discrete + (binding default)`

No special runtime logic is required beyond a consistent place to write these values each tick.

### 20.3 “Field time” and per-lane time

v0 keeps time rails as `one` signals. If you want per-lane phase later, it is expressed by composing a `many(domain)` phasor inside the field loop; there is no separate concept of “field time.” This avoids conflating time and domain.

* * *

21\. Minimal UI model that matches the architecture (no concept leaks)
----------------------------------------------------------------------

This UI design is constrained by the architecture:

*   domains are compile-time resources
*   types are per-port
*   there is no “wire a domain” operation

### 21.1 Domain Rack (resource list)

A panel listing DomainDecl entries:

*   name, kind, parameters
*   computed elementCount
*   “used by” ports
*   compile errors (if any)

Domains are created/edited here. This is a resource editor, not a node graph feature.

### 21.2 Port-level domain targeting

If a port’s type is `many(domain)`:

*   the port label shows `many(<domainName>)`
*   clicking it opens a domain picker
*   the chosen DomainId is written into the port’s type (instantiated cardinality)

No wires involved.

### 21.3 Alignment errors surfaced locally

If a block requires aligned domains (e.g., field\_binary), and it receives `many(A)` and `many(B)` with `A≠B`, the UI highlights that input and shows the exact mismatch.

No implicit mapping in v0.

* * *

22\. Performance requirements enforced by architecture
------------------------------------------------------

These are not “optimizations”; they are constraints that keep the runtime within budget.

1.  **All axis unification and resolution is compile-time only.**
2.  **Runtime IR contains no axis tags and no referent ids.**
3.  **Domains compile into loop bounds + buffer shapes; no runtime domain objects.**
4.  **State is array-indexed by lane; no maps, no hashing, no dynamic allocation per tick.**
5.  **Event buffers are per-tick scratch allocations from pools or fixed arenas (implementation detail), not heap churn.**

* * *

23\. Migration plan (v2 → v2.5) with minimal disruption
-------------------------------------------------------

1.  Replace `World` with `(Cardinality, Temporality)` while preserving your existing meaning table.
2.  Introduce `Type` as 5-axis coordinate with AxisTags, but leave binding/perspective/branch as defaults everywhere.
3.  Re-express `field(domain)` as `cardinality=many(domain)` with DomainDecl resources.
4.  Update normalization to generate DomainDecl resources (if not already explicit) and keep default sources behavior unchanged.
5.  Update compilation/codegen to lower:
    *   scalar vs field loops
    *   discrete event buffers
    *   state slots per lane for state blocks only

At the end of this migration, you have the five-axis system structurally present, but operationally you are still running the same instrument semantics, with the same simplicity in the common case.

This is the continuation of the spec.

## Prompt:
Can I name the 5-axis coordinate "World" instead of "Type"?

## Response:
Yes, you can, and it can be clean **if you keep two naming invariants** so engineers don’t start conflating things again.

### The clean naming scheme

*   **`ValueType`**: the payload kind (`float | vec2 | color | ...`)
*   **`World`**: the 5-axis coordinate (cardinality/temporality/binding/perspective/branch)
*   **`Type`**: `ValueType + World` (the full port/wire type)

That preserves the useful intuition of “world” as “where/when/about-what this value exists,” without overloading it to also mean payload.

Concretely:

```ts
type World = {
  cardinality: AxisTag<Cardinality>;
  temporality: AxisTag<Temporality>;
  binding: AxisTag<Binding>;
  perspective: AxisTag<PerspectiveId>;
  branch: AxisTag<BranchId>;
};

type Type = {
  value: ValueType;
  world: World;
};
```

### Why not rename `Type` to `World` directly

If you make `World` include `value: ValueType`, people will start saying “the world is float,” which collapses the ontology again. Keeping `World` axis-only forces the correct separation:

*   payload answers “what is it made of?”
*   world answers “how/when/about what does it exist?”

### How this maps to your current spec

Your current `World = static|signal|field|event` was already “mostly world, not payload,” but it conflated two axes and baked domain into one case.  
The new `World` just generalizes it into an explicit coordinate.

So yes: name the 5-axis coordinate `World`, keep `Type = { value, world }`, and the terminology stays intuitive without sacrificing precision.

## Prompt:
If we had to pick completely new terms from scratch and wanted it to be maximally accurate and intuitive, what would we choose to replace "ValueType", World, And Type?

2/2

## Response:
Here’s the cleanest naming set I know that stays mechanically accurate and tends to read intuitively in code reviews.

### 1) Replace `ValueType` → **`PayloadType`**

What it is: the in-memory/value-level shape (float, vec2, color, bool, …).

Why this name works:

*   “value type” is overloaded in most systems
*   “payload” is unambiguous: it’s the thing carried by the wire

```ts
type PayloadType = 'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit';
```

* * *

### 2) Replace `World` (5-axis coordinate) → **`Extent`**

What it is: the _extent_ of a value across the relevant axes: how many lanes, what time form, what it’s anchored to, etc.

Why this name works:

*   It doesn’t imply “scene/world simulation”
*   It matches what the axes really are: _where the value exists in the system_
*   “extent” is short, non-metaphorical, and maps to math/CS usage (“domain/codomain/extent”)

```ts
type Extent = {
  cardinality: AxisTag<Cardinality>;
  temporality: AxisTag<Temporality>;
  binding: AxisTag<Binding>;
  perspective: AxisTag<PerspectiveId>;
  branch: AxisTag<BranchId>;
};
```

If you want a more explicit variant, the runner-up is **`Scope`**, but that word can drift toward authorization/visibility semantics; `Extent` stays closer to “indexing support.”

* * *

### 3) Replace `Type` → **`SignalType`** (or **`ValueSpec`**)

This is the pair: payload + extent.

If your whole system is a reactive signal/field/event graph, then calling the composite thing `SignalType` reads naturally everywhere:

```ts
type SignalType = {
  payload: PayloadType;
  extent: Extent;
};
```

If you want something more neutral (not implying “signal” for discrete events), use **`ValueSpec`**:

```ts
type ValueSpec = {
  payload: PayloadType;
  extent: Extent;
};
```

* * *

Recommended final set
---------------------

*   `PayloadType` (was ValueType)
*   `Extent` (was World)
*   `SignalType` (or `ValueSpec`) (was Type)

This keeps the separations crisp:

*   **PayloadType**: what the value _is_
*   **Extent**: where/when/about-what it _exists_
*   **SignalType / ValueSpec**: the complete contract for a port/wire

That is the maximally accurate, least overloaded terminology.

## Prompt:
And so Field would become a specialization of SignalType, where it's Extent is cardinality -> many, and continuous?

## Response:
Yes—if you define **Field** as a _named alias_ (or refinement) of `SignalType` with an extent constraint.

Precisely, with the “PayloadType / Extent / SignalType” naming:

### Canonical definition

A **Field** is:

*   `extent.cardinality = many(domain)`
*   `extent.temporality = continuous`

Everything else (binding/perspective/branch) can stay `default` or be instantiated, but those two constraints are what make it a field.

### In TypeScript terms

```ts
type FieldExtent = {
  cardinality: { kind: 'instantiated'; value: { kind: 'many'; domain: DomainRef } };
  temporality: { kind: 'instantiated'; value: { kind: 'continuous' } };
  binding: AxisTag<Binding>;
  perspective: AxisTag<PerspectiveId>;
  branch: AxisTag<BranchId>;
};

type FieldType = {
  payload: PayloadType;
  extent: FieldExtent;
};
```

Or if you want it as a predicate/refinement rather than a separate type:

```ts
function isField(t: SignalType): boolean {
  return (
    t.extent.cardinality.kind === 'instantiated' &&
    t.extent.cardinality.value.kind === 'many' &&
    t.extent.temporality.kind === 'instantiated' &&
    t.extent.temporality.value.kind === 'continuous'
  );
}
```

### Important nuance

“Continuous” is the key part. A `many(domain)` value with `temporality = discrete` is not a field; it’s a **per-lane event stream** (an “event field” in informal speech, but formally it’s just `many + discrete`).

So you get the clean, non-conflated taxonomy:

*   **Signal**: `one + continuous`
*   **Field**: `many(domain) + continuous`
*   **Event**: `one + discrete`
*   **Per-lane Event**: `many(domain) + discrete`

That’s the exact same 2D grid you started from, expressed as constraints on `Extent`.



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)