/**
 * Typed GPU-IR DSL — fully statically typed expression builder.
 *
 * Replaces the source-text-parsing DSL (walker + eval) with typed function calls
 * that construct ExprIR/StatementIR directly. JavaScript lacks operator overloading,
 * so arithmetic uses method chains: `a.add(b).mul(c)` instead of `(a + b) * c`.
 *
 * [LAW:one-source-of-truth] Types come from boundary-contract.ts via ir-builders.ts.
 * This module only wraps those builders with a fluent API.
 */

import type {
  ExprIR,
  StatementIR,
  WgslType,
  BinaryOp as BinaryOpType,
  BuiltinMathFunc,
  AtomicOp,
} from '../rust/boundary-contract';
import * as B from './ir-builders';

// ---------------------------------------------------------------------------
// E — typed expression wrapper
// ---------------------------------------------------------------------------

/** Coerce a raw number to an E (LiteralF32). */
function toE(v: E | number): E {
  return typeof v === 'number' ? new E(B.litF32(v)) : v;
}

/**
 * Expression node — wraps ExprIR with fluent arithmetic, comparison, and swizzle.
 *
 * Every method returns a new E (immutable). The underlying `ir` field holds the
 * raw ExprIR for direct consumption by compile.ts and boundary-contract.
 */
export class E {
  constructor(readonly ir: ExprIR) {}

  // -- Arithmetic --
  add(other: E | number): E { return new E(B.binop('+', this.ir, toE(other).ir)); }
  sub(other: E | number): E { return new E(B.binop('-', this.ir, toE(other).ir)); }
  mul(other: E | number): E { return new E(B.binop('*', this.ir, toE(other).ir)); }
  div(other: E | number): E { return new E(B.binop('/', this.ir, toE(other).ir)); }
  mod(other: E | number): E { return new E(B.binop('%', this.ir, toE(other).ir)); }
  neg(): E { return new E(B.unaryOp('-', this.ir)); }

  // -- Comparison --
  eq(other: E | number): E { return new E(B.binop('==', this.ir, toE(other).ir)); }
  ne(other: E | number): E { return new E(B.binop('!=', this.ir, toE(other).ir)); }
  lt(other: E | number): E { return new E(B.binop('<', this.ir, toE(other).ir)); }
  gt(other: E | number): E { return new E(B.binop('>', this.ir, toE(other).ir)); }
  le(other: E | number): E { return new E(B.binop('<=', this.ir, toE(other).ir)); }
  ge(other: E | number): E { return new E(B.binop('>=', this.ir, toE(other).ir)); }

  // -- Logical --
  and(other: E): E { return new E(B.binop('&&', this.ir, other.ir)); }
  or(other: E): E { return new E(B.binop('||', this.ir, other.ir)); }
  not(): E { return new E(B.unaryOp('!', this.ir)); }

  // -- Bitwise --
  bitor(other: E | number): E { return new E(B.binop('|', this.ir, toE(other).ir)); }
  bitand(other: E | number): E { return new E(B.binop('&', this.ir, toE(other).ir)); }
  bitxor(other: E | number): E { return new E(B.binop('^', this.ir, toE(other).ir)); }
  shl(other: E | number): E { return new E(B.binop('<<', this.ir, toE(other).ir)); }
  shr(other: E | number): E { return new E(B.binop('>>', this.ir, toE(other).ir)); }
  bitnot(): E { return new E(B.unaryOp('~', this.ir)); }

  // -- Swizzle --
  get x(): E { return new E(B.swizzle(this.ir, 'x')); }
  get y(): E { return new E(B.swizzle(this.ir, 'y')); }
  get z(): E { return new E(B.swizzle(this.ir, 'z')); }
  get w(): E { return new E(B.swizzle(this.ir, 'w')); }

  // -- Index access --
  at(index: E): E { return new E(B.indexAccess(this.ir, index.ir)); }

  // -- Cast --
  cast(type: WgslType): E { return new E(B.cast(type, this.ir)); }
}

