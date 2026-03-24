# core/ids.ts

```typescript
// src/core/ids.ts
// Core-only branded IDs. No compiler imports in core depend on compiler modules.

export type Brand<K, T extends string> = K & { readonly __brand: T };

export type CardinalityVarId = Brand<string, 'CardinalityVarId'>;
export type TemporalityVarId = Brand<string, 'TemporalityVarId'>;
export type BindingVarId = Brand<string, 'BindingVarId'>;
export type PerspectiveVarId = Brand<string, 'PerspectiveVarId'>;
export type BranchVarId = Brand<string, 'BranchVarId'>;

export type InstanceId = Brand<string, 'InstanceId'>;
export type DomainTypeId = Brand<string, 'DomainTypeId'>;

export type BlockId = Brand<string, 'BlockId'>;
export type PortId = Brand<string, 'PortId'>;
export type WireId = Brand<string, 'WireId'>;

export type KernelId = Brand<string, 'KernelId'>;

export type ValueExprId = Brand<number, 'ValueExprId'>;
export type ValueSlot = Brand<number, 'ValueSlot'>;

// Factories (casts). Keep these tiny and boring.
export const cardinalityVarId = (s: string) => s as CardinalityVarId;
export const temporalityVarId = (s: string) => s as TemporalityVarId;
export const bindingVarId = (s: string) => s as BindingVarId;
export const perspectiveVarId = (s: string) => s as PerspectiveVarId;
export const branchVarId = (s: string) => s as BranchVarId;

export const instanceId = (s: string) => s as InstanceId;
export const domainTypeId = (s: string) => s as DomainTypeId;

export const blockId = (s: string) => s as BlockId;
export const portId = (s: string) => s as PortId;
export const wireId = (s: string) => s as WireId;

export const kernelId = (s: string) => s as KernelId;

export const valueExprId = (n: number) => n as ValueExprId;
export const valueSlot = (n: number) => n as ValueSlot;
```

# core/canonical-types.ts

