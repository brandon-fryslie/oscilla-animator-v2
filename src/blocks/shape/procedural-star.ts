/**
 * ProceduralStar Block
 *
 * Creates a star shape with N points.
 */

import { registerBlock } from '../registry';
import { canonicalType, canonicalMany, canonicalManyDef, payloadStride, floatConst, intConst, withInstance, instanceRef } from '../../core/canonical-types';
import { FLOAT, SHAPE, INT, VEC2 } from '../../core/canonical-types';
import { DOMAIN_CONTROL } from '../../core/domain-registry';
import { PathVerb, type PathTopologyDefInput } from '../../shapes/types';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { promoteToMany, resolveInputConstant } from '../lower-utils';

/**
 * Create a star path topology definition.
 *
 * A star is a closed path with 2*N vertices alternating between outer and inner radii.
 * Topology structure:
 * - MOVE to first outer vertex
 * - LINE to first inner vertex
 * - LINE to second outer vertex
 * - LINE to second inner vertex
 * - ... (alternating)
 * - CLOSE path
 *
 * @param points - Number of star points (must be >= 3)
 * @returns PathTopologyDef WITHOUT id field (id assigned by registry)
 */
function createStarTopology(points: number): PathTopologyDefInput {
  if (points < 3) {
    throw new Error(`Star must have at least 3 points, got ${points}`);
  }

  // Star with N points has 2*N vertices (alternating outer/inner)
  const totalVertices = points * 2;

  // Build verb sequence: MOVE, LINE, LINE, ..., CLOSE
  const verbs: PathVerb[] = [PathVerb.MOVE];
  for (let i = 1; i < totalVertices; i++) {
    verbs.push(PathVerb.LINE);
  }
  verbs.push(PathVerb.CLOSE);

  // Points per verb: MOVE=1, LINE=1, ..., CLOSE=0
  const pointsPerVerb: number[] = [1];  // MOVE
  for (let i = 1; i < totalVertices; i++) {
    pointsPerVerb.push(1);  // LINE
  }
  pointsPerVerb.push(0);  // CLOSE

  const totalControlPoints = totalVertices;

  return {
    params: [],  // No topology params for procedural stars
    closed: true,
    verbs,
    pointsPerVerb,
    totalControlPoints,
  };
}

/**
 * ProceduralStar - Creates a star shape with N points
 *
 * Generates a star shape with alternating outer and inner vertices on an ellipse.
 * The star is defined by:
 * - Topology: 2*N vertices alternating between outer/inner radii (compile-time)
 * - Control points: Field<vec2> with positions computed from radii (runtime)
 *
 * Outputs:
 * - shape: One<shape> with path topology + control point field
 * - controlPoints: Field<vec2> for control point positions (can be modified via FieldMap)
 *
 * Example usage:
 * ```
 * ProceduralStar(points=5, outerRadius=0.2, innerRadius=0.1) → Classic 5-pointed star
 * ProceduralStar(points=6, outerRadius=0.15, innerRadius=0.08) → Six-pointed star
 * ```
 */
