# Generative animation UX design

**User:** Brandroid Frizzle (brandroid@vast.wang)  
**Created:** 12/14/2025 1:58:34 PM  
**Updated:** 1/7/2026 8:47:52 PM  
**Exported:** 1/8/2026 1:10:15 AM  
**Link:** [https://chatgpt.com/c/693f24f8-52f8-8328-a8e4-deeef6fca047](https://chatgpt.com/c/693f24f8-52f8-8328-a8e4-deeef6fca047)  

## Response:
Below is a concrete, “compiler-first” skeleton that gives you:

*   A single canonical type representation (`Type`) used by **editor + compiler + IR**.
*   A constraint system that supports **generics over (World, Domain)** with **typeclasses** (Numeric, Combineable, etc.).
*   A unification + constraint solver that produces **fully-monomorphized** block instances (no runtime polymorphism).
*   A lowering surface that turns “generic blocks” into concrete IR ops (`SignalMap`, `FieldZipWith`, etc.).

Everything here is TypeScript, but it’s written so the **authoritative truth lives in the IR**, not the TS type checker.

* * *

1) Canonical Types
------------------

### `types.ts`

```ts
// types.ts

export type World = "signal" | "field" | "event" | "config";

/**
 * Domain = value-level shape.
 * Keep this small and stable. Everything else compiles down to these.
 */
export type Domain =
  | "float"
  | "bool"
  | "vec2"
  | "vec3"
  | "color"
  | "trigger"     // for event payloads, if any
  | "domain2d"    // domain handles / iterators
  | "path2d"
  | "unknown";    // only for internal errors, never emitted in final IR

/**
 * Type is the single canonical type representation.
 * All "bundle arity" questions belong here, not in ad-hoc logic.
 */
export interface Type {
  readonly world: World;
  readonly domain: Domain;

  /**
   * Only valid when world === "field".
   * DomainRef is "how many elements / iteration domain".
   * Could be explicit slot-handle types later; keep opaque for now.
   */
  readonly fieldDomain?: FieldDomainRef;

  /**
   * A few flags that are genuinely useful in compilation decisions.
   * Keep minimal. Prefer constraints/typeclasses for semantics.
   */
  readonly flags?: {
    readonly busEligible?: boolean;
  };
}

export type FieldDomainRef =
  | { kind: "bySlot"; slot: number }       // domain handle lives in a slot
  | { kind: "fixedCount"; n: number }      // rare (tests)
  | { kind: "unknown" };                   // compile-time placeholder (must be resolved)

export function t(world: World, domain: Domain, fieldDomain?: FieldDomainRef): Type {
  if (world === "field" && !fieldDomain) {
    // compiler may temporarily construct unknown fieldDomain; make it explicit
    return { world, domain, fieldDomain: { kind: "unknown" } };
  }
  if (world !== "field" && fieldDomain) {
    throw new Error(`Type: fieldDomain only allowed for world=field`);
  }
  return { world, domain, fieldDomain };
}

export function isFieldType(ty: Type): boolean {
  return ty.world === "field";
}

export function eqType(a: Type, b: Type): boolean {
  return a.world === b.world && a.domain === b.domain;
}
```

* * *

2) Type Variables + Constraints
-------------------------------

### `constraints.ts`

This is the “real” system: typevars, typeclasses, and constraints.

```ts
// constraints.ts

import type { Type, World, Domain } from "./types";

export type TypeVarId = number;

export interface TypeVar {
  readonly id: TypeVarId;
  readonly name?: string;
}

export type Ty =
  | { kind: "concrete"; ty: Type }
  | { kind: "var"; v: TypeVar };

/** Constraints are solved to fully concrete Types by finalize(). */
export type Constraint =
  | { kind: "Eq"; a: Ty; b: Ty }
  | { kind: "HasWorld"; a: Ty; world: World }
  | { kind: "HasDomain"; a: Ty; domain: Domain }
  | { kind: "InDomains"; a: Ty; domains: readonly Domain[] }
  | { kind: "InWorlds"; a: Ty; worlds: readonly World[] }
  | { kind: "Typeclass"; a: Ty; cls: TypeclassName }
  | { kind: "SameWorld"; a: Ty; b: Ty }
  | { kind: "SameDomain"; a: Ty; b: Ty }
  | { kind: "Promote"; out: Ty; a: Ty; b: Ty; rule: PromoteRule };

/** Typeclasses are where your “category/algebra” semantics live. */
export type TypeclassName =
  | "Numeric"         // add/mul etc.
  | "Comparable"      // min/max
  | "Mixable"         // mix/lerp
  | "Combineable"     // multi-writer combine op exists
  | "Mappable"        // map exists for this (world, domain)
  | "ZipWithable";    // zipWith exists for this (world, domain)

export type PromoteRule =
  | "SignalField"     // signal + field => field (broadcast)
  | "SameWorld"       // signal+signal or field+field stays same
  | "EventNone";      // events don't promote with signal/field

export interface TypeError {
  readonly message: string;
  readonly detail?: Record<string, unknown>;
  readonly blame?: {
    readonly nodeId?: string;
    readonly port?: string;
    readonly edgeId?: string;
  };
}
```

* * *

3) Solver (Unification + Constraint Checking + Promotion)
---------------------------------------------------------

### `solver.ts`

This is a working skeleton: it can unify types, enforce typeclasses, and apply promotion rules to pick concrete worlds/domains.

```ts
// solver.ts

import type { Type, World, Domain } from "./types";
import { eqType, t } from "./types";
import type { Ty, TypeVar, TypeVarId, Constraint, TypeError, TypeclassName, PromoteRule } from "./constraints";

type Subst = Map<TypeVarId, Type>; // typevar -> concrete type

export interface SolveResult {
  readonly subst: Subst;
  readonly errors: TypeError[];
}

export class TypeContext {
  private nextVarId: number = 1;
  public freshVar(name?: string): TypeVar {
    return { id: this.nextVarId++, name };
  }
}

function isVar(x: Ty): x is { kind: "var"; v: TypeVar } {
  return x.kind === "var";
}
function isCon(x: Ty): x is { kind: "concrete"; ty: Type } {
  return x.kind === "concrete";
}

function apply(subst: Subst, x: Ty): Ty {
  if (x.kind === "var") {
    const ty = subst.get(x.v.id);
    if (ty) return { kind: "concrete", ty };
  }
  return x;
}

function bind(subst: Subst, v: TypeVar, ty: Type, errors: TypeError[]): void {
  const existing = subst.get(v.id);
  if (!existing) {
    subst.set(v.id, ty);
    return;
  }
  if (!eqType(existing, ty)) {
    errors.push({
      message: `Type mismatch: ${fmtType(existing)} vs ${fmtType(ty)}`,
      detail: { varId: v.id },
    });
  }
}

function unifyTy(subst: Subst, a: Ty, b: Ty, errors: TypeError[]): void {
  const aa = apply(subst, a);
  const bb = apply(subst, b);

  if (isCon(aa) && isCon(bb)) {
    if (!eqType(aa.ty, bb.ty)) {
      errors.push({
        message: `Cannot unify ${fmtType(aa.ty)} with ${fmtType(bb.ty)}`,
      });
    }
    return;
  }

  if (isVar(aa) && isCon(bb)) {
    bind(subst, aa.v, bb.ty, errors);
    return;
  }
  if (isCon(aa) && isVar(bb)) {
    bind(subst, bb.v, aa.ty, errors);
    return;
  }
  if (isVar(aa) && isVar(bb)) {
    // nothing yet; could union-find, but simplest is: do nothing unless later bound
    return;
  }
}

function checkTypeclass(cls: TypeclassName, ty: Type): boolean {
  // These are the only places you should encode domain sets.
  switch (cls) {
    case "Numeric":
      return ty.domain === "float" || ty.domain === "vec2" || ty.domain === "vec3";
    case "Comparable":
      return ty.domain === "float";
    case "Mixable":
      return ty.domain === "float" || ty.domain === "vec2" || ty.domain === "vec3" || ty.domain === "color";
    case "Combineable":
      // combine semantics exist per (world, domain) pair; refine as needed
      return ty.world === "signal" || ty.world === "field" || ty.world === "event";
    case "Mappable":
      return ty.world === "signal" || ty.world === "field";
    case "ZipWithable":
      return ty.world === "signal" || ty.world === "field";
  }
}

function enforceConstraint(subst: Subst, c: Constraint, errors: TypeError[]): void {
  switch (c.kind) {
    case "Eq": {
      unifyTy(subst, c.a, c.b, errors);
      return;
    }

    case "SameWorld": {
      const a = apply(subst, c.a);
      const b = apply(subst, c.b);
      if (isCon(a) && isCon(b) && a.ty.world !== b.ty.world) {
        errors.push({ message: `World mismatch: ${a.ty.world} vs ${b.ty.world}` });
      }
      return;
    }

    case "SameDomain": {
      const a = apply(subst, c.a);
      const b = apply(subst, c.b);
      if (isCon(a) && isCon(b) && a.ty.domain !== b.ty.domain) {
        errors.push({ message: `Domain mismatch: ${a.ty.domain} vs ${b.ty.domain}` });
      }
      return;
    }

    case "HasWorld": {
      const a = apply(subst, c.a);
      if (isCon(a)) {
        if (a.ty.world !== c.world) errors.push({ message: `Expected world ${c.world}, got ${a.ty.world}` });
        return;
      }
      // not bound yet; do nothing
      return;
    }

    case "HasDomain": {
      const a = apply(subst, c.a);
      if (isCon(a)) {
        if (a.ty.domain !== c.domain) errors.push({ message: `Expected domain ${c.domain}, got ${a.ty.domain}` });
        return;
      }
      return;
    }

    case "InDomains": {
      const a = apply(subst, c.a);
      if (isCon(a) && !c.domains.includes(a.ty.domain)) {
        errors.push({ message: `Expected domain in [${c.domains.join(",")}], got ${a.ty.domain}` });
      }
      return;
    }

    case "InWorlds": {
      const a = apply(subst, c.a);
      if (isCon(a) && !c.worlds.includes(a.ty.world)) {
        errors.push({ message: `Expected world in [${c.worlds.join(",")}], got ${a.ty.world}` });
      }
      return;
    }

    case "Typeclass": {
      const a = apply(subst, c.a);
      if (isCon(a) && !checkTypeclass(c.cls, a.ty)) {
        errors.push({ message: `Type ${fmtType(a.ty)} does not satisfy ${c.cls}` });
      }
      return;
    }

    case "Promote": {
      // Promotion chooses output world based on a,b, then enforces out = chosen.
      const aa = apply(subst, c.a);
      const bb = apply(subst, c.b);
      if (!isCon(aa) || !isCon(bb)) return;

      const outTy = promote(aa.ty, bb.ty, c.rule, errors);
      if (outTy) unifyTy(subst, c.out, { kind: "concrete", ty: outTy }, errors);
      return;
    }
  }
}

function promote(a: Type, b: Type, rule: PromoteRule, errors: TypeError[]): Type | null {
  // Canonical rules: static, global, deterministic.
  if (a.world === "event" || b.world === "event") {
    if (rule === "EventNone") return null;
    errors.push({ message: `Cannot promote event with non-event` });
    return null;
  }

  if (rule === "SameWorld") {
    if (a.world !== b.world) {
      errors.push({ message: `Expected same world, got ${a.world} and ${b.world}` });
      return null;
    }
    if (a.domain !== b.domain) {
      errors.push({ message: `Expected same domain, got ${a.domain} and ${b.domain}` });
      return null;
    }
    return a;
  }

  if (rule === "SignalField") {
    // domain must match, world becomes field if either is field
    if (a.domain !== b.domain) {
      errors.push({ message: `Cannot promote differing domains: ${a.domain} vs ${b.domain}` });
      return null;
    }
    const outWorld: World = (a.world === "field" || b.world === "field") ? "field" : "signal";
    return t(outWorld, a.domain);
  }

  errors.push({ message: `Unknown promotion rule` });
  return null;
}

export function solve(constraints: readonly Constraint[]): SolveResult {
  const subst: Subst = new Map();
  const errors: TypeError[] = [];

  // Iterate a few times so binds can unlock later checks.
  // Keep this simple and deterministic.
  for (let iter = 0; iter < 8; iter++) {
    const before = subst.size;
    for (const c of constraints) enforceConstraint(subst, c, errors);
    if (subst.size === before) break;
  }

  // Final pass to report constraints that remain unsatisfied due to unbound vars.
  // You can enforce “no unbound vars” at finalize() boundary.
  return { subst, errors };
}

export function finalizeType(subst: Subst, x: Ty): Type | null {
  const xx = apply(subst, x);
  if (xx.kind === "concrete") return xx.ty;
  return null;
}

function fmtType(ty: Type): string {
  return `${ty.world}<${ty.domain}>`;
}
```

