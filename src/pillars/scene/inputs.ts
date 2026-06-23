/**
 * src/pillars/scene/inputs.ts
 *
 * Derives the set of runtime input channels a ScenePlan reads, by walking every
 * `PlanExpr` it contains.
 *
 * [LAW:one-source-of-truth] `RenderPlan.inputs` is the renderer-facing list of
 *   channels to feed each frame. It is *derived* from the expressions that read
 *   them, not hand-declared on the patch where it could drift. The expressions
 *   are the single source of truth; this is their projection.
 * [LAW:dataflow-not-control-flow] The walk visits every node unconditionally and
 *   collects `input` leaves; channel membership is data, not a code path.
 */

import type { ColorBinding, PlanExpr, PlanInputChannel } from '../../render/scene-plan';

function collectFromExpr(expr: PlanExpr, into: Set<PlanInputChannel>): void {
  switch (expr.kind) {
    case 'const':
    case 'intrinsic':
      return;
    case 'input':
      into.add(expr.channel);
      return;
    case 'unary':
      collectFromExpr(expr.arg, into);
      return;
    case 'binary':
      collectFromExpr(expr.lhs, into);
      collectFromExpr(expr.rhs, into);
      return;
  }
}

/** The PlanExprs of a color binding, regardless of color space. */
export function colorChannels(color: ColorBinding): readonly PlanExpr[] {
  switch (color.space) {
    case 'hsl':
      return [color.h, color.s, color.l];
    case 'rgb':
      return [color.r, color.g, color.b];
    case 'rgba':
      return [color.r, color.g, color.b, color.a];
  }
}

/**
 * Collect the distinct runtime input channels referenced anywhere in the given
 * expressions, returned in a stable (sorted) order so the plan is deterministic.
 */
export function collectInputChannels(exprs: Iterable<PlanExpr>): readonly PlanInputChannel[] {
  const channels = new Set<PlanInputChannel>();
  for (const expr of exprs) collectFromExpr(expr, channels);
  return Array.from(channels).sort();
}