```typescript
// src/core/canonical-types.ts
import { CardinalityVarId, TemporalityVarId, BindingVarId, PerspectiveVarId, BranchVarId } from './ids';

/**
 * CanonicalType is the ONLY type authority in the system:
 *   { payload, unit, extent } where extent has 5 axes.
 *
 * Signals/Fields/Events are NOT separate type systems.
 * They are derived classifications from CanonicalType.extent.
 */

/* ---------------------------------- */
/* Axis representation (var vs inst)  */
/* ---------------------------------- */

export type Axis<T, V> =
    | { readonly kind: 'var'; readonly var: V }
    | { readonly kind: 'inst'; readonly value: T };

export type CardinalityAxis   = Axis<CardinalityValue, CardinalityVarId>;
export type TemporalityAxis   = Axis<TemporalityValue, TemporalityVarId>;
export type BindingAxis   = Axis<BindingValue, BindingVarId>;
export type PerspectiveAxis  = Axis<PerspectiveValue, PerspectiveVarId>;
export type BranchAxis = Axis<BranchValue, BranchVarId>;

/* ---------------------------------- */
/* Instance reference                  */
/* ---------------------------------- */

export interface InstanceRef {
  readonly instanceId: InstanceId;
  readonly domainTypeId: DomainTypeId;
}

/* ---------------------------------- */
/* Axis value domains (closed sets)    */
/* ---------------------------------- */

export type CardinalityValue =
  | { readonly kind: 'zero' }
  | { readonly kind: 'one' }
  | { readonly kind: 'many'; readonly instance: InstanceRef };

export type TemporalityValue =
  | { readonly kind: 'continuous' }
  | { readonly kind: 'discrete' };

export type BindingValue =
  | { readonly kind: 'unbound' }
  | { readonly kind: 'weak' }
  | { readonly kind: 'strong' }
  | { readonly kind: 'identity' };

export type PerspectiveValue =
  | { readonly kind: 'default' };

export type BranchValue =
  | { readonly kind: 'default' };

/* ---------------------------------- */
/* Extent (5 axes)                     */
/* ---------------------------------- */

export interface Extent {
    readonly cardinality: CardinalityAxis;
    readonly temporality: TemporalityAxis;
    readonly binding: BindingAxis;
    readonly perspective: PerspectiveAxis;
    readonly branch: BranchAxis;
}

/* ---------------------------------- */
/* Payload domain (closed set)         */
/* ---------------------------------- */

export type PayloadType =
  | { readonly kind: 'float' }
  | { readonly kind: 'int' }
  | { readonly kind: 'bool' }
  | { readonly kind: 'vec2' }
  | { readonly kind: 'vec3' }
  | { readonly kind: 'color' }              // (r,g,b,a) in 0..1 unless unit says otherwise
  | { readonly kind: 'cameraProjection' };  // enum payload, literal is string (validated elsewhere)

/* ---------------------------------- */
/* Unit domain (closed set)            */
/* ---------------------------------- */

export type UnitType =
  | { readonly kind: 'none' } // for bool + pure dimensionless values where unit is meaningless
  | { readonly kind: 'scalar' }
  | { readonly kind: 'norm01' }
  | { readonly kind: 'angle'; readonly unit: 'radians' | 'degrees' | 'phase01' }
  | { readonly kind: 'time'; readonly unit: 'ms' | 'seconds' };

/* ---------------------------------- */
/* CanonicalType                        */
/* ---------------------------------- */

export interface CanonicalType {
  readonly payload: PayloadType;
  readonly unit: UnitType;
  readonly extent: Extent;
}

/* ---------------------------------- */
/* Canonical constructors (no ambiguity)*/
/* ---------------------------------- */

const DEFAULT_BINDING: BindingValue = { kind: 'unbound' };
const DEFAULT_PERSPECTIVE: PerspectiveValue = { kind: 'default' };
const DEFAULT_BRANCH: BranchValue = { kind: 'default' };

export function canonicalSignal(payload: PayloadType, unit: UnitType = { kind: 'scalar' }): CanonicalType {
  return {
    payload,
    unit,
    extent: {
      cardinality: axisInst({ kind: 'one' }),
      temporality: axisInst({ kind: 'continuous' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}

export function canonicalField(payload: PayloadType, unit: UnitType, instance: InstanceRef): CanonicalType {
  return {
    payload,
    unit,
    extent: {
      cardinality: axisInst({ kind: 'many', instance }),
      temporality: axisInst({ kind: 'continuous' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}

/**
 * Event type is a HARD invariant:
 *   payload=bool, unit=none, temporality=discrete.
 * Cardinality can be one OR many(instance).
 */
export function canonicalEventOne(): CanonicalType {
  return {
    payload: { kind: 'bool' },
    unit: { kind: 'none' },
    extent: {
      cardinality: axisInst({ kind: 'one' }),
      temporality: axisInst({ kind: 'discrete' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}

export function canonicalEventField(instance: InstanceRef): CanonicalType {
  return {
    payload: { kind: 'bool' },
    unit: { kind: 'none' },
    extent: {
      cardinality: axisInst({ kind: 'many', instance }),
      temporality: axisInst({ kind: 'discrete' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}

/* ---------------------------------- */
/* Derived classification helpers       */
/* ---------------------------------- */

export type DerivedKind = 'signal' | 'field' | 'event';

export function deriveKind(t: CanonicalType): DerivedKind {
  const card = t.extent.cardinality;
  const tempo = t.extent.temporality;

  if (tempo.kind === 'inst' && tempo.value.kind === 'discrete') return 'event';

  // continuous:
  if (card.kind === 'inst' && card.value.kind === 'many') return 'field';
  return 'signal';
}

export function getManyInstance(t: CanonicalType): InstanceRef | null {
  const card = t.extent.cardinality;
  if (card.kind !== 'inst') return null;
  if (card.value.kind !== 'many') return null;
  return card.value.instance;
}

export function assertSignalType(t: CanonicalType): void {
  const k = deriveKind(t);
  if (k !== 'signal') throw new Error(`Expected signal type, got ${k}`);
  const card = t.extent.cardinality;
  if (card.kind !== 'inst' || card.value.kind !== 'one') {
    throw new Error('Signal types must have cardinality=one (instantiated)');
  }
  const tempo = t.extent.temporality;
  if (tempo.kind !== 'inst' || tempo.value.kind !== 'continuous') {
    throw new Error('Signal types must have temporality=continuous (instantiated)');
  }
}

export function assertFieldType(t: CanonicalType): InstanceRef {
  const k = deriveKind(t);
  if (k !== 'field') throw new Error(`Expected field type, got ${k}`);
  const inst = getManyInstance(t);
  if (!inst) throw new Error('Field types must have cardinality=many(instance) (instantiated)');
  const tempo = t.extent.temporality;
  if (tempo.kind !== 'inst' || tempo.value.kind !== 'continuous') {
    throw new Error('Field types must have temporality=continuous (instantiated)');
  }
  return inst;
}

export function assertEventType(t: CanonicalType): void {
  const k = deriveKind(t);
  if (k !== 'event') throw new Error(`Expected event type, got ${k}`);
  if (t.payload.kind !== 'bool') throw new Error('Event payload must be bool');
  if (t.unit.kind !== 'none') throw new Error('Event unit must be none');
  const tempo = t.extent.temporality;
  if (tempo.kind !== 'inst' || tempo.value.kind !== 'discrete') {
    throw new Error('Event temporality must be discrete (instantiated)');
  }
}

/* ---------------------------------- */
/* Const value representation (safe)   */
/* ---------------------------------- */

/**
 * This is the key fix for "value shape disconnected from payload".
 * You do NOT store number|string|boolean.
 * You store a discriminated union keyed by the payload kind.
 */
export type ConstValue =
  | { readonly kind: 'float'; readonly value: number }
  | { readonly kind: 'int'; readonly value: number } // stored as number, validated integer if you care
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'vec2'; readonly value: readonly [number, number] }
  | { readonly kind: 'vec3'; readonly value: readonly [number, number, number] }
  | { readonly kind: 'color'; readonly value: readonly [number, number, number, number] }
  | { readonly kind: 'cameraProjection'; readonly value: string }; // validate membership in allowed set

export function constValueMatchesPayload(payload: PayloadType, v: ConstValue): boolean {
  return payload.kind === v.kind;
}

/* ---------------------------------- */
/* Stride (derived from payload only)  */
/* ---------------------------------- */

export function payloadStride(p: PayloadType): 1 | 2 | 3 | 4 {
  switch (p.kind) {
    case 'vec2': return 2;
    case 'vec3': return 3;
    case 'color': return 4;
    default: return 1;
  }
}
```