export function register(): void {
  registerBlock({
    type: 'ProceduralStar',
    label: 'Star',
    category: 'shape',
    description: 'Creates a procedural star shape with alternating outer and inner radii',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      points: {
        label: 'Points',
        type: canonicalType(INT),
        defaultValue: 5,  // 5-pointed star by default
        defaultSource: defaultSourceConst(5),
        uiHint: { kind: 'slider', min: 3, max: 12, step: 1 },
      },
      outerRadius: {
        label: 'Outer Radius',
        type: canonicalType(FLOAT),
        defaultValue: 0.15,
        defaultSource: defaultSourceConst(0.15),
        uiHint: { kind: 'slider', min: 0.03, max: 0.25, step: 0.01 },
      },
      innerRadius: {
        label: 'Inner Radius',
        type: canonicalType(FLOAT),
        defaultValue: 0.06,
        defaultSource: defaultSourceConst(0.06),
        uiHint: { kind: 'slider', min: 0.02, max: 0.15, step: 0.01 },
      },
    },
    outputs: {
      shape: { label: 'Shape', type: canonicalType(SHAPE) },
      controlPoints: { label: 'Control Points', type: canonicalManyDef(VEC2, { kind: 'none' }) },
    },
    lower: ({ ctx, inputsById }) => {
      // Get points from input (must be compile-time constant)
      const pointsInput = inputsById.points;
      if (!pointsInput) throw new Error('ProceduralStar: points input not wired — normalization bug');
      const points = resolveInputConstant(ctx, pointsInput, 'points', { min: 3, max: 100 });
  
      // Create star topology (compile-time, without id field)
      const topology = createStarTopology(points);
  
      // Register topology and get assigned numeric ID
      const topologyId = ctx.b.registerTopology(topology, `star-${points}`);
  
      // Total vertices = 2 * points (alternating outer/inner)
      const totalVertices = points * 2;
  
      // Create instance over DOMAIN_CONTROL with 2*N control points
      // No shapeField - control points are internal data, not rendered directly
      const controlInstance = ctx.b.createInstance(
        DOMAIN_CONTROL,
        totalVertices,
        undefined,  // No shapeField (control points aren't rendered)
        'static'
      );
  
      // Build actual instance ref from created instance
      const ref = instanceRef(DOMAIN_CONTROL as string, controlInstance as string);
  
      // Use index to determine if outer (even) or inner (odd)
      const indexField = ctx.b.intrinsic('index',
        canonicalMany(INT, { kind: 'none' }, ref)
      );
  
      // Post-normalization: all inputs guaranteed wired — no fallback needed
      // [LAW:one-source-of-truth] inputs are the single source; config was a dead fallback
      const outerRadiusInput = inputsById.outerRadius;
      if (!outerRadiusInput) throw new Error('ProceduralStar: outerRadius input not wired — normalization bug');
      const outerRadiusSig = outerRadiusInput.id;
  
      const innerRadiusInput = inputsById.innerRadius;
      if (!innerRadiusInput) throw new Error('ProceduralStar: innerRadius input not wired — normalization bug');
      const innerRadiusSig = innerRadiusInput.id;
  
      const pointsSig = ctx.b.constant(intConst(points), canonicalType(INT));
  
      // ═══════════════════════════════════════════════════════════════════════
      // DECOMPOSED STAR VERTEX COMPUTATION (was starVertex kernel)
      // ═══════════════════════════════════════════════════════════════════════
      //
      // Original kernel logic:
      //   isOuter = floor(index) % 2 === 0
      //   radius = isOuter ? outerRadius : innerRadius
      //   angle = (index / (points * 2)) * 2π - π/2
      //   x = radius * cos(angle)
      //   y = radius * sin(angle)
      //   output = construct([x, y]) → vec2
      //
      // Now decomposed into explicit opcode sequences.
      // ═══════════════════════════════════════════════════════════════════════
  
      // Constants
      const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));
      const halfPi = ctx.b.constant(floatConst(Math.PI / 2), canonicalType(FLOAT));
      const two = ctx.b.constant(floatConst(2), canonicalType(FLOAT));
  
      // The field type for intermediates (float, same instance ref as index)
      const floatFieldType = canonicalMany(FLOAT, { kind: 'none' }, ref);
  
      // Step 1: broadcast single-instance values to field extent
      const pointsBroadcast = promoteToMany(pointsSig, floatFieldType, ctx.b);
      const outerRadiusBroadcast = promoteToMany(outerRadiusSig, floatFieldType, ctx.b);
      const innerRadiusBroadcast = promoteToMany(innerRadiusSig, floatFieldType, ctx.b);
      const twoPiBroadcast = promoteToMany(twoPi, floatFieldType, ctx.b);
      const halfPiBroadcast = promoteToMany(halfPi, floatFieldType, ctx.b);
      const twoBroadcast = promoteToMany(two, floatFieldType, ctx.b);
  
      // Step 2: Compute angle (same as polygon)
      // totalPoints = points * 2
      const mul = ctx.b.opcode(OpCode.Mul);
      const totalPoints = ctx.b.zipAuto([pointsBroadcast, twoBroadcast], mul, floatFieldType);
  
      // angleFrac = index / totalPoints
      const div = ctx.b.opcode(OpCode.Div);
      const angleFrac = ctx.b.zipAuto([indexField, totalPoints], div, floatFieldType);
  
      // angleScaled = angleFrac * 2π
      const angleScaled = ctx.b.zipAuto([angleFrac, twoPiBroadcast], mul, floatFieldType);
  
      // angle = angleScaled - π/2
      const sub = ctx.b.opcode(OpCode.Sub);
      const angle = ctx.b.zipAuto([angleScaled, halfPiBroadcast], sub, floatFieldType);
  
      // Step 3: Radius selection using Select opcode
      // indexFloor = floor(index)
      const floor = ctx.b.opcode(OpCode.Floor);
      const indexFloor = ctx.b.mapAuto(indexField, floor, floatFieldType);
  
      // indexMod2 = mod(indexFloor, 2)
      const mod = ctx.b.opcode(OpCode.Mod);
      const indexMod2 = ctx.b.zipAuto([indexFloor, twoBroadcast], mod, floatFieldType);
  
      // radius = select(indexMod2, innerRadius, outerRadius)
      // Select semantics: select(cond, ifTrue, ifFalse) → returns ifTrue when cond > 0
      // indexMod2 = 0 (outer): returns ifFalse = outerRadius
      // indexMod2 = 1 (inner): returns ifTrue = innerRadius
      const select = ctx.b.opcode(OpCode.Select);
      const radius = ctx.b.zipAuto([indexMod2, innerRadiusBroadcast, outerRadiusBroadcast], select, floatFieldType);
  
      // Step 4: Position computation
      const cos = ctx.b.opcode(OpCode.Cos);
      const sin = ctx.b.opcode(OpCode.Sin);
      const cosAngle = ctx.b.mapAuto(angle, cos, floatFieldType);
      const sinAngle = ctx.b.mapAuto(angle, sin, floatFieldType);
      const xField = ctx.b.zipAuto([radius, cosAngle], mul, floatFieldType);
      const yField = ctx.b.zipAuto([radius, sinAngle], mul, floatFieldType);
  
      // Step 5: construct([x, y]) → vec2
      const computedPositions = ctx.b.construct(
        [xField, yField],
        canonicalMany(VEC2, { kind: 'none' }, ref)
      );
  
      // Create shape reference with numeric topology ID
      const shapeRefSig = ctx.b.shapeRef(
        topologyId,
        [],  // No topology params
        canonicalType(SHAPE),
        computedPositions  // Control point field (just the ValueExprId now)
      );
  
      // Slot will be allocated by orchestrator
      // Slot will be allocated by orchestrator
      const shapeType = ctx.outTypes[0];
      // Rewrite controlPoints output type with actual instance ref
      const cpType = withInstance(ctx.outTypes[1], ref);
  
      return {
        outputsById: {
          shape: { id: shapeRefSig, slot: undefined, type: shapeType, stride: payloadStride(shapeType.payload) },
          controlPoints: { id: computedPositions, slot: undefined, type: cpType, stride: payloadStride(cpType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'shape', type: shapeType },
            { portId: 'controlPoints', type: cpType },
          ],
        },
        instanceContext: controlInstance,
      };
    },
  });
}
