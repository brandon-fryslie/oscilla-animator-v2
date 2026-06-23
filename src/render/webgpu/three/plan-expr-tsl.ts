/**
 * src/render/webgpu/three/plan-expr-tsl.ts
 *
 * Translates a backend-neutral `PlanExpr` into a Three TSL node graph.
 *
 * This is the renderer side of the seam established in
 * `src/render/scene-plan/expr.ts`: the compiler (ulu.3) produces `PlanExpr`s
 * from authored patch semantics; this module realizes one into the TSL
 * expression a `NodeMaterial` evaluates on the GPU.
 *
 * Scope source: design-docs/three-fork-integration-proposal.md §3
 *   ("Oscilla fields/expressions align with TSL expressions").
 * Capability tier: design-docs/three-fork-deltas.md §1 Tier B — backend-local
 *   composition on upstream TSL, NOT a fork delta.
 *
 * [LAW:effects-at-boundaries] This is a pure description→description mapping. It
 *   builds a TSL node graph (inert data) and performs no GPU work; the act of
 *   evaluating the graph happens in the renderer when it draws.
 * [LAW:dataflow-not-control-flow] Operator selection is a value lookup in a
 *   total table keyed by the op, not a branch ladder. A new `PlanUnaryOp` /
 *   `PlanBinaryOp` is a compile error here until its row is added, so consumers
 *   cannot silently miss a case.
 * [LAW:single-enforcer] This is the one place a `PlanExpr` becomes TSL. The
 *   scene-plan realizer and the renderer both go through `planExprToTSL`.
 */

import type { Node } from 'three/webgpu';
import { add, cos, div, floor, instanceIndex, mod, mul, negate, sin, sub, float } from 'three/tsl';

import type {
  PlanBinaryOp,
  PlanExpr,
  PlanInputChannel,
  PlanIntrinsic,
  PlanUnaryOp,
} from '../../scene-plan';

/**
 * A scalar TSL node. A `PlanExpr` is always scalar-valued: every leaf and
 * combinator in this module produces and consumes `float`-typed nodes, so the
 * whole translation unifies under one node type.
 */
export type TSLNode = Node<'float'>;

/**
 * What the translator needs from the surrounding scene to resolve the two
 * non-local leaf kinds:
 *
 * - `input` leaves resolve to a runtime-updated uniform node, supplied per
 *   declared channel by the realizer.
 * - `rank` is normalized against the instance count, so the count is needed to
 *   build `index / count`.
 *
 * [LAW:no-shared-mutable-globals] Both come in as explicit parameters; the
 *   translator reads no ambient renderer state.
 */
export interface PlanExprContext {
  /** Instance count of the domain this expression is evaluated over (>= 1). */
  readonly instanceCount: number;
  /** TSL uniform node per runtime input channel the render plan declared. */
  readonly inputs: Readonly<Partial<Record<PlanInputChannel, TSLNode>>>;
}

// [LAW:dataflow-not-control-flow] Total op tables. `Record<…Op, …>` makes every
// operator in the union mandatory, so exhaustiveness is enforced by the type.
const UNARY_OPS: Record<PlanUnaryOp, (arg: TSLNode) => TSLNode> = {
  floor: (arg) => floor(arg),
  sin: (arg) => sin(arg),
  cos: (arg) => cos(arg),
  negate: (arg) => negate(arg),
};

const BINARY_OPS: Record<PlanBinaryOp, (lhs: TSLNode, rhs: TSLNode) => TSLNode> = {
  add: (lhs, rhs) => add(lhs, rhs),
  sub: (lhs, rhs) => sub(lhs, rhs),
  mul: (lhs, rhs) => mul(lhs, rhs),
  div: (lhs, rhs) => div(lhs, rhs),
  mod: (lhs, rhs) => mod(lhs, rhs),
};

function intrinsicToTSL(name: PlanIntrinsic, ctx: PlanExprContext): TSLNode {
  // [LAW:dataflow-not-control-flow] `index` and `rank` are two values derived
  // from the same per-instance ordinal; both are expressed unconditionally.
  const index = float(instanceIndex);
  const INTRINSICS: Record<PlanIntrinsic, () => TSLNode> = {
    index: () => index,
    rank: () => div(index, float(ctx.instanceCount)),
  };
  return INTRINSICS[name]();
}

function resolveInput(channel: PlanInputChannel, ctx: PlanExprContext): TSLNode {
  const node = ctx.inputs[channel];
  // [LAW:no-silent-failure] A plan expression reading a channel the render plan
  // never declared in `render.inputs` is a contract break, surfaced loudly —
  // not silently defaulted to zero (which would render wrong but look fine).
  if (!node) {
    throw new Error(
      `plan-expr-tsl: PlanExpr reads input channel '${channel}', but it was not provided in the expression context (the render plan must declare it in render.inputs)`,
    );
  }
  return node;
}

/**
 * Translate one backend-neutral `PlanExpr` into a scalar TSL node.
 *
 * [LAW:types-are-the-program] The switch is exhaustive over `PlanExpr.kind`;
 *   `assertNever` makes a future variant a compile error rather than a silent
 *   fall-through.
 */
export function planExprToTSL(expr: PlanExpr, ctx: PlanExprContext): TSLNode {
  switch (expr.kind) {
    case 'const':
      return float(expr.value);
    case 'input':
      return resolveInput(expr.channel, ctx);
    case 'intrinsic':
      return intrinsicToTSL(expr.name, ctx);
    case 'unary':
      return UNARY_OPS[expr.op](planExprToTSL(expr.arg, ctx));
    case 'binary':
      return BINARY_OPS[expr.op](planExprToTSL(expr.lhs, ctx), planExprToTSL(expr.rhs, ctx));
    default:
      return assertNever(expr);
  }
}

function assertNever(value: never): never {
  throw new Error(`plan-expr-tsl: unhandled PlanExpr variant: ${JSON.stringify(value)}`);
}