* * *

4) Generic Block Spec + Constraint Emission
-------------------------------------------

### `blockSig.ts`

This is how you define “polymorphic blocks” without runtime polymorphism: each block emits constraints, then gets monomorphized.

```ts
// blockSig.ts

import type { Type } from "./types";
import type { TypeContext } from "./solver";
import type { Ty, Constraint } from "./constraints";

export type PortName = string;

export interface BlockTypeEnv {
  readonly tc: TypeContext;
  /** nodeId for blame; optional but useful */
  readonly nodeId?: string;
}

export interface BlockSig {
  readonly name: string;

  /** Ports are typed by Ty (var or concrete) plus constraints. */
  buildTypes(env: BlockTypeEnv): {
    readonly inputs: Record<PortName, Ty>;
    readonly outputs: Record<PortName, Ty>;
    readonly constraints: readonly Constraint[];
  };
}

/**
 * A concrete, post-solve instantiation of a BlockSig for lowering.
 * Every port is now a concrete Type, no vars.
 */
export interface BlockInstanceTypes {
  readonly inputs: Record<PortName, Type>;
  readonly outputs: Record<PortName, Type>;
}
```

* * *

5) Example: One “Add” Block (Generic over World + Domain)
---------------------------------------------------------

### `blocks/add.ts`

This single block replaces `add_signal`, `add_field`, `add_scalar`, etc.

```ts
// blocks/add.ts

import type { BlockSig } from "../blockSig";
import type { Ty, Constraint } from "../constraints";

export const AddBlock: BlockSig = {
  name: "Add",

  buildTypes(env) {
    const A = env.tc.freshVar("A"); // input a
    const B = env.tc.freshVar("B"); // input b
    const O = env.tc.freshVar("O"); // output

    const a: Ty = { kind: "var", v: A };
    const b: Ty = { kind: "var", v: B };
    const out: Ty = { kind: "var", v: O };

    const constraints: Constraint[] = [
      // Add is defined for numeric-ish domains
      { kind: "Typeclass", a: a, cls: "Numeric" },
      { kind: "Typeclass", a: b, cls: "Numeric" },

      // Domain must match between a and b
      { kind: "SameDomain", a, b },

      // Promote: signal+field -> field; otherwise same world.
      { kind: "Promote", out, a, b, rule: "SignalField" },

      // Output domain matches inputs.
      { kind: "SameDomain", a: out, b: a },

      // Output must be mappable/zipWithable (for lowering correctness)
      { kind: "Typeclass", a: out, cls: "ZipWithable" },
    ];

    return {
      inputs: { a, b },
      outputs: { out },
      constraints,
    };
  },
};
```

* * *

6) Turning a Typed Block into Concrete IR Ops
---------------------------------------------

This is where the “functor/zipWith” model becomes real: lowering is selected by _concrete_ `(world, domain)`.

### `lowering/addLowering.ts`

```ts
// lowering/addLowering.ts

import type { Type } from "../types";
import type { ValueSlot } from "../irSlots"; // your slot type
import type { IRBuilder } from "../irBuilder";

export type LoweredValueRef =
  | { kind: "slot"; slot: ValueSlot; ty: Type };

export function lowerAdd(
  b: IRBuilder,
  inA: LoweredValueRef,
  inB: LoweredValueRef,
  outTy: Type
): LoweredValueRef {
  // Invariants: outTy is concrete; type solver already enforced promotion and domain match.
  // Choose lowering based on world.
  if (outTy.world === "signal") {
    // signal + signal => signalZipWith(add)
    const outSlot = b.allocSlot(outTy);
    b.emit({
      kind: "SignalZipWith",
      op: "add",
      aSlot: inA.slot,
      bSlot: inB.slot,
      outSlot,
      domain: outTy.domain,
    });
    return { kind: "slot", slot: outSlot, ty: outTy };
  }

  if (outTy.world === "field") {
    // field+field => FieldZipWith(add)
    // signal+field => Broadcast + FieldZipWith (or a specialized FieldZipWith that accepts a signal)
    const outSlot = b.allocSlot(outTy);
    b.emit({
      kind: "FieldZipWith",
      op: "add",
      aSlot: inA.slot,
      bSlot: inB.slot,
      outSlot,
      domain: outTy.domain,
      // fieldDomain resolved elsewhere (domain handle)
    });
    return { kind: "slot", slot: outSlot, ty: outTy };
  }

  throw new Error(`Add lowering: unsupported world ${outTy.world}`);
}
```

* * *

7) The “One True” Pipeline: infer → solve → finalize → lower
------------------------------------------------------------

### `compileBlockInstance.ts`

```ts
// compileBlockInstance.ts

import type { BlockSig, BlockInstanceTypes } from "./blockSig";
import type { Ty, Constraint, TypeError } from "./constraints";
import { solve, finalizeType, TypeContext } from "./solver";
import type { Type } from "./types";

export interface PortBinding {
  readonly port: string;
  readonly inferredTy?: Type; // from upstream edge, if already known
}

export interface InferResult {
  readonly instanceTypes: BlockInstanceTypes | null;
  readonly errors: TypeError[];
  readonly rawConstraints: readonly Constraint[];
}

export function inferBlockInstance(
  sig: BlockSig,
  bindings: readonly PortBinding[]
): InferResult {
  const tc = new TypeContext();
  const { inputs, outputs, constraints } = sig.buildTypes({ tc });

  // Add constraints from already-known input types (from edges).
  const extra: Constraint[] = [];
  for (const b of bindings) {
    const portTy: Ty | undefined = inputs[b.port];
    if (!portTy) continue;
    if (b.inferredTy) {
      extra.push({ kind: "Eq", a: portTy, b: { kind: "concrete", ty: b.inferredTy } });
    }
  }

  const all = [...constraints, ...extra];
  const res = solve(all);

  if (res.errors.length) {
    return { instanceTypes: null, errors: res.errors, rawConstraints: all };
  }

  // Finalize: every port must become concrete; otherwise compilation fails.
  const inConcrete: Record<string, Type> = {};
  const outConcrete: Record<string, Type> = {};

  for (const [k, v] of Object.entries(inputs)) {
    const ty = finalizeType(res.subst, v);
    if (!ty) {
      return {
        instanceTypes: null,
        errors: [{ message: `Unresolved input type for port ${k}` }],
        rawConstraints: all,
      };
    }
    inConcrete[k] = ty;
  }
  for (const [k, v] of Object.entries(outputs)) {
    const ty = finalizeType(res.subst, v);
    if (!ty) {
      return {
        instanceTypes: null,
        errors: [{ message: `Unresolved output type for port ${k}` }],
        rawConstraints: all,
      };
    }
    outConcrete[k] = ty;
  }

  return {
    instanceTypes: { inputs: inConcrete, outputs: outConcrete },
    errors: [],
    rawConstraints: all,
  };
}
```

