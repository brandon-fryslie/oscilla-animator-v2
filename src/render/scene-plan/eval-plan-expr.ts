/**
 * src/render/scene-plan/eval-plan-expr.ts
 *
 * The backend-neutral numeric interpreter of a `PlanExpr`: given this frame's
 * runtime channel values and the current value of every stateful cell, reduce one
 * expression to a `number`.
 *
 * This is the CPU sibling of the Three TSL translator (plan-expr-tsl.ts): both
 * interpret the *same* grammar, one into a GPU node graph, one into a number. The
 * renderer uses this one to advance renderer-owned state each frame — a state's
 * `update` rule `next = f(state(self), inputs)` is a PlanExpr evaluated here, and
 * the result is written back to the cell. [LAW:effects-at-boundaries] The
 * evaluation is pure (values in, value out); reading the prior cell values and
 * writing the next ones is the renderer's effect at the frame boundary.
 *
 * [LAW:one-source-of-truth] The op meanings here must agree with the TSL
 *   translator's — they are two realizations of one operator vocabulary. The
 *   agreement is asserted by tests, and the two op tables are kept structurally
 *   parallel so a divergence is visible.
 * [LAW:no-silent-failure] A missing channel/state value, or an operator that has
 *   no scalar-CPU meaning, is a loud throw — never a silent 0 that advances state
 *   to a wrong value while looking fine.
 */

import type { PlanBinaryOp, PlanExpr, PlanInputChannel, PlanUnaryOp } from './expr';
import type { StateRef } from './refs';

/**
 * What the evaluator needs to resolve the two non-local leaves:
 * - `input` reads this frame's value for a declared runtime channel;
 * - `state` reads the current value of a renderer-owned cell (the prior frame's
 *   value, when advancing a recurrence).
 *
 * [LAW:no-shared-mutable-globals] Both arrive as explicit parameters; the
 *   evaluator reads no ambient state.
 */
export interface PlanEvalContext {
  readonly channels: Readonly<Partial<Record<PlanInputChannel, number>>>;
  readonly states: Readonly<Record<StateRef, number>>;
}

// [LAW:dataflow-not-control-flow] Total op tables keyed by the operator, mirroring
// plan-expr-tsl.ts so the CPU and GPU realizations stay visibly parallel.
const UNARY_OPS: Record<PlanUnaryOp, (arg: number) => number> = {
  floor: (arg) => Math.floor(arg),
  sin: (arg) => Math.sin(arg),
  cos: (arg) => Math.cos(arg),
  negate: (arg) => -arg,
  fract: (arg) => arg - Math.floor(arg),
  // `hash` is a GPU-realized PCG bit-mix (plan-expr-tsl.ts owns its definition).
  // Duplicating that bit-mixing on the CPU would mint a second source of truth for
  // a value that only ever needs to exist on the GPU, so a state update rule may
  // not use it. [LAW:one-source-of-truth] [LAW:no-silent-failure]
  hash: () => {
    throw new Error(
      "eval-plan-expr: `hash` has no CPU evaluation — its definition lives in the GPU realization, so it may not appear in a stateful update rule",
    );
  },
};

const BINARY_OPS: Record<PlanBinaryOp, (lhs: number, rhs: number) => number> = {
  add: (lhs, rhs) => lhs + rhs,
  sub: (lhs, rhs) => lhs - rhs,
  mul: (lhs, rhs) => lhs * rhs,
  div: (lhs, rhs) => lhs / rhs,
  // GLSL/TSL `mod(x, y)` is `x - y*floor(x/y)`, which differs from JS `%` for
  // negative operands; match the GPU so both interpreters agree.
  mod: (lhs, rhs) => lhs - rhs * Math.floor(lhs / rhs),
  // TSL `step(edge, x)` → 1 when x >= edge, else 0; lhs is the edge.
  step: (lhs, rhs) => (rhs >= lhs ? 1 : 0),
  min: (lhs, rhs) => Math.min(lhs, rhs),
  max: (lhs, rhs) => Math.max(lhs, rhs),
};

/**
 * Evaluate one `PlanExpr` to a number.
 *
 * [LAW:types-are-the-program] Exhaustive over `PlanExpr.kind`; `assertNever` makes
 *   a future leaf a compile error rather than a silent fall-through.
 */
export function evalPlanExpr(expr: PlanExpr, ctx: PlanEvalContext): number {
  switch (expr.kind) {
    case 'const':
      return expr.value;
    case 'input':
      return resolveChannel(expr.channel, ctx);
    case 'state':
      return resolveState(expr.ref, ctx);
    case 'intrinsic':
      // `index`/`rank` are per-instance ordinals; a scalar state recurrence has no
      // instance, so an intrinsic here is a malformed update rule, not a 0.
      // [LAW:no-silent-failure]
      throw new Error(
        `eval-plan-expr: intrinsic '${expr.name}' has no value in a scalar state update rule (it is a per-instance ordinal)`,
      );
    case 'unary':
      return UNARY_OPS[expr.op](evalPlanExpr(expr.arg, ctx));
    case 'binary':
      return BINARY_OPS[expr.op](evalPlanExpr(expr.lhs, ctx), evalPlanExpr(expr.rhs, ctx));
    default:
      return assertNever(expr);
  }
}

function resolveChannel(channel: PlanInputChannel, ctx: PlanEvalContext): number {
  const value = ctx.channels[channel];
  if (value === undefined) {
    throw new Error(
      `eval-plan-expr: state update reads input channel '${channel}', but no value was provided for this frame`,
    );
  }
  return value;
}

function resolveState(ref: StateRef, ctx: PlanEvalContext): number {
  // A cell may legitimately hold 0, so probe presence rather than truthiness.
  if (!(ref in ctx.states)) {
    throw new Error(
      `eval-plan-expr: state update reads cell '${ref}', but it was not provided in the evaluation context`,
    );
  }
  return ctx.states[ref];
}

function assertNever(value: never): never {
  throw new Error(`eval-plan-expr: unhandled PlanExpr variant: ${JSON.stringify(value)}`);
}
