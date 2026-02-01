/**
 * ProceduralStar Block
 *
 * Creates a star shape with N points.
 */

import { registerBlock } from '../registry';
import { canonicalType, canonicalField, strideOf, floatConst, intConst, withInstance, instanceRef, requireInst } from '../../core/canonical-types';
import { FLOAT, INT, VEC2 } from '../../core/canonical-types';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { DOMAIN_CONTROL } from '../../core/domain-registry';
import { PathVerb, type PathTopologyDef } from '../../shapes/types';
import { registerDynamicTopology } from '../../shapes/registry';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';

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
function createStarTopology(points: number): Omit<PathTopologyDef, 'id'> {
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
    render: (ctx: CanvasRenderingContext2D, params: Record<string, number>) => {
      // Rendering will be handled by the unified path renderer
      // This function is a placeholder - actual rendering happens in Canvas2DRenderer
      throw new Error('PathTopologyDef render() should not be called directly - use Canvas2DRenderer');
    },
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
 * - shape: Signal<shape> with path topology + control point field
 * - controlPoints: Field<vec2> for control point positions (can be modified via FieldMap)
 *
 * Example usage:
 * ```
 * ProceduralStar(points=5, outerRadius=0.2, innerRadius=0.1) → Classic 5-pointed star
 * ProceduralStar(points=6, outerRadius=0.15, innerRadius=0.08) → Six-pointed star
 * ```
 */
registerBlock({
  type: 'ProceduralStar',
  label: 'Star',
  category: 'shape',
  description: 'Creates a procedural star shape with alternating outer and inner radii',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'signalOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    points: {
      label: 'Points',
      type: canonicalType(INT),
      value: 5,  // 5-pointed star by default
      defaultSource: defaultSourceConst(5),
      uiHint: { kind: 'slider', min: 3, max: 12, step: 1 },
    },
    outerRadius: {
      label: 'Outer Radius',
      type: canonicalType(FLOAT),
      value: 0.15,
      defaultSource: defaultSourceConst(0.15),
      uiHint: { kind: 'slider', min: 0.01, max: 0.5, step: 0.01 },
    },
    innerRadius: {
      label: 'Inner Radius',
      type: canonicalType(FLOAT),
      value: 0.06,
      defaultSource: defaultSourceConst(0.06),
      uiHint: { kind: 'slider', min: 0.01, max: 0.5, step: 0.01 },
    },
  },
  outputs: {
    shape: { label: 'Shape', type: canonicalType(FLOAT) },
    controlPoints: { label: 'Control Points', type: canonicalField(VEC2, { kind: 'scalar' }, { instanceId: makeInstanceId('control'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx, inputsById, config }) => {
    // Get points from config (must be compile-time constant)
    const points = (config?.points as number) ?? 5;
    if (points < 3) {
      throw new Error(`Star must have at least 3 points, got ${points}`);
    }

    // Create star topology (compile-time, without id field)
    const topology = createStarTopology(points);

    // Register topology and get assigned numeric ID
    const topologyId = registerDynamicTopology(topology, `star-${points}`);

    // Total vertices = 2 * points (alternating outer/inner)
    const totalVertices = points * 2;

    // Create instance over DOMAIN_CONTROL with 2*N control points
    const controlInstance = ctx.b.createInstance(
      DOMAIN_CONTROL,
      totalVertices,
      'static'
    );

    // Build actual instance ref from created instance
    const ref = instanceRef(DOMAIN_CONTROL as string, controlInstance as string);

    // Use index to determine if outer (even) or inner (odd)
    const indexField = ctx.b.intrinsic('index',
      canonicalField(INT, { kind: 'scalar' }, ref)
    );

    // Get outerRadius and innerRadius signals
    // Local-space convention: Default radii are unit scale (1.0 outer, 0.4 inner for nice star)
    const outerRadiusInput = inputsById.outerRadius;
    const outerRadiusSig = ('type' in outerRadiusInput! && requireInst(outerRadiusInput!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? outerRadiusInput!.id
      : ctx.b.constant(floatConst((config?.outerRadius as number) ?? 1.0), canonicalType(FLOAT));

    const innerRadiusInput = inputsById.innerRadius;
    const innerRadiusSig = ('type' in innerRadiusInput! && requireInst(innerRadiusInput!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? innerRadiusInput!.id
      : ctx.b.constant(floatConst((config?.innerRadius as number) ?? 0.4), canonicalType(FLOAT));

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
    const floatFieldType = canonicalField(FLOAT, { kind: 'scalar' }, ref);

    // Step 1: broadcast signals to field extent
    const pointsBroadcast = ctx.b.broadcast(pointsSig, floatFieldType);
    const outerRadiusBroadcast = ctx.b.broadcast(outerRadiusSig, floatFieldType);
    const innerRadiusBroadcast = ctx.b.broadcast(innerRadiusSig, floatFieldType);
    const twoPiBroadcast = ctx.b.broadcast(twoPi, floatFieldType);
    const halfPiBroadcast = ctx.b.broadcast(halfPi, floatFieldType);
    const twoBroadcast = ctx.b.broadcast(two, floatFieldType);

    // Step 2: Compute angle (same as polygon)
    // totalPoints = points * 2
    const mul = ctx.b.opcode(OpCode.Mul);
    const totalPoints = ctx.b.kernelZip([pointsBroadcast, twoBroadcast], mul, floatFieldType);

    // angleFrac = index / totalPoints
    const div = ctx.b.opcode(OpCode.Div);
    const angleFrac = ctx.b.kernelZip([indexField, totalPoints], div, floatFieldType);

    // angleScaled = angleFrac * 2π
    const angleScaled = ctx.b.kernelZip([angleFrac, twoPiBroadcast], mul, floatFieldType);

    // angle = angleScaled - π/2
    const sub = ctx.b.opcode(OpCode.Sub);
    const angle = ctx.b.kernelZip([angleScaled, halfPiBroadcast], sub, floatFieldType);

    // Step 3: Radius selection using Select opcode
    // indexFloor = floor(index)
    const floor = ctx.b.opcode(OpCode.Floor);
    const indexFloor = ctx.b.kernelMap(indexField, floor, floatFieldType);

    // indexMod2 = mod(indexFloor, 2)
    const mod = ctx.b.opcode(OpCode.Mod);
    const indexMod2 = ctx.b.kernelZip([indexFloor, twoBroadcast], mod, floatFieldType);

    // radius = select(indexMod2, innerRadius, outerRadius)
    // Select semantics: select(cond, ifTrue, ifFalse) → returns ifTrue when cond > 0
    // indexMod2 = 0 (outer): returns ifFalse = outerRadius
    // indexMod2 = 1 (inner): returns ifTrue = innerRadius
    const select = ctx.b.opcode(OpCode.Select);
    const radius = ctx.b.kernelZip([indexMod2, innerRadiusBroadcast, outerRadiusBroadcast], select, floatFieldType);

    // Step 4: Position computation
    const cos = ctx.b.opcode(OpCode.Cos);
    const sin = ctx.b.opcode(OpCode.Sin);
    const cosAngle = ctx.b.kernelMap(angle, cos, floatFieldType);
    const sinAngle = ctx.b.kernelMap(angle, sin, floatFieldType);
    const xField = ctx.b.kernelZip([radius, cosAngle], mul, floatFieldType);
    const yField = ctx.b.kernelZip([radius, sinAngle], mul, floatFieldType);

    // Step 5: construct([x, y]) → vec2
    const computedPositions = ctx.b.construct(
      [xField, yField],
      canonicalField(VEC2, { kind: 'scalar' }, ref)
    );

    // Create shape reference with numeric topology ID
    const shapeRefSig = ctx.b.shapeRef(
      topologyId,  // Numeric ID returned from registerDynamicTopology
      [],  // No topology params
      canonicalType(FLOAT),
      computedPositions  // Control point field (just the ValueExprId now)
    );

    const shapeSlot = ctx.b.allocSlot();
    const cpSlot = ctx.b.allocSlot();
    const shapeType = ctx.outTypes[0];
    // Rewrite controlPoints output type with actual instance ref
    const cpType = withInstance(ctx.outTypes[1], ref);

    return {
      outputsById: {
        shape: { id: shapeRefSig, slot: shapeSlot, type: shapeType, stride: strideOf(shapeType.payload) },
        controlPoints: { id: computedPositions, slot: cpSlot, type: cpType, stride: strideOf(cpType.payload) },
      },
      instanceContext: controlInstance,
    };
  },
});