# compiler/ir-value-expr.js (authoritative expression table)

> This is the cleanest way to stop the “SigExpr/FieldExpr/EventExpr are separate type systems” drift. You can still keep your current tables as frontend conveniences, but the canonical definition should be this unified table, even if you don’t lower into it until later.

```typescript
// src/compiler/ir/value-expr.ts
import { CanonicalType, ConstValue } from '../../core/canonical-types';
import { KernelId, ValueExprId } from '../../core/ids';

/**
 * Unified ValueExpr table.
 * CanonicalType is the ONLY type authority for every expression.
 */
export type ValueExpr =
  | ValueExprConst
  | ValueExprExternal
  | ValueExprIntrinsic
  | ValueExprKernel
  | ValueExprState
  | ValueExprTime;

export interface ValueExprConst {
  readonly op: 'const';
  readonly type: CanonicalType;
  readonly value: ConstValue;
}

export interface ValueExprExternal {
  readonly op: 'external';
  readonly type: CanonicalType;
  readonly channel: string;
}

export type IntrinsicWhich =
  | 'index'
  | 'normIndex'
  | 'randomId'
  | 'uv'
  | 'rank'
  | 'seed';

export interface ValueExprIntrinsic {
  readonly op: 'intrinsic';
  readonly type: CanonicalType;
  readonly which: IntrinsicWhich;
}

/**
 * Kernel expressions cover both “signal kernels” and “field kernels”.
 * The differentiation is purely by CanonicalType.extent.
 */
export interface ValueExprKernel {
  readonly op: 'kernel';
  readonly type: CanonicalType;
  readonly kernelId: KernelId;
  readonly args: readonly ValueExprId[];
}

export type StateOp =
  | 'hold'
  | 'delay'
  | 'integrate'
  | 'slew'
  | 'preserve'
  | 'crossfade'
  | 'project';

export interface ValueExprState {
  readonly op: 'state';
  readonly type: CanonicalType;
  readonly stateOp: StateOp;
  readonly args: readonly ValueExprId[];
}

/**
 * Time is still “just a value”.
 * Your backend can derive special time models, but the IR type remains CanonicalType.
 */
export interface ValueExprTime {
  readonly op: 'time';
  readonly type: CanonicalType; // must be continuous
  readonly which: 'tMs' | 'dtMs' | 'phaseA' | 'phaseB';
}
```