// ---------------------------------------------------------------------------
// Literal constructors
// ---------------------------------------------------------------------------

/** Float literal (also accepts E passthrough). */
export function lit(value: number): E { return new E(B.litF32(value)); }
export function litU32(value: number): E { return new E(B.litU32(value)); }
export function litI32(value: number): E { return new E(B.litI32(value)); }
export function litBool(value: boolean): E { return new E(B.litBool(value)); }

// ---------------------------------------------------------------------------
// Cast / constructor functions
// ---------------------------------------------------------------------------

/** Cast to f32 (or f32 literal if given a number). */
export function f32(v: E | number): E {
  if (typeof v === 'number') return new E(B.litF32(v));
  return new E(B.cast('f32', v.ir));
}

export function u32(v: E | number): E {
  if (typeof v === 'number') return new E(B.litU32(v));
  return new E(B.cast('u32', v.ir));
}

export function i32(v: E | number): E {
  if (typeof v === 'number') return new E(B.litI32(v));
  return new E(B.cast('i32', v.ir));
}

/** vec2<f32> constructor. */
export function vec2(x: E | number, y: E | number): E {
  return new E(B.construct('vec2<f32>', [toE(x).ir, toE(y).ir]));
}

export function vec3(x: E | number, y: E | number, z: E | number): E {
  return new E(B.construct('vec3<f32>', [toE(x).ir, toE(y).ir, toE(z).ir]));
}

export function vec4(x: E | number, y: E | number, z: E | number, w: E | number): E {
  return new E(B.construct('vec4<f32>', [toE(x).ir, toE(y).ir, toE(z).ir, toE(w).ir]));
}

export function vec2i(x: E | number, y: E | number): E {
  const toI = (v: E | number) => typeof v === 'number' ? new E(B.litI32(v)) : v;
  return new E(B.construct('vec2<i32>', [toI(x).ir, toI(y).ir]));
}

export function vec3i(x: E | number, y: E | number, z: E | number): E {
  const toI = (v: E | number) => typeof v === 'number' ? new E(B.litI32(v)) : v;
  return new E(B.construct('vec3<i32>', [toI(x).ir, toI(y).ir, toI(z).ir]));
}

export function vec2u(x: E | number, y: E | number): E {
  const toU = (v: E | number) => typeof v === 'number' ? new E(B.litU32(v)) : v;
  return new E(B.construct('vec2<u32>', [toU(x).ir, toU(y).ir]));
}

export function mat4x4(...args: (E | number)[]): E {
  return new E(B.construct('mat4x4<f32>', args.map(a => toE(a).ir)));
}

// ---------------------------------------------------------------------------
// Builtin math functions
// ---------------------------------------------------------------------------

function builtin1(func: BuiltinMathFunc) {
  return (a: E | number): E => new E(B.callBuiltin(func, [toE(a).ir]));
}

function builtin2(func: BuiltinMathFunc) {
  return (a: E | number, b: E | number): E =>
    new E(B.callBuiltin(func, [toE(a).ir, toE(b).ir]));
}

function builtin3(func: BuiltinMathFunc) {
  return (a: E | number, b: E | number, c: E | number): E =>
    new E(B.callBuiltin(func, [toE(a).ir, toE(b).ir, toE(c).ir]));
}

// Trig
export const sin = builtin1('sin');
export const cos = builtin1('cos');
export const tan = builtin1('tan');
export const asin = builtin1('asin');
export const acos = builtin1('acos');
export const atan = builtin1('atan');
export const atan2 = builtin2('atan2');

// Exponential
export const exp = builtin1('exp');
export const log = builtin1('log');
export const pow = builtin2('pow');
export const sqrt = builtin1('sqrt');

// Arithmetic
export const abs = builtin1('abs');
export const min = builtin2('min');
export const max = builtin2('max');
export const clamp = builtin3('clamp');
export const mix = builtin3('mix');
export const step = builtin2('step');
export const smoothstep = builtin3('smoothstep');

