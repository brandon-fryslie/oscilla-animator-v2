/**
 * src/render/scene-plan/expr.ts
 *
 * Backend-neutral per-value expressions for the compiled ScenePlan.
 *
 * Scope source: design-docs/three-fork-integration-proposal.md §3 (Oscilla
 * fields/expressions align with TSL expressions), §4.4.
 * Proof target: design-docs/three-migration-first-proof-contract.md
 *   ("pure math expressions for grid layout and rotation").
 *
 * A PlanExpr is a serializable description of how one scalar value is computed
 * from runtime inputs and per-instance intrinsics. It is NOT a renderer object:
 * the Three backend (ulu.2) translates a PlanExpr into a TSL node graph; the
 * compiler (ulu.3) produces PlanExprs from authored patch semantics.
 *
 * [LAW:effects-at-boundaries] The plan carries a *description* of the
 *   computation, not the computation itself. The act of evaluating it (in TSL,
 *   on the GPU) happens behind the renderer seam.
 * [LAW:dataflow-not-control-flow] A PlanExpr's structure mirrors its data flow;
 *   `kind` is the single discriminant and variability lives in the operands.
 * [LAW:no-mode-explosion] The operator vocabulary is sized to the demo patches
 *   the first proof targets require (Grid of Squares, Spirograph, Kaleidoscope).
 *   New operators are added to these unions; consumers stay exhaustive.
 */

/**
 * A runtime-updated scalar input channel the plan may read.
 *
 * [LAW:one-source-of-truth] These mirror the runtime input envelope (see
 *   src/render/types.ts RuntimeInputSignalContract) by semantic name, so the
 *   renderer can bind a channel to the per-frame value without the plan
 *   coupling to the worker transport shape.
 *
 * `time` is the only channel the first proof target (Grid of Squares) requires;
 * the rest mirror the existing runtime envelope for later patches.
 */
export type PlanInputChannel =
  | 'time'
  | 'mouseX'
  | 'mouseY'
  | 'mouseButtons'
  | 'audioLow'
  | 'audioMid'
  | 'audioHigh'
  | 'gaugeActive';

/**
 * A per-instance Field intrinsic. `index` is the integer instance ordinal;
 * `rank` is the normalized [0, 1) position of the instance within its domain.
 */
export type PlanIntrinsic = 'index' | 'rank';

/** Single-operand math operators. */
export type PlanUnaryOp = 'floor' | 'sin' | 'cos' | 'negate';

/**
 * Two-operand math operators.
 *
 * `step` is the threshold primitive: `step(edge, x)` is `1` when `x >= edge`,
 * else `0`. It is what turns a smooth per-instance field into a boolean
 * show/hide decision — the Conditional Visibility demo's "opacity is a material
 * binding" claim is unrepresentable without it, and a smooth fade would be a
 * dishonest stand-in. [LAW:no-mode-explosion] One operator, every consumer kept
 * exhaustive; no flag selects "threshold mode".
 */
export type PlanBinaryOp = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'step';

/**
 * A backend-neutral scalar expression.
 *
 * The `input` vs `const` split structurally encodes the proof-contract
 * requirement that time is "a runtime-updated input channel, not a
 * compile-time constant": a runtime value is `input`, a baked value is `const`,
 * and they are different shapes rather than a flag on one shape.
 */
export type PlanExpr =
  | { readonly kind: 'const'; readonly value: number }
  | { readonly kind: 'input'; readonly channel: PlanInputChannel }
  | { readonly kind: 'intrinsic'; readonly name: PlanIntrinsic }
  | { readonly kind: 'unary'; readonly op: PlanUnaryOp; readonly arg: PlanExpr }
  | {
      readonly kind: 'binary';
      readonly op: PlanBinaryOp;
      readonly lhs: PlanExpr;
      readonly rhs: PlanExpr;
    };

// ---------------------------------------------------------------------------
// Builders — terse constructors for readable plan construction and tests.
// ---------------------------------------------------------------------------

export const konst = (value: number): PlanExpr => ({ kind: 'const', value });
export const input = (channel: PlanInputChannel): PlanExpr => ({ kind: 'input', channel });
export const intrinsic = (name: PlanIntrinsic): PlanExpr => ({ kind: 'intrinsic', name });

const unary = (op: PlanUnaryOp) => (arg: PlanExpr): PlanExpr => ({ kind: 'unary', op, arg });
const binary =
  (op: PlanBinaryOp) =>
  (lhs: PlanExpr, rhs: PlanExpr): PlanExpr => ({ kind: 'binary', op, lhs, rhs });

export const floor = unary('floor');
export const sin = unary('sin');
export const cos = unary('cos');
export const negate = unary('negate');

export const add = binary('add');
export const sub = binary('sub');
export const mul = binary('mul');
export const div = binary('div');
export const mod = binary('mod');
/** `step(edge, x)` → `1` when `x >= edge`, else `0`. */
export const step = binary('step');