* * *

8) The missing but required piece: “Promotion and container lifting” ops
------------------------------------------------------------------------

If you support `signal + field -> field`, you need explicit IR nodes for:

*   `BroadcastSignalToField(domainHandle, signalSlot) -> fieldSlot`
*   Or a `FieldZipWith` variant that allows `(signal, field)` inputs with a broadcast rule.

Do not make this implicit in runtime logic. Make it IR so:

*   scheduling is explicit
*   caching keys are obvious
*   debugging can show “broadcast happened here”

* * *

9) What you should enforce as “complete” for generics
-----------------------------------------------------

Add an explicit check that compilation is invalid unless:

*   every `TyVar` that appears in any port is resolved
*   no remaining “unknown domain” for `fieldDomain` if the block requires it
*   every multi-writer combine op maps to a concrete associative implementation

That’s what keeps this from turning into a “flexible system where engineers do stupid things.”

* * *

10) Minimal IRBuilder + op shapes (just enough to plug in)
----------------------------------------------------------

### `irBuilder.ts`

```ts
// irBuilder.ts

import type { Type } from "./types";

export type ValueSlot = number;

export type IROp =
  | { kind: "SignalZipWith"; op: "add" | "mul" | "min" | "max"; aSlot: ValueSlot; bSlot: ValueSlot; outSlot: ValueSlot; domain: string }
  | { kind: "FieldZipWith"; op: "add" | "mul" | "min" | "max"; aSlot: ValueSlot; bSlot: ValueSlot; outSlot: ValueSlot; domain: string };

export class IRBuilder {
  private nextSlot: number = 0;
  public ops: IROp[] = [];
  public slotTypes: Type[] = [];

  allocSlot(ty: Type): ValueSlot {
    const s = this.nextSlot++;
    this.slotTypes[s] = ty;
    return s;
  }

  emit(op: IROp): void {
    this.ops.push(op);
  }
}
```

* * *

What this gives you immediately
-------------------------------

*   You can define **one** `Add` block.
*   It works for `signal<float>`, `field<float>`, `signal<vec2>`, `field<vec2>`, etc.
*   Mixed `signal + field` becomes `field` deterministically via the promotion constraint.
*   Every block instance compiles to **concrete IR ops** with no runtime generic branching.

That is the skeleton.

## Prompt:
Why the fuck is busEligible a field still?  why?

## Response:
It shouldn’t be there at all, and the fact that it survived into that sketch is exactly the kind of architectural rot you are trying to eliminate.

Here is the real reason it showed up: it is a leftover from a world where “buses” were a separate kind of thing, so some values had to be marked as “allowed to go on a bus.” That entire distinction is gone in your current architecture because multi-writer + combine semantics makes every port a bus, so eligibility is no longer a property of a value or a type, it is a property of the _connection_ (edge) and its combine mode.

So having `busEligible` on `Type` is wrong in three different ways.

First, it encodes topology in the type system, which is a category error. Types describe what a value is, not how many writers it has or where it flows.

Second, it re-introduces a hidden fork in the compiler: suddenly some values are “allowed” to be multi-written and some are not, which is exactly the thing you just unified away.

Third, it breaks the idea that generics and promotion are purely algebraic over `(world, domain)`. A type flag that changes routing semantics is poison to unification.

In your architecture:

*   Whether something has one writer or many writers is an **edge-level** concern.
*   How those writers are combined is an **edge role + combine mode** concern.
*   What flows through the edge is still just a `Type`.

So the correct model is:

```
Type = (world, domain, fieldDomain?)
Edge = (from, to, role { kind, metadata })
```

Where one of the edge roles is something like:

```
role.kind = "combine"
role.metadata = { mode: "add" | "mul" | "last" | "max" | ... }
```

The compiler sees this and emits either:

*   a ZipWith
*   a reduce
*   a last-writer-wins
*   or a stateful accumulator

depending on the role.

There is no place anywhere in that flow where a `Type` needs to say “I can be on a bus.”

So the right fix is brutally simple:

Delete `busEligible` entirely.  
Never reintroduce it in any form.  
If something needs special handling for multi-writer, it is encoded on the edge via its role, not on the value via its type.

That keeps the algebra clean, keeps unification sound, and keeps your “everything is a block, everything is a wire” architecture intact.

## Response:
Thought for 9s

`fieldDomain` exists because somebody tried to describe two different things with one “domain” slot:

*   **the container kind** (`world`: signal vs field), and
*   **the value carried per element** (e.g. float, vec2, color)

A `Field<T>` has _two_ axes of “shape” that a `Signal<T>` does not:

1.  **element type** (`T`: float/vec2/color/…)
2.  **indexing domain** (“how many elements, and how are they indexed”: instances/domain-id)

So `fieldDomain` is a hacky way to smuggle in “this is a field and its elements are X” while keeping a shared `domain` field for everything.

If you want **zero optional properties**, you have two clean options. Only one is “right” long term.

Correct long-term: discriminated union (TS) / enum (Rust)
---------------------------------------------------------

No optional fields, no sentinel values, and it ports cleanly to Rust/WASM.

```ts
type ScalarDomain = "f64" | "i32" | "bool";
type VectorDomain = "vec2" | "vec3";
type ColorDomain  = "color";            // whatever you chose (e.g. rgb f32 lanes)
type ValueDomain = ScalarDomain | VectorDomain | ColorDomain;

type IndexDomain =
  | { kind: "instances" }               // “N instances” (N comes from a DomainExpr)
  | { kind: "pixels2d" }                // if you ever do shader-like grids
  | { kind: "custom"; id: string };     // future-proof

export type TypeDesc =
  | { world: "signal"; value: ValueDomain }
  | { world: "event";  event: "trigger" | "note" | "midi" }  // whatever you define
  | { world: "field";  index: IndexDomain; value: ValueDomain }
  | { world: "config"; config: "string" | "json" | "uiColor" | "pathStyle" };
```

Key points:

*   A **field** always has `index` and `value`.
*   A **signal** always has `value`.
*   Nothing is optional.
*   “Fieldness” is not a flag; it’s a variant.

This is what you want if you’re serious about correctness + Rust.

Acceptable but second-best: single struct with sentinels
--------------------------------------------------------

If you refuse unions, you can make every field present by forcing meaningless values:

```ts
type World = "signal" | "field" | "event" | "config";

type TypeDesc = {
  world: World;
  value: ValueDomain;          // always present
  index: IndexDomain | "none"; // present but “none” for non-field
  event: "none" | "trigger";   // present but “none” for non-event
  config: "none" | "json";     // present but “none” for non-config
};
```

This satisfies “no optional properties” but it’s mechanically worse: you’ve reintroduced invalid states (`world:"signal", index:"instances"` etc.) and now you need validation everywhere.

So why is `fieldDomain` a thing?
--------------------------------

Because it was trying to avoid making `TypeDesc` an enum/union, and the moment you avoid that, you end up with either:

*   optional fields, or
*   sentinels, or
*   leaky hacks like `fieldDomain`.

The “do it right” answer is: **delete `fieldDomain`, and make `TypeDesc` a discriminated union where `field` carries `index` + `value`.**

## Response:
`constraints.ts` updates required by the canonical `TypeDesc` union
-------------------------------------------------------------------

### 1) Type variables now range over **full `TypeDesc`**, not “world/domain + optional extras”

```ts
// Canonical TypeDesc (already agreed)
export type TypeDesc =
  | { world: "signal"; value: ValueDomain }
  | { world: "field";  index: IndexDomain; value: ValueDomain }
  | { world: "event";  event: EventDomain }
  | { world: "config"; config: ConfigDomain };
```

So every `TypeVar` is a unification variable whose solution is a `TypeDesc` (or another `TypeVar`).

* * *

### 2) Introduce **row projections** as first-class constraints (no optional properties)

You cannot safely ask “does this TypeDesc have `index`?” anymore; instead you constrain `world` and then constrain the fields implied by that world.

#### New constraint primitives

```ts
export type Constraint =
  | { kind: "Eq"; a: TypeTerm; b: TypeTerm }                        // full TypeDesc equality
  | { kind: "WorldIs"; t: TypeTerm; world: TypeDesc["world"] }      // discriminant
  | { kind: "ValueIs"; t: TypeTerm; value: ValueDomain }            // for signal/field
  | { kind: "IndexIs"; t: TypeTerm; index: IndexDomain }            // only meaningful if world=field
  | { kind: "EventIs"; t: TypeTerm; event: EventDomain }            // only meaningful if world=event
  | { kind: "ConfigIs"; t: TypeTerm; config: ConfigDomain }         // only meaningful if world=config
  | { kind: "SameValueDomain"; a: TypeTerm; b: TypeTerm }           // ties value domains across terms
  | { kind: "NumericValue"; t: TypeTerm }                           // value ∈ {f64, i32, ...} (your set)
  | { kind: "SupportsOp"; op: OpClass; args: TypeTerm[]; out: TypeTerm };
```

`TypeTerm` is either a concrete `TypeDesc` or a type variable reference.

```ts
export type TypeTerm =
  | { kind: "Var"; id: TypeVarId }
  | { kind: "Const"; type: TypeDesc };
```

* * *

### 3) Unification changes: unify **variants**, not optional fields

#### Core unify rule (full `TypeDesc`)