# compiler/frontend/axis-validate.ts (single enforcement point)

> This is the “belt buckle” that prevents nonsense from ever entering backend, without polluting builders or runtime with scattered checks.

```typescript
// src/compiler/frontend/axis-validate.ts
import {
  CanonicalType,
  assertEventType,
  assertFieldType,
  assertSignalType,
  deriveKind,
} from '../../core/canonical-types';
import { ValueExpr } from '../ir/value-expr';

export interface AxisViolation {
  readonly exprIndex: number;
  readonly op: string;
  readonly message: string;
}

export function validateAxes(exprs: readonly ValueExpr[]): AxisViolation[] {
  const out: AxisViolation[] = [];

  for (let i = 0; i < exprs.length; i++) {
    const e = exprs[i];

    try {
      validateExpr(e);
    } catch (err) {
      out.push({
        exprIndex: i,
        op: e.op,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return out;
}

function validateExpr(e: ValueExpr): void {
  // Core family invariants are derived from CanonicalType:
  const k = deriveKind(e.type);

  // Enforce family invariants.
  if (k === 'signal') assertSignalType(e.type);
  else if (k === 'field') assertFieldType(e.type);
  else assertEventType(e.type);

  // Then kind-specific invariants (only where truly mandatory).
  switch (e.op) {
    case 'time':
      // Must be continuous signal (not field/event).
      assertSignalType(e.type);
      break;
    case 'const':
      // Shape is guaranteed by ConstValue union + payload check elsewhere,
      // but keep a defensive check.
      if (e.type.payload.kind !== e.value.kind) {
        throw new Error(`Const payload mismatch: type=${e.type.payload.kind} value=${e.value.kind}`);
      }
      break;
    default:
      // nothing mandatory here
      break;
  }
}
```

# adapters/lenses schema (BlockDef metadata)

> This is only here because you’ve already committed to adapter insertion as UX, but you still want it fully type-safe and fully CanonicalType-based.

```typescript
// src/blocks/adapter-spec.ts
import { CanonicalType, Extent, PayloadType, UnitType } from '../core/canonical-types';

export type ExtentPattern =
  | 'any'
  | Partial<{ [K in keyof Extent]: Extent[K] }>; // match instantiated or var shapes if you use vars

export type ExtentTransform =
  | 'preserve'
  | Partial<{ [K in keyof Extent]: Extent[K] }>;

export interface TypePattern {
  readonly payload: PayloadType | 'same';
  readonly unit: UnitType | 'same';
  readonly extent: ExtentPattern;
}

export interface AdapterSpec {
  readonly from: TypePattern;
  readonly to: {
    readonly payload: PayloadType | 'same';
    readonly unit: UnitType | 'same';
    readonly extent: ExtentTransform;
  };
  readonly purity: 'pure';
  readonly stability: 'stable';
}

/**
 * IMPORTANT: adapter insertion never “changes rules”.
 * It only inserts explicit blocks whose I/O types already satisfy CanonicalType rules.
 */
```

The invariants this type set makes impossible to violate accidentally
•	You cannot store “const cameraProjection” as a random string without it being explicitly { kind:'cameraProjection', value:'...' }.
•	You cannot “forget to type EventExpr” because every ValueExpr has type: CanonicalType.
•	You cannot carry instanceId on FieldExpr nodes because instance identity lives only in type.extent.cardinality.
•	You cannot have “field with cardinality=one” once you run exactly one validator pass that enforces the axis shapes.
•	You cannot drift into “signals with cardinality many” unless you intentionally allow it (this design does not).

That is the authoritative type set you can adapt the codebase around without repainting yourself into a corner.