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