```ts
function unifyTypeDesc(a: TypeDesc, b: TypeDesc): void {
  if (a.world !== b.world) fail(`world mismatch: ${a.world} vs ${b.world}`);

  switch (a.world) {
    case "signal":
      if (b.world !== "signal") fail("unreachable");
      if (a.value !== b.value) fail("value mismatch");
      return;

    case "field":
      if (b.world !== "field") fail("unreachable");
      if (!eqIndex(a.index, b.index)) fail("index mismatch");
      if (a.value !== b.value) fail("value mismatch");
      return;

    case "event":
      if (b.world !== "event") fail("unreachable");
      if (a.event !== b.event) fail("event mismatch");
      return;

    case "config":
      if (b.world !== "config") fail("unreachable");
      if (a.config !== b.config) fail("config mismatch");
      return;
  }
}
```

No presence/absence checks exist anymore, because the variant implies the fields.

* * *

### 4) Constraint solving: add a **world-driven refinement** step

`WorldIs(t, "field")` immediately refines `t` to a field-shaped type term (or fails if already fixed to another world). Same for `"signal"`, `"event"`, `"config"`.

Example rewrite rules (conceptual):

*   If `t` is a var with no assignment, and you see `WorldIs(t,"field")`, assign it to a _partially known_ field term:
    *   `t := { world:"field", index: α, value: β }` where `α,β` are fresh internal variables (see next item).
*   If `t` is already assigned to `{world:"signal", ...}`, it fails immediately.

* * *

### 5) Internal “sub-variables” (index/value/event/config) are explicit, not optional

To keep constraints ergonomic, introduce _component variables_ as real entities, not optional fields:

```ts
export type ValueVarId = number;
export type IndexVarId = number;
export type EventVarId = number;
export type ConfigVarId = number;

export type TypeVarBinding =
  | { kind: "Unbound" }
  | { kind: "Bound"; type: TypeDesc }
  | { kind: "Linked"; to: TypeVarId }
  | { kind: "ShapeField"; index: IndexVarId; value: ValueVarId }
  | { kind: "ShapeSignal"; value: ValueVarId }
  | { kind: "ShapeEvent"; event: EventVarId }
  | { kind: "ShapeConfig"; config: ConfigVarId };
```

Then `ValueIs(t, X)` becomes:

*   if `t` is `ShapeSignal(value=v)` or `ShapeField(value=v)`: constrain `v == X`
*   if `t` is bound const: check the corresponding field
*   otherwise force a `WorldIs` first (and fail if ambiguous)

This prevents “read optional fields” bugs entirely.

* * *

### 6) Typeclasses/Op constraints now quantify over **world + value domain** correctly

Instead of “Add works on number” with scattered checks, you encode:

```ts
export type OpClass =
  | "Add" | "Mul" | "Sin" | "Mix" | "Lerp" | "Clamp"
  | "Vec2Add" | "Vec2Scale"
  | "ColorCompose" | "ColorToRGBA"
  // etc
;

export type SupportsOpConstraint = {
  kind: "SupportsOp";
  op: OpClass;
  args: TypeTerm[];
  out: TypeTerm;
};
```

And your rule table is stated in terms of `WorldIs` + `SameValueDomain`:

Example: `Add` supports `(signal<f64>, signal<f64>) -> signal<f64>` and `(field<instances,f64>, field<instances,f64>) -> field<instances,f64>` and broadcast combos only if you explicitly allow them.

So the implementation emits constraints like:

*   `WorldIs(a, world)` and `WorldIs(b, world)` and `WorldIs(out, world)`
*   `SameValueDomain(a, b)` and `SameValueDomain(a, out)`
*   `NumericValue(a)` (meaning “value domain numeric”)
*   If `world="field"` also `IndexIs(a, idx)` and `IndexIs(b, idx)` and `IndexIs(out, idx)`

No “fieldDomain” exists anywhere in this model.

* * *

### 7) Bus eligibility is no longer a flag; it’s a derived predicate

Anywhere `busEligible` used to exist in type metadata, replace with a pure function over the solved `TypeDesc`:

```ts
export function isBusEligible(t: TypeDesc): boolean {
  // whatever your canonical rule is; example:
  return t.world === "signal" || t.world === "field" || t.world === "event";
}
```

This keeps the type system single-source and prevents stale flags.

* * *

### 8) What block authors / lowerers emit now

When a port expects “field of vec2 over instances”, it emits:

*   `WorldIs(portType, "field")`
*   `ValueIs(portType, "vec2")`
*   `IndexIs(portType, { kind: "instances" })`

When a port is polymorphic over world but fixed value domain (if you allow that), it emits `SameValueDomain(...)` without committing `WorldIs` until needed.

This is the canonical change required to keep typevars + constraints sound under the union `TypeDesc`.

## Response:
### Canonical block definitions

**Impact:** yes, but it’s a _tightening_, not a redesign.

1.  **Every port type becomes a full `TypeDesc`, not “base domain + flags”.**  
    So each block definition must specify:
    *   `world` (`signal|field|event|config`)
*   and the corresponding required fields (`value`, or `index+value`, or `event`, or `config`).
    2.  **No more “fieldDomain”, “busEligible”, or optional port metadata.**  
    Anything like “bus-eligible” is derived from `TypeDesc` (or from the _role_ of the port), never stored on the type.
3.  **Polymorphism in block defs becomes explicit via typevars + constraints.**  
    Instead of `AddSignal`, `AddField`, you can define one `Add` block with:
    *   a typevar `T` for the whole `TypeDesc`
*   constraints: `WorldIs(T, "signal"|"field")` (if you allow both) plus `NumericValue(T)` plus `SameValueDomain(inA,inB,out)` plus (if field) `IndexIs(...)` equality.  
    If you _do not_ want a block to be polymorphic, you just pin a concrete `TypeDesc`.

* * *

### Compiler

**Impact:** yes, and it’s exactly where you want it: earlier, stricter, less ad-hoc.

1.  **Type-checking becomes variant-unification, not “presence checks.”**  
    Every place the compiler previously asked “is this a field?” by optional props must now:
    *   either unify against a concrete `TypeDesc` variant, or
*   emit `WorldIs(...)` constraints and let the solver refine.
    2.  **Bus typing and multi-writer combine become cleaner.**  
    Since “bus eligibility” is derived, the compiler decides “can this edge connect into a global junction?” by:
    *   checking the concrete solved `TypeDesc` for the port/bus endpoint
*   and enforcing the combine-mode constraints (which live outside types).
    3.  **Materialization / schedule selection becomes `world`\-driven.**
    *   `signal` outputs feed `signalEval` steps
*   `field` outputs feed field-handle/materialize steps
*   `event` outputs feed event-store steps
*   `config` stays compile-time / constant-ish  
    No optional branching logic.

* * *

### Graph Normalization

**Impact:** yes, and it simplifies normalization because roles/rewrites become **type-safe**.

Normalization typically does rewrites like:

*   expand multi-input edges into explicit “combine” nodes
*   insert adapters (broadcast signal→field, pack/unpack vec2, etc.) _only if allowed_
*   desugar UI structural constructs into explicit blocks/edges

With the new constraint system:

1.  **Normalization can create _typed_ synthetic nodes with guaranteed contracts.**  
    Example: a multi-writer input becomes an explicit `Combine` block whose ports are:
    *   same `world` as the destination port (derived from constraint solution)
*   same `value domain`
*   if field: same `index domain`  
    This avoids the previous “normalize now, pray later” failure mode.
    2.  **Adapter insertion becomes a first-class compile pass with constraints, not heuristics.**  
    If you allow `signal<number>` into `field<instances,number>`, normalization inserts a `BroadcastSignalToField` block, and the type solver proves it’s legal by constraints:
    *   input world=signal, output world=field
*   output index = destination index
*   value domain identical
    3.  **Role metadata and normalization stay orthogonal.**  
    Roles decide _what gets rewritten_ (e.g., “this edge is a default-source edge”), but **types decide whether the rewritten graph is valid**. No more “role implies special typing rules” scattered around.

* * *

Say “Next.”

## Response:
### Canonical block definitions: what changes

**Rule:** every block port declares a complete, non-optional `TypeDesc`, and any polymorphism is expressed only via type variables + constraints.

**Block definition shape (canonical):**

*   `blockKindId`
*   `ports[]` where each port has:
    *   `dir: "in" | "out"`
    *   `name`
    *   `type: TypeExpr` (either a concrete `TypeDesc` literal, or a `TypeVar`)
    *   `combine: CombineModeSpec` (for inputs only; explicit, not implied)
    *   `defaultSourcePolicy: "none" | "allowed"` (port behavior, not type)
*   `constraints: Constraint[]` (only if the block is polymorphic or has cross-port coupling)

**What disappears from block defs:**

*   `busEligible` (derivable from port behavior + graph normalization rules, not type)
*   `fieldDomain` (index domain is part of the `field` variant and always present when `world="field"`)
*   any optional “domain metadata” or “special casing” flags on types

**Concrete example (single Add block, works for signal or field, but only numeric):**

*   Ports:
    *   `a: T`, `b: T` → `out: T`
*   Constraints:
    *   `WorldIs(T, "signal"|"field")`
    *   `NumericValue(T)` (i.e., `T.value ∈ {number, vec2, vec3, ... if you allow}`)
    *   `SameIndexDomain(a, b, out)` (only meaningful when `world="field"`, but still encoded as a constraint that becomes vacuously true for non-field worlds)
    *   `SameValueDomain(a, b, out)`
*   Input combine:
    *   `a.combine = { mode: "sum" | "last" | ... }` (explicit per-port, not global)

**Net effect:** block library shrinks (fewer duplicated “signal vs field” blocks), and the compiler stops depending on optional type properties to infer behavior.

## Response:
### Compiler impact

**1) Single, total `TypeDesc` + `TypeExpr`**

*   Compiler must treat every port type as a `TypeExpr`:
    *   concrete `TypeDesc` (fully specified, no optional fields), or
    *   `TypeVar` (unification variable).
*   All “is this numeric / bus-eligible / has fieldDomain?” logic becomes **constraint solving**, not ad-hoc property checks.

**2) Unification becomes the only way types flow**

*   Edge typing is: `unify(srcPort.type, dstPort.type)` + accumulate block constraints + graph-derived constraints.
*   Multi-input resolution does not “pick a type”; it just adds more unifications and then validates.

**3) Multi-writer + combine is compiled, not inferred**

*   Each input port has an explicit combine spec.
*   Lowering must emit a canonical combine node/step per input port that has >1 incoming edge:
    *   For `signal`: combine returns a `signal` expression.
    *   For `field`: combine returns a `field` expression (and must apply same domain constraints).
    *   For `event`: combine is a separate event combine semantics (and must exist in `TypeWorld` if you keep events).

**4) No special-case “bus compilation”**

*   “Bus blocks” are normal blocks after graph normalization; the compiler just sees:
    *   a globally-addressable junction node with ports like anything else,
    *   and edges, including multi-in edges.
*   Any previous “bus lowering pass” becomes: **just the same lowering** used for any multi-in port.

**5) Default sources don’t exist in compiler IR**

*   They are editor-authored patch nodes/edges after normalization.
*   Therefore: compiler never sees `DefaultSourceTable` in `CompiledProgramIR` and doesn’t need special logic—just compiles the resulting graph.

**6) Slot allocation / storage**

*   Since types are total, slot storage selection is deterministic:
    *   `world="signal"` → numeric slots (f64/f32/i32/u32) depending on value domain.
    *   `world="field"` → object slots holding FieldExprId/FieldHandle, plus explicit materialization steps decide buffer formats.
    *   `world="event"` → event store indices / event slots (if you support it).
*   No “optional fieldDomain” means field slots can always be treated as “field + indexDomain + valueDomain” at compile time.

**7) Failure mode gets cleaner**

*   Type errors become:
    *   unsatisfied constraints, or
    *   unification failures (e.g., signal vs field mismatch).
*   No “missing optional property” failure class remains.

## Response:
### Canonical block definitions impact

**1) Every block definition becomes a constraint generator**  
A block is no longer “typed by ad-hoc rules + optional fields”; it is:

*   a set of ports with `TypeExpr` (concrete `TypeDesc` or `TypeVar`)
*   a set of constraints relating those ports
*   a lowering rule that emits IR nodes/steps consistent with the solved types.

**2) Canonical shape of a block definition**  
No optional fields; every block has these, always:

*   `blockKindId: string`
*   `ports: { inputs: PortDef[]; outputs: PortDef[] }`
*   `constraints: ConstraintSpec[]` (pure, declarative)
*   `lower: (ctx: LowerCtx, solved: SolvedTypes, bindings: PortBindings) => LowerResult`

Where each `PortDef` includes:

*   `portId: string`
*   `type: TypeExpr` (can be a `TypeVar`)
*   `combine: CombineSpec` (**always present**, even if `mode="single"`)

**3) Combine mode moves into the block library**  
Because you require explicit combine semantics “for all blocks & buses”:

*   each input port defines its allowed combine modes and its default mode (or a fixed mode).
*   “bus junction” blocks simply expose ports where combine mode is user-configurable in UI, but the compiler sees it as a normal `CombineSpec`.

**4) Fewer duplicated block variants via generics**  
You can collapse “AddSignal / AddField / AddScalar” into one `Add` block by making:

*   `Add.a: TVar("T")`
*   `Add.b: TVar("T")`
*   `Add.out: TVar("T")`  
    and constraints:
*   `SameWorld(T, signal|field|scalar)` (or more specific)
*   `HasAdd(T)` (typeclass-style capability)
*   `If World(T)=field then IndexDomain(a)=IndexDomain(b)=IndexDomain(out)`.

This pushes specialization into constraints + lowering selection rather than separate blocks.

**5) Domain alignment becomes explicit constraints**  
Any block that touches fields must state index-domain relationships explicitly, e.g.:

*   `Map(domain, f)` emits constraints:
    *   `domain: DomainExpr<D>`
    *   `f: Field<D, V>`
    *   `out: Field<D, V2>`

No `fieldDomain?` property needed; the index domain is part of the type.

**6) “Structural blocks” become normal blocks with roles, not special types**  
Your “editor-managed” forms (bus junctions, default sources, wire-sidecars for state) do not change the canonical block definition.  
They change **graph normalization + metadata**:

*   The underlying block kind is still a normal kind with normal ports and constraints.
*   The UI role decides how the editor instantiates/attaches it.

**7) Lowering must be polymorphic over solved worlds**  
For a generic block like `Add<T>`:

*   lowering must branch on the solved `world(T)`:
    *   `signal` → emit `SignalExprAdd`
    *   `field` → emit `FieldExprAdd`
    *   `scalar` → fold at compile time into const pool if both inputs constant, else emit scalar node if you have one.  
        This branching is deterministic because types are solved before lowering emits IR.

**8) “Bus eligibility” disappears from block defs**  
If every port can accept multi-in edges and has combine semantics, nothing needs a `busEligible` flag.  
“Bus-ness” is purely:

*   a _role_ on a node instance (editor-level) + global addressing,  
    not a property of the block kind or type.

**Net effect:** block library becomes smaller, more uniform, and the compiler becomes stricter because all behavior is expressed as constraints + deterministic lowering.

2/2

## Response:
### Compiler impact

**1) Unification becomes mandatory and earlier**  
Because block definitions now _are_ constraint generators, compilation must run:

1.  **Graph normalization (editor output)** → yields only ordinary block instances + edges (including “structural” ones already materialized).
2.  **Constraint collection**:
    *   instantiate a `TypeVar` for every port endpoint that isn’t concretely typed
    *   emit block-local constraints from each block kind
    *   emit edge constraints: `TypeEq(outPort, inPort)` plus **combine constraints** per input port
3.  **Solve** (union-find + typeclass/capability checks + occurs checks for structured types like `field<D,V>`).
4.  **Commit solved types** back onto the normalized graph (every port endpoint has a concrete `TypeDesc`).
5.  **Lowering** (now deterministic): emit IR nodes/steps based on the solved types.
6.  **Schedule build** from IR dependencies.

You cannot interleave lowering with “maybe it’s a field, maybe it’s a signal” anymore; you need solved types first.

**2) Slot allocation depends on solved types**  
Slot allocation is no longer “one slot per output in lowering” by default unless you’ve already decided packing rules.  
Given your direction:

*   slot storage kind (`f64` vs `object` vs packed bundle) is determined by solved `TypeDesc`
*   therefore slot allocation should happen **after solving** and **before or during lowering**, but driven by a single allocator that knows the storage policy.

**3) Combine semantics become first-class IR**  
Since _all_ inputs can be multi-writer with explicit combine mode:

*   the compiler must represent “combine” explicitly, not as a bus-special case.  
    Canonical lowering pattern:
*   If an input has 0 writers → it must have a default source (editor inserted) or it’s a compile error.
*   If it has 1 writer → direct edge (no combine node).
*   If it has N>1 writers → insert a **Combine node** in IR (or in normalized graph) with:
    *   `mode` from the port’s combine setting
    *   deterministic writer ordering key (see below)

This applies uniformly to:

*   block input ports
*   global junction “bus blocks”
*   any other fan-in.

**4) Determinism requirements you must enforce**  
Multi-writer combine must be deterministic across:

*   graph edit operations
*   serialization order
*   hot-swap
*   different machines

So the compiler must define **canonical writer order**. One rule, always:

*   order writers by `(edgeId)` where `edgeId` is a stable, content-addressed or persistent GUID assigned by the editor.  
    If you don’t have stable edge IDs, you’ll get flicker/jank and irreproducible offline export.

**5) Type system simplification removes legacy checks**  
With no `busEligible` and no optional “fieldDomain”:

*   edge typing is just `TypeEq` plus structured unification
*   “bus lowering” is not a separate conceptual pipeline; it’s just global-junction blocks + normal combine insertion.

So anything like `compileBusAware.ts` becomes either:

*   part of normalization (editor-level) or
*   part of generic compile constraint wiring (compiler-level),  
    but not a distinct “bus subsystem”.

**6) Runtime data model gets cleaner**  
Because the compiler always emits combine nodes for fan-in:

*   runtime never has to “discover” multi-input resolution
*   executors evaluate exactly what the schedule says
*   debugging becomes consistent: “why is this value X” can always point to the combine node + its inputs.

**7) What changes most in code**

*   `pass6-block-lowering` becomes **two passes** logically:
    *   `pass6a-constraints` (collect)
    *   `pass6b-solve` (unify)
    *   `pass6c-lower` (emit IR with solved types)  
        You can keep it in one file, but the phases must be explicit and ordered.

**Net effect:** the compiler stops being “lower as we walk” and becomes “solve then lower”, with combine nodes as a universal construct for all fan-in, not a bus feature.

## Response:
### Graph Normalization impact

Graph normalization becomes the **one and only place** where “special UI / structural constructs” are converted into ordinary blocks + edges that the compiler consumes, and it must do so with a single canonical output shape.

#### 1) Canonical normalized graph output

After normalization, the compiler must see only:

*   `BlockInstance[]` (each has `id`, `kind`, `ports`, `role`, `roleMeta`)
*   `Edge[]` (each has `id`, `from`, `to`, `role`, `roleMeta`)
*   `PortCombineSpec` for every **input** port (always present, never optional)

No “hidden blocks”, no inline default symbols, no bus UI concepts, no wire-sidecars.

#### 2) Where multi-writer fan-in is resolved

Normalization must **not** insert combines if your compiler already inserts combine nodes deterministically, but it _must_:

*   produce an explicit list of incoming edges per input port
*   ensure every edge has a stable `edgeId`
*   ensure every input port has an explicit `combineMode`

In other words, normalization guarantees the compiler can deterministically insert combine nodes later.

#### 3) Default sources become explicit edges and blocks

