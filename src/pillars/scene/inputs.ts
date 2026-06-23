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

import type { ColorBinding, MaterialDef, PlanExpr, PlanInputChannel } from '../../render/scene-plan';

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
    default:
      // [LAW:types-are-the-program] A new PlanExpr kind is a compile error here
      //   until handled — it cannot silently fall through and drop an input
      //   channel from `render.inputs`.
      return assertNever(expr);
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
    default:
      // [LAW:types-are-the-program] A new color space is a compile error here
      //   until its channels are enumerated — never an undefined return.
      return assertNever(color);
  }
}

/**
 * The PlanExprs a material contributes to the plan's input set. A textured
 * material samples a texture (no PlanExpr-valued color), so it contributes none.
 *
 * [LAW:types-are-the-program] Exhaustive over the material union; a new material
 *   kind is a compile error here until its channels are declared.
 */
export function materialChannels(material: MaterialDef): readonly PlanExpr[] {
  switch (material.kind) {
    case 'unlitColor':
      return colorChannels(material.color);
    case 'texturedUnlit':
      return [];
    default:
      return assertNever(material);
  }
}

/**
 * Exhaustiveness guard: forces every union consumer above to handle every
 * member. Mirrors the renderer-side consumers (plan-expr-tsl.ts,
 * scene-plan-realizer.ts) so the ScenePlan's producer and consumer share the
 * same total-dispatch discipline.
 *
 * [LAW:single-enforcer] Both switches in this module route their unreachable
 *   arm through this one helper rather than each throwing ad hoc.
 */
function assertNever(value: never): never {
  throw new Error(`[scene] unhandled union member: ${JSON.stringify(value)}`);
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