// Rounding
export const sign = builtin1('sign');
export const fract = builtin1('fract');
export const ceil = builtin1('ceil');
export const floor = builtin1('floor');
export const round = builtin1('round');

// Vector
export const length = builtin1('length');
export const distance = builtin2('distance');
export const dot = builtin2('dot');
export const cross = builtin2('cross');
export const normalize = builtin1('normalize');
export const reflect = builtin2('reflect');
export const refract = builtin3('refract');

// Derivatives
export const fwidth = builtin1('fwidth');
export const dpdx = builtin1('dpdx');
export const dpdy = builtin1('dpdy');

// Noise / hash
export const hash_u32 = builtin1('hash_u32');
export const noise_simplex_2d = builtin1('noise_simplex_2d');
export const noise_simplex_3d = builtin1('noise_simplex_3d');

// ---------------------------------------------------------------------------
// Top-level binary op functions (for S-expression style)
// ---------------------------------------------------------------------------

export function add(a: E | number, b: E | number): E { return toE(a).add(b); }
export function sub(a: E | number, b: E | number): E { return toE(a).sub(b); }
export function mul(a: E | number, b: E | number): E { return toE(a).mul(b); }
export function div(a: E | number, b: E | number): E { return toE(a).div(b); }

// ---------------------------------------------------------------------------
// Texture ops
// ---------------------------------------------------------------------------

export function textureStore(textureId: string, coords: E, value: E): StatementIR {
  return B.textureStore_(textureId, coords.ir, value.ir);
}

export function textureLoad(textureId: string, coords: E): E {
  return new E(B.textureLoad(textureId, coords.ir));
}

export function textureSample(textureId: string, samplerId: string, uv: E): E {
  return new E(B.textureSample(textureId, samplerId, uv.ir));
}

// ---------------------------------------------------------------------------
// Scope — typed context for shader bodies
// ---------------------------------------------------------------------------

export interface Scope {
  /** VarRef shorthand: `$('name')` → E wrapping VarRef('name') */
  (name: string): E;

  /** Compute thread intrinsics */
  readonly thread: {
    readonly x: E;
    readonly y: E;
    readonly z: E;
  };

  /** Instance intrinsic */
  readonly instance: {
    readonly index: E;
  };

  /** Vertex index intrinsic */
  readonly vertexIndex: E;

  /** Load a global by symbol ID */
  global(symbolId: string): E;
  /** Load a scalar by symbol ID */
  scalar(symbolId: string): E;
  /** Load a domain field */
  field(symbolId: string, index: E): E;
  /** Load an atomic field */
  atomicField(symbolId: string, index: E): E;
  /** Load an atomic scalar */
  atomicScalar(symbolId: string): E;

  // -- Statement builders --

  /** Emit a `let` binding. Returns StatementIR. Use `$('name')` to reference it. */
  let(name: string, value: E): StatementIR;
  /** Emit a `var` declaration. */
  var(name: string, type: WgslType, value?: E): StatementIR;
  /** Assign to a var. */
  assign(target: E, value: E): StatementIR;

  /** Store to a global */
  storeGlobal(symbolId: string, value: E): StatementIR;
  /** Store to a scalar */
  storeScalar(symbolId: string, value: E): StatementIR;
  /** Store to a domain field */
  storeField(symbolId: string, index: E, value: E): StatementIR;

  /** Atomic op on a field */
  atomicOpField(op: AtomicOp, symbolId: string, index: E, value: E, assignResultTo?: string): StatementIR;
  /** Atomic op on a scalar */
  atomicOpScalar(op: AtomicOp, symbolId: string, value: E, assignResultTo?: string): StatementIR;

  /** If/else */
  if(condition: E, accept: readonly StatementIR[], reject?: readonly StatementIR[]): StatementIR;
  /** For loop */
  for(init: StatementIR, condition: E, update: StatementIR, body: readonly StatementIR[]): StatementIR;
  /** Break */
  break(): StatementIR;
  /** Continue */
  continue(): StatementIR;