Normalization must rewrite “default source on a port” into:

*   a real `Const/DefaultSource` block instance (or whatever your canonical default-source block kind is)
*   an explicit edge from that block output to the target port

This ensures:

*   missing-input behavior is never handled by the compiler via ad-hoc fallback rules
*   the “0 writers” case is impossible unless it is an error by spec

#### 4) Bus UI becomes globally-addressable junction blocks

Normalization must rewrite the “global bus” UI into one of these equivalent forms (pick one and standardize):

*   **Option you’ve been using:** a “Junction” block with stable global identity, materialized as an actual block instance in a dedicated “global sheet” graph layer, with explicit edges like any other.

Critically: it must not create a magical `busId` concept for the compiler. It’s just a block instance with edges.

#### 5) Wire-sidecar state blocks become explicit blocks and edges

If the UI shows UnitDelay/Phasor/etc as a modifier on a wire, normalization must:

*   split the edge into two edges
*   insert the stateful block instance in between
*   preserve edge IDs deterministically (rule below)

Example:

*   Before: `A.out -> B.in` with sidecar `UnitDelay(seed=...)`
*   After:
    *   `A.out -> UnitDelay.in`
    *   `UnitDelay.out -> B.in`

#### 6) Deterministic ID rules (non-negotiable)

Normalization must be able to run repeatedly and produce stable IDs, or debug/history explodes.

Canonical rules:

*   Every block instance has a stable `blockId` (GUID) assigned at creation time.
*   Every edge has a stable `edgeId` (GUID) assigned at creation time.
*   When normalization expands a single user-visible edge into multiple edges (sidecar insertion):
    *   keep the original `edgeId` for one of the resulting edges (choose a rule: “upstream edge keeps original id”)
    *   allocate new `edgeId`s for the additional edges
    *   store `derivedFromEdgeId` in edge role metadata for traceability

Same idea for default sources if they attach/detach frequently: the created edge must keep identity stable as long as the default source remains logically the same attachment.

#### 7) Roles become the only mechanism for “specialness”

Normalization is the owner of role semantics:

*   It _reads_ role metadata authored by the editor (default sources, sidecars, global junctions).
*   It _emits_ only ordinary graph objects with those roles retained for:
    *   debugging UI mapping
    *   stable diffing
    *   future editor rehydration

The compiler must treat role as **non-semantic** for typing and evaluation (except debug/index/sourceMap), otherwise you’ve reintroduced hidden behavior.

#### 8) Normalization must output a “compile-ready” invariant set

The normalized graph is valid only if:

*   every input port has `combineMode`
*   every input port has ≥1 incoming edge (or the graph is rejected as invalid)
*   every edge endpoint references existing blocks/ports
*   no “UI-only” constructs remain

**Net effect:** normalization becomes the strict boundary: all UI sugar → explicit blocks/edges with stable IDs and explicit combine specs, so the compiler can be pure, deterministic, and boring.

## Response:
### Combine modes

You need **two separate concepts** that people tend to blur together:

1.  **Selection/priority policy** (which writer “wins” when multiple writers exist)
2.  **Algebraic combine operator** (how to merge values when you actually want mixing)

If you don’t separate them, you’ll end up with “last/sum/mix” that behaves differently per type and feels arbitrary.

#### Canonical combine modes to support (one list, no options)

These are _input-port policies_. Each input port declares exactly one.

**A. Priority / selection**

*   `priority` (“writer wins”): deterministic pick by writer order.
    *   Requires stable writer ordering key. Use **edge order** first, then tie-break by `edgeId`.
*   `first` : pick lowest-priority index (rarely needed if you have `priority` with editable ordering, but it’s distinct and useful for “fallback chains”).
*   `last` : pick highest-priority index (useful for quick overrides).

**B. Numeric mixing (Signal<number>, Scalar<number>)**

*   `sum`
*   `product`
*   `min`
*   `max`
*   `mean`
*   `lerp_by_weight` (special: expects writers provide `(value, weight)` or you use a separate weight rail/port; if you don’t have weights, don’t implement this yet)

**C. Boolean / trigger-like**

*   `or`
*   `and`
*   `xor`
*   `any` (alias of `or`, but keep only one name in the codebase; I’d keep `or`)
*   `count` (returns number of true triggers per frame; this is surprisingly useful for debugging and rhythm)

**D. Vector mixing (vec2/vec3)**

*   `sum`, `mean`, `min`, `max` (component-wise)
*   `normalize_sum` (sum then normalize) — good for “forces/steering” feel

**E. Phase (your dedicated type, not a number)**

*   `priority`, `first`, `last`
*   `phase_add` (wrap add: `(a + b) mod 1`)
*   `phase_mean` (circular mean)
    *   This is the important one; naïve mean breaks around wrap (0.99 and 0.01 should average near 0, not 0.5).
*   `phase_delta_pick` (pick the writer whose phase is closest to a reference phase, usually the port’s previous output; reduces jumps)

**F. Color**  
Pick one internal representation and then define combines in that space. If you store channels separately (your option C), treat color as a 4-tuple and still define semantics.

Supported port modes:

*   `priority`, `first`, `last`
*   `rgba_add` (clamped add)
*   `rgba_mul` (component-wise multiply; useful as “tint”)
*   `rgba_mean`
*   `over` (alpha compositing “source-over” in a deterministic order; uses writer priority order)
*   `screen`, `overlay` (optional if you want; these are familiar but add cognitive load—only do them if your users will actually use them)

**G. Field worlds**  
You should not pretend field-combines are the same as signal-combines. They must be explicit about **domain alignment**.

Supported port modes:

*   `priority`, `first`, `last`
*   `zip_sum`, `zip_mean`, `zip_min`, `zip_max` (element-wise; requires same domain length)
*   `broadcast_then_zip_*` (if one writer is scalar/signal and one is field; scalar broadcasts to domain then zip)
*   `domain_mismatch = error` (always; never silently coerce)

That’s the whole set. Everything else is sugar on top.

* * *

### How to make “tricky worlds/domains” intuitive (and enjoyable)

#### 1) Treat “priority” as the default everywhere

Your plan (“default source blocks exist on every port, always”) only stays intuitive if the default combine policy is:

*   **`priority` with explicit writer ordering**, where _default sources are always lowest priority_.

That gives the mental model:

> “There is always a baseline signal; real connections override it.”

And it prevents “why is it adding??” confusion.

Mechanically:

*   Every port has a synthetic default-source writer edge at priority = **\-∞** (or last in ordered list).
*   UI reordering changes priority order among _non-default_ writers.
*   Removing all writers still yields deterministic behavior: default source drives it.

#### 2) Separate “type legality” from “combine behavior”

A combine mode is only valid for a subset of types. Make that a compile-time constraint:

*   `sum` valid only for numeric-ish types: `number`, `vecN`, `phase` (if you define `phase_add` separately), and fields of those with `zip_sum`.
*   `over` valid only for `color` or `field<color>`.
*   `or/and/xor` valid only for `trigger/bool` and maybe `event<trigger>` if you keep events.

When a user selects an invalid combine mode in UI, it should be impossible or immediately invalid with a single clear message.

#### 3) Make domain alignment rules explicit and visible

For field ports, the frustration usually comes from “why doesn’t this combine?” or “why did it silently broadcast?”

Pick one rule set and never deviate:

*   Field+Field: allowed only if domains are identical **by handle** or at least **same length + same domainId**.
*   Field+Signal/Scalar: allowed only via explicit broadcast (auto is fine if deterministic).
*   Field+Field mismatch: **error**, never auto-resample.

This leads to enjoyment because it makes patches “click” and prevents haunted behavior.

#### 4) For phase: never force people to think about wrap unless they asked to

Your “phase is not number” instinct is correct, but you must still give them ergonomic bridges.

Do this:

*   Phase ports default to `priority`.
*   If they select a mixing mode, offer only:
    *   `phase_add`
    *   `phase_mean` (circular mean)
    *   `phase_delta_pick` (anti-jank selection)

And give one canonical adapter block:

*   `PhaseTo01` (phase → number\[0..1\])
*   and never provide Number→Phase unless they use an explicit `Wrap01ToPhase` block.

That preserves safety while still letting them use phase everywhere.

#### 5) For color: “over” is the most intuitive non-priority combine

Additive color is fun but confusing as a default. Alpha compositing is closer to how people reason visually.

So:

*   Default: `priority`
*   Common: `over`
*   Fun/FX: `rgba_add`, `screen`

And for fields of color:

*   `zip_over` is meaningless unless you define ordering; instead treat it as:
    *   `over` with writer order, applied per element, with broadcast rules as needed.

#### 6) Deterministic ordering is non-negotiable

Any combine that depends on writer order must be stable across:

*   graph edits that don’t touch the input set
*   recompiles
*   hot-swap

So define writer ordering key once:

`(explicitPriorityIndex, edgeId)` where `explicitPriorityIndex` is stored in the edge role metadata (editor-owned), and `edgeId` is the tie-breaker.

Default-source edges always have `explicitPriorityIndex = +infinity` (or 10^9), meaning “lowest priority.”

* * *

### Practical mapping table (what modes mean per world)

*   **Signal<number>**: `priority`, `sum`, `product`, `min`, `max`, `mean`
*   **Signal<vec2/vec3>**: same, component-wise; add `normalize_sum`
*   **Signal<phase>**: `priority`, `phase_add`, `phase_mean`, `phase_delta_pick`
*   **Signal<color>**: `priority`, `over`, `rgba_add`, `rgba_mul`, `rgba_mean`, `screen`
*   **Field<number>**: `priority`, `zip_sum`, `zip_mean`, `zip_min`, `zip_max` (+ broadcast variants)
*   **Field<vecN>**: `priority`, `zip_*` + `zip_normalize_sum`
*   **Field<color>**: `priority`, `over`, `rgba_add`, `rgba_mul`, `rgba_mean` (all per-element; broadcast allowed only from scalar/signal)
*   **Trigger/bool**: `priority`, `or`, `and`, `xor`, `count`

That’s enough to cover real patches without turning the system into a combinatorics museum.

## Response:
Roadmap: build the whole system (no UI, programmatic patches, single Canvas)
----------------------------------------------------------------------------

This plan is ordered to minimize rewrites while still introducing the “necessary complexity” early enough that you don’t paint yourself into a corner.

* * *

### 1) Freeze the canonical data model (PatchIR) and never violate it

**Deliverable**

*   `PatchIR` JSON shape that is the _only_ input to the compiler.

**Must include**

*   `blocks[]`: `{ blockId, typeId, role, params, ports? }`
*   `edges[]`: `{ edgeId, from:{blockId, port}, to:{blockId, port}, role, combineMode? , priorityIndex }`
*   `role` is **always present** on both blocks and edges: `{ kind: string, meta: object }`
*   Stable IDs (`blockId/edgeId`) are never reused.

**Why now**

*   Every later guarantee (determinism, hot-swap continuity, debug history stability) depends on stable identities and explicit ordering.

* * *

### 2) Lock the type system shape (TypeDesc) with zero optional fields

**Deliverable**

*   A single `TypeDesc` used by editor + compiler + runtime.
*   No `busEligible`, no “fieldDomain” optionality.

**One canonical form**

*   `TypeDesc = { world, domain, arity, packing }`
    *   `world ∈ { signal, field, event, scalar, config }`
    *   `domain ∈ { number, bool, trigger, phase, vec2, vec3, color, ... }`
    *   `arity`: integer (1 for number/phase/bool/trigger, 2/3 for vec2/vec3, 4 for color if you store RGBA channels)
    *   `packing`: `{ kind: "slots", lanes: number }` (always explicit even if redundant)

**Why now**

*   Slot allocation, combine legality, and runtime storage are downstream of this.

* * *

### 3) Define the constraint solver contract (typevars + constraints) as the only typing mechanism

**Deliverable**

*   `constraints.ts`: type variables, constraint kinds, and a unifier.
*   Block definitions emit constraints; graph typing is solved once.

**Core constraints you need**

*   `Eq(a,b)` unify
*   `WorldIs(t, world)`
*   `DomainIs(t, domain)`
*   `ArityIs(t, n)`
*   `SupportsCombine(t, mode)`
*   `CanCoerce(src, dst)` (only if you truly allow coercion; otherwise omit entirely)

**Why now**

*   You can’t implement multi-writer + combine correctly without static legality rules.

* * *

### 4) Make “multi-writer ports” and combine modes a first-class compile-time feature

**Deliverable**

*   Edge groups by `(to.blockId, to.port)` become **ordered writer lists** at compile time.
*   Combine mode is a property of the **input port instance** (stored on a role/meta on the port or on a synthetic “port node”; but it must compile to one rule).

**Rules**

*   Writer ordering is: `(priorityIndex, edgeId)` and is stable.
*   Default-source writer is always present and always lowest priority.

**Why now**

*   It unifies “buses”, “default sources”, and ordinary wiring into one execution model.

* * *

### 5) Graph normalization pass that produces a compiler-only NormalGraph

**Deliverable**

*   `normalizePatch(patchIR) -> NormalGraph`

**Must do**

*   Expand multi-input port groups into an explicit `CombineNode` per input port:
    *   Inputs: writer outputs (including default source)
    *   Output: the single value feeding the block input
    *   `CombineNode` carries the combine mode + stable ordering
*   Expand “global addressable junctions” (buses) into ordinary blocks + edges in NormalGraph.
*   Expand default sources (0-input blocks) into explicit writers for each port.
*   Expand editor-managed state-on-wire into explicit state blocks + edges.

**Why now**

*   The compiler should never contain “special-case bus/state/default”; it should see only nodes and edges.

* * *

### 6) Lock the IR schema (CompiledProgramIR) and delete all competing schemas

**Deliverable**

*   One `CompiledProgramIR` module used everywhere.
*   Runtime imports only from it.

**Must include**

*   `signalExprs`, `fieldExprs`, `eventExprs`
*   `constants`
*   `stateLayout`
*   `slotMeta` (compiler-emitted; runtime must not infer except for tests)
*   `schedule`
*   `render` (sinks + bindings)
*   `debugIndex` (optional is fine, but field must exist with a sentinel value if you truly forbid optionality)

**Why now**

*   You’re already tripping over schema split; this prevents recurrence.

* * *

### 7) Slot allocation strategy (the one you standardize on)

**Deliverable**

*   Slot allocator that runs during lowering (compilation), not scheduling.
*   Every node output gets a slot (or slot bundle) at creation time.

**Rule**

*   A value of `TypeDesc.arity = N` occupies **N slots**, always.
*   No hidden packing decisions later; slot layout is deterministic.

**Why now**

*   It makes debug history stable and makes render materialization wiring straightforward.

* * *

### 8) Lowering: NormalGraph → Expr tables + Schedule skeleton

**Deliverable**

*   Lower each normalized node into one of:
    *   `SignalExpr`
    *   `FieldExpr`
    *   `EventExpr`
    *   `StateOp` (still expressed via schedule steps, but referenced by exprs)
*   Emit schedule steps in dependency order.

**Key point**

*   Combine nodes become explicit Exprs (`SignalCombineExpr`, `FieldCombineExpr`, etc.), not ad-hoc runtime behavior.

**Why now**

*   This is where “the whole language” becomes data.

* * *

### 9) State and feedback (memory/latching) as an explicit schedule mechanism

**Deliverable**

*   A canonical “read previous / write next” contract:
    *   `StepStateRead(stateOffset -> outSlot)` always reads **t-1** value.
    *   `StepStateWrite(inSlot -> stateOffset)` writes next value, committed at end-of-frame.
*   No cycles in the schedule graph; feedback is represented only via these steps.

**Why now**

*   This is how you get determinism, offline export exactness, and debuggability.

* * *

### 10) Runtime core: ValueStore + StateBuffer + EventStore + FrameCache

**Deliverable**

*   `ScheduleExecutor.executeFrame(program, runtime, tAbsMs)`:
    1.  `runtime.frameCache.newFrame()`
    2.  `deriveTime` (compute time outputs for this frame)
    3.  evaluate expr steps (signals/fields/events)
    4.  materialize steps (buffers)
    5.  assemble render frame
    6.  commit state writes

**Hard rules**

*   No reading from “future” state in same frame.
*   Cache stamps keyed by expr id + frame id only.

* * *

### 11) Render pipeline (Canvas2D) as IR: materialize → assemble → renderFrame()

**Deliverable**

*   Steps:
    *   `StepMaterializeColor`
    *   `StepMaterializePath` (even if you defer actual paths, define it now)
    *   `StepRenderAssemble(outFrameSlot)`
*   `RenderFrameIR` contains passes with buffer refs that point into `ValueStore`.

**Why now**

*   It isolates rendering from evaluation and gives you performance knobs (buffer reuse, caching, partial updates).

* * *

### 12) Deterministic time + offline export exactness

**Deliverable**

*   Define time as **frame-indexed simulation time**, not wall time:
    *   `frameIndex` is the authority
    *   `tAbsMs = frameIndex * (1000/fps)` for export
    *   live playback may map wall-time → frameIndex, but the program sees only the derived simulation time

**Why now**

*   It guarantees offline export matches interactive playback exactly for a given fps and seed.

* * *

### 13) Anti-jank hot-swap (structural continuity)

**Deliverable**

*   Hot-swap uses:
    *   stable `stateId → offset` mapping (done in schedule build or a dedicated state-layout pass, but deterministically)
    *   preserve matching state cells
    *   preserve time continuity fields you care about (phase offsets, wrap detectors)
*   Smooth parameter edits via explicit “stateful smoothing blocks” (not compiler magic)

**Why now**

*   You can’t retrofit continuity later without breaking mental models and saved patches.

* * *

### 14) Debug instrumentation from day one (ring buffers + causal links)

**Deliverable**

*   A global trace sink in runtime:
    *   step begin/end timestamps
    *   slot writes (slot id, type, short value hash)
    *   state reads/writes
    *   cache hits/misses
*   All trace events include:
    *   `frameIndex`, `stepId`, and (when applicable) `sourceMap` linkage to block/edge ids.

**Why now**

*   You will otherwise drown once paths + 3D + events land.

* * *

### 15) Test harness: programmatic patch builder + golden runs

**Deliverable**

*   A tiny patch builder library that emits PatchIR.
*   Golden tests that compile + run N frames and assert:
    *   deterministic slot hashes per frame
    *   deterministic RenderFrameIR structure
    *   deterministic exported frames (pixel hash optional, structure hash mandatory)

**Why now**

*   This is what keeps “one spec” actually enforced as the system evolves.

* * *

If you say “Next”, I’ll expand Step 5–9 into the exact pass boundaries, module layout, and the concrete data shapes you should implement first so a junior can wire it without inventing semantics.

## Response:
Steps 5–9, fully specified: passes, module layout, concrete shapes
------------------------------------------------------------------

### Pass boundaries (compiler pipeline)

#### Pass 5 — NormalizePatch → NormalGraph

**Input:** `PatchIR`  
**Output:** `NormalGraph`

**Responsibilities (all mandatory):**

1.  **Multi-writer resolution becomes explicit nodes**
    *   For every input port `(blockId, inPort)` that has ≥1 writer edge **or** a default source, create exactly one `CombineNode`.
    *   All incoming writers become edges into that `CombineNode`.
    *   `CombineNode` output is the _only_ writer into the target block input.