  /** Return from vertex shader */
  returnVertex(position: E, varyings: Record<string, E>): StatementIR;
  /** Return from fragment shader */
  returnFragment(outputs: Record<string, E>): StatementIR;
}

/** Create a Scope instance — callable object with builder methods. */
export function createScope(): Scope {
  const ref = (name: string): E => new E(B.ref(name));

  const scope: Omit<Scope, keyof CallableFunction> = {
    thread: {
      get x() { return new E(B.intrinsic('global_invocation_id.x')); },
      get y() { return new E(B.intrinsic('global_invocation_id.y')); },
      get z() { return new E(B.intrinsic('global_invocation_id.z')); },
    },
    instance: {
      get index() { return new E(B.intrinsic('instance_index')); },
    },
    get vertexIndex() { return new E(B.intrinsic('vertex_index')); },

    global: (id: string) => new E(B.loadGlobal(id)),
    scalar: (id: string) => new E(B.loadScalar(id)),
    field: (id: string, index: E) => new E(B.loadField(id, index.ir)),
    atomicField: (id: string, index: E) => new E(B.atomicLoadField(id, index.ir)),
    atomicScalar: (id: string) => new E(B.atomicLoadScalar(id)),

    let: (name: string, value: E) => B.let_(name, value.ir),
    var: (name: string, type: WgslType, value?: E) => B.var_(name, type, value?.ir),
    assign: (target: E, value: E) => B.assign(target.ir, value.ir),

    storeGlobal: (id: string, value: E) => B.storeGlobal(id, value.ir),
    storeScalar: (id: string, value: E) => B.storeScalar(id, value.ir),
    storeField: (id: string, index: E, value: E) => B.storeField(id, index.ir, value.ir),

    atomicOpField: (op, id, index, value, assignResultTo?) =>
      B.atomicOpField(op, id, index.ir, value.ir, assignResultTo),
    atomicOpScalar: (op, id, value, assignResultTo?) =>
      B.atomicOpScalar(op, id, value.ir, assignResultTo),

    if: (condition: E, accept: readonly StatementIR[], reject?: readonly StatementIR[]) =>
      B.if_(condition.ir, accept, reject ?? []),
    for: (init: StatementIR, condition: E, update: StatementIR, body: readonly StatementIR[]) =>
      B.for_(init, condition.ir, update, body),
    break: () => B.break_(),
    continue: () => B.continue_(),

    returnVertex: (position: E, varyings: Record<string, E>) =>
      B.returnVertex(position.ir, mapValues(varyings)),
    returnFragment: (outputs: Record<string, E>) =>
      B.returnFragment(mapValues(outputs)),
  };

  return Object.assign(ref, scope) as unknown as Scope;
}

function mapValues(record: Record<string, E>): Record<string, ExprIR> {
  const out: Record<string, ExprIR> = {};
  for (const [k, v] of Object.entries(record)) out[k] = v.ir;
  return out;
}

// ---------------------------------------------------------------------------
// Typed body callback types
// ---------------------------------------------------------------------------

/** Compute shader body — receives scope, returns statements. */
export type TypedComputeBody = ($: Scope) => readonly StatementIR[];

/** Vertex shader body — receives scope + position E, returns statements. */
export type TypedVertexBody = ($: Scope, position: E) => readonly StatementIR[];

/** Fragment shader body — receives scope + varying names as E, returns statements. */
export type TypedFragmentBody = ($: Scope, ...varyings: E[]) => readonly StatementIR[];

// ---------------------------------------------------------------------------
// Note: Typed fixtures import structural helpers (gpu, compute, render, etc.)
// from './compile' and expression builders (E, sin, cos, etc.) from here.
// No re-exports — avoids circular dependency between compile.ts ↔ typed-dsl.ts.
// ---------------------------------------------------------------------------