2.  **Default sources become ordinary writer nodes**
    *   Every port has an implicit “default writer” edge from its default-source block instance (even if user didn’t set one; then it’s an auto-created “DefaultConst” block).
    *   This edge always exists, always has lowest priority.
3.  **Buses become ordinary globally-addressed junction nodes**
    *   Any “bus UI” entity is normalized into:
        *   `BusJunctionNode(busName)` with ordinary in/out ports
        *   ordinary edges to/from it
4.  **State-on-wire becomes explicit state block node**
    *   Any edge-role indicating a managed stateful modifier is expanded into a `StateNode` inserted between upstream and downstream.

**Determinism rules:**

*   Writer order is deterministic and stored on the combine node as an ordered `writers[]` list computed by `(priorityIndex asc, edgeId asc)`.

* * *

#### Pass 6 — TypeSolve on NormalGraph

**Input:** `NormalGraph`  
**Output:** `TypedNormalGraph` (same topology + concrete types per port + per node output)

**Responsibilities:**

*   Every node port and node output has a `TypeDesc` (no unknowns remain).
*   Every combine node validates `SupportsCombine(type, mode)`.

**Hard rule:** if a type is not solvable, compilation fails with a single, structured error object (no partial programs).

* * *

#### Pass 7 — LowerTypedGraph → BuilderIR

**Input:** `TypedNormalGraph`  
**Output:** `BuilderIR` (expr tables + “proto schedule” + slot allocations + debug/source map)

**Responsibilities:**

*   Allocate slots for **every** node output (including combine nodes and structural nodes).
*   Emit `SignalExpr` / `FieldExpr` / `EventExpr` nodes.
*   Emit state reads/writes as explicit schedule steps.
*   Emit materialization + render-assemble steps as explicit schedule steps.

**Hard rule:** slot allocation happens here (during lowering), not later.

* * *

#### Pass 8 — BuildSchedule (topological schedule + deps)

**Input:** `BuilderIR`  
**Output:** `ScheduleIR` with `steps[]` and `deps[]` resolved, plus `initialSlotValues`

**Responsibilities:**

*   Ensure all step deps are explicit and acyclic.
*   Resolve stateId→offset mapping here (because stateLayout is finalized here or earlier; pick one place and never duplicate).

* * *

#### Pass 9 — FinalizeProgram (BuilderIR → CompiledProgramIR)

**Input:** `BuilderIR + ScheduleIR`  
**Output:** `CompiledProgramIR` (the only runtime contract)

**Responsibilities:**

*   Freeze tables, slot meta, constants, state layout, schedule, render sinks, source map.

* * *

Concrete shapes (the stuff you actually implement first)
--------------------------------------------------------

### PatchIR (input)

```ts
type Role = { kind: string; meta: Record<string, unknown> };

type PatchIR = {
  patchId: string;
  blocks: BlockInstanceIR[];
  edges: EdgeIR[];
};

type BlockInstanceIR = {
  blockId: string;
  typeId: string;               // refers to block library definition
  role: Role;                   // always present
  params: Record<string, unknown>;
};

type EdgeIR = {
  edgeId: string;
  role: Role;                   // always present
  from: { blockId: string; port: string };
  to: { blockId: string; port: string };
  combineMode: CombineMode;     // always present (even if ignored for single-writer)
  priorityIndex: number;        // always present
};
```

### NormalGraph (output of normalization)

This is a compiler-only graph where multi-writer ports are replaced by explicit combine nodes and structural expansions are done.

```ts
type NormalGraph = {
  nodes: NormalNode[];
  edges: NormalEdge[];
};

type NormalNode =
  | { kind: "block"; nodeId: string; blockId: string; typeId: string; role: Role; params: Record<string, unknown> }
  | { kind: "combine"; nodeId: string; target: { blockId: string; port: string }; mode: CombineMode; role: Role; writers: WriterRef[] }
  | { kind: "busJunction"; nodeId: string; busName: string; role: Role }
  | { kind: "state"; nodeId: string; stateId: string; stateKind: StateKind; role: Role; params: Record<string, unknown> }
  | { kind: "defaultSource"; nodeId: string; forPort: { blockId: string; port: string }; role: Role; sourceBlockId: string };

type WriterRef = { edgeId: string; from: { nodeId: string; port: string } };

type NormalEdge = {
  edgeId: string;
  role: Role;
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
};
```

### TypeDesc (no optional fields)

```ts
type TypeWorld = "signal" | "field" | "event" | "scalar" | "config";
type TypeDomain = "number" | "bool" | "trigger" | "phase" | "vec2" | "vec3" | "color";

type TypeDesc = {
  world: TypeWorld;
  domain: TypeDomain;
  arity: number;              // 1,2,3,4...
  packing: { kind: "slots"; lanes: number }; // lanes === arity, always explicit
};
```

### CombineMode (canonical set you can implement immediately)

Keep this minimal-but-complete for “whole system” wiring; domain-specific legality is enforced by `SupportsCombine`.

```ts
type CombineMode =
  | "priority_last"        // writer wins (ordered)
  | "sum"                  // numeric add / vector component add
  | "min"
  | "max"
  | "mul"                  // numeric multiply / component-wise multiply
  | "or"                   // bool
  | "and"                  // bool
  | "xor"                  // bool
  | "blend_over";          // colors (premultiplied alpha over), fields supported
```

### BuilderIR (the lowering output that precedes schedule finalization)

```ts
type ValueSlot = number;
type SigExprId = number;
type FieldExprId = number;
type EventExprId = number;
type StepId = number;

type SlotMetaEntry = {
  slot: ValueSlot;
  storage: "f64" | "f32" | "i32" | "u32" | "object";
  offset: number;           // always present, dense layout = slot
  type: TypeDesc;
  debugName: string;        // always present (empty string allowed)
};

type BuilderIR = {
  patchId: string;
  compiledAt: number;
  irVersion: string;
  seed: number;

  types: TypeDesc[];        // or a richer table, but single source of truth
  slotMeta: SlotMetaEntry[];

  signalExprs: SignalExprTableIR;
  fieldExprs: FieldExprTableIR;
  eventExprs: EventExprTableIR;

  stateLayout: StateLayoutIR;

  // schedule skeleton (unordered or partially ordered), resolved in Pass 8
  steps: StepIR[];

  // render wiring (sinks bind to slots produced by renderAssemble)
  render: RenderIR;

  sourceMap: SourceMapIR;
};
```

### StepIR (minimal set you need for feedback + render wiring)

```ts
type StepIR =
  | StepTimeDerive
  | StepSignalEval
  | StepFieldEval
  | StepEventEval
  | StepStateRead
  | StepStateWrite
  | StepMaterializeColor
  | StepMaterializePath
  | StepRenderAssemble;

type StepBase = { id: StepId; deps: StepId[] };

type StepStateRead = StepBase & {
  kind: "stateRead";
  stateOffset: number;
  outSlot: ValueSlot;
};

type StepStateWrite = StepBase & {
  kind: "stateWrite";
  stateOffset: number;
  inSlot: ValueSlot;
};

// The key feedback rule is: stateRead always reads previous committed state (t-1)
// stateWrite is committed after the schedule completes for the frame.
```

* * *

Module layout (so engineers don’t invent structure)
---------------------------------------------------

```
src/compiler/
  patch/
    PatchIR.ts                 // PatchIR + Role + EdgeIR + BlockInstanceIR
    normalize/
      normalizePatch.ts        // Pass 5
      NormalGraph.ts
      expandCombine.ts
      expandDefaultSources.ts
      expandStateModifiers.ts
      expandBuses.ts
  types/
    TypeDesc.ts                // TypeDesc, worlds, domains, arity/packing
    constraints.ts             // typevars + constraint types + solver
    blockDefs.ts               // canonical block library + constraint emitters
  lowering/
    lowerGraph.ts              // Pass 7
    slotAllocator.ts
    emitExpr.ts
    emitSteps.ts
  schedule/
    buildSchedule.ts           // Pass 8 (deps + topo)
  program/
    CompiledProgramIR.ts       // Pass 9 output schema (single file)
    finalizeProgram.ts

src/runtime/
  state/
    RuntimeState.ts
    StateBuffer.ts
    EventStore.ts
    FrameCache.ts
  executor/
    ScheduleExecutor.ts
    steps/
      executeTimeDerive.ts
      executeSignalEval.ts
      executeFieldEval.ts
      executeEventEval.ts
      executeStateRead.ts
      executeStateWrite.ts
      executeMaterializeColor.ts
      executeMaterializePath.ts
      executeRenderAssemble.ts
  render/
    Canvas2DRenderer.ts        // renderFrame(RenderFrameIR, runtime.values)
```

* * *

Step 5–9 implementation order (what to code first)
--------------------------------------------------

1.  **Normalization (Pass 5) with CombineNode expansion**  
    Implement: `groupIncomingEdgesByInputPort()` → `emitCombineNode()` → rewrite edges.
2.  **Type system skeleton (Pass 6)**  
    Implement TypeDesc + solver with just `Eq`, `WorldIs`, `DomainIs`, `ArityIs`, `SupportsCombine`.  
    Add `SupportsCombine` legality table per `(world,domain,mode)`.
3.  **Slot allocator + SlotMeta emission (Pass 7)**  
    Deterministic slot assignment: incrementing counter, allocate `arity` slots per output, record SlotMetaEntry for each lane.
4.  **State feedback core (Pass 7 + 8 + runtime)**  
    Implement `stateRead/stateWrite` steps + runtime commit semantics.
5.  **Schedule deps (Pass 8)**  
    For each step, deps are the steps that write the slots it reads plus any required ordering constraints (e.g., stateWrite after computations).
6.  **FinalizeProgram (Pass 9)**  
    Freeze everything into `CompiledProgramIR` and delete all other schema entry points.

That is the plan for Steps 5–9 as a single mandatory architecture path.



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)