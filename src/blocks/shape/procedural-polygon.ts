/**
 * ProceduralPolygon Block
 *
 * Creates a regular polygon with N sides.
 */

import { registerBlock } from '../registry';
import { canonicalType, canonicalMany, canonicalManyDef, payloadStride, floatConst, intConst, withInstance, instanceRef } from '../../core/canonical-types';
import { FLOAT, HANDLE, INT, VEC2 } from '../../core/canonical-types';
import { DOMAIN_CONTROL } from '../../core/domain-registry';
import { PathVerb, type PathTopologyDef, PathTopologyDefInput } from '../../shapes/types';
import { registerDynamicTopology } from '../../shapes/registry';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { resolveInputConstant } from '../lower-utils';

/**
 * Create a polygon path topology definition.
 *
 * A polygon is a closed path with N vertices connected by straight lines.
 * Topology structure:
 * - MOVE to first vertex
 * - LINE to each subsequent vertex
 * - CLOSE path
 *
 * @param sides - Number of sides (must be >= 3)
 * @returns PathTopologyDef WITHOUT id field (id assigned by registry)
 */
function createPolygonTopology(sides: number): PathTopologyDefInput {
  if (sides < 3) {
    throw new Error(`Polygon must have at least 3 sides, got ${sides}`);
  }

  // Build verb sequence: MOVE, LINE, LINE, ..., CLOSE
  const verbs: PathVerb[] = [PathVerb.MOVE];
  for (let i = 1; i < sides; i++) {
    verbs.push(PathVerb.LINE);
  }
  verbs.push(PathVerb.CLOSE);

  // Points per verb: MOVE=1, LINE=1, CLOSE=0
  const pointsPerVerb: number[] = [1];  // MOVE
  for (let i = 1; i < sides; i++) {
    pointsPerVerb.push(1);  // LINE
  }
  pointsPerVerb.push(0);  // CLOSE

  const totalControlPoints = sides;

  return {
    params: [],  // No topology params for procedural polygons
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
 * ProceduralPolygon - Creates a regular polygon with N sides
 *
 * Generates a polygon shape with evenly-spaced vertices on an ellipse.
 * The polygon is defined by:
 * - Topology: N vertices connected by LINE segments (compile-time)
 * - Control points: Field<vec2> with positions computed from radiusX/radiusY (runtime)
 *
 * Outputs:
 * - shape: One<shape> with path topology + control point field
 * - controlPoints: Field<vec2> for control point positions (can be modified via FieldMap)
 *
 * Example usage:
 * ```
 * ProceduralPolygon(sides=5, radiusX=0.2, radiusY=0.2) → Pentagon
 * ProceduralPolygon(sides=3, radiusX=0.1, radiusY=0.15) → Elliptical triangle
 * ```
 */
export function register(): void {
  registerBlock({
    type: 'ProceduralPolygon',
    label: 'Polygon',
    category: 'shape',
    description: 'Creates a procedural regular polygon with N sides',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      sides: {
        label: 'Sides',
        type: canonicalType(INT),
        defaultValue: 5,  // Pentagon by default
        defaultSource: defaultSourceConst(5),
        uiHint: { kind: 'slider', min: 3, max: 12, step: 1 },
      },
      radiusX: {
        label: 'Radius X',
        type: canonicalType(FLOAT),
        defaultValue: 0.1,
        defaultSource: defaultSourceConst(0.1),
        uiHint: { kind: 'slider', min: 0.01, max: 0.5, step: 0.01 },
      },
      radiusY: {
        label: 'Radius Y',
        type: canonicalType(FLOAT),
        defaultValue: 0.1,
        defaultSource: defaultSourceConst(0.1),
        uiHint: { kind: 'slider', min: 0.01, max: 0.5, step: 0.01 },
      },
    },
    outputs: {
      shape: { label: 'Shape', type: canonicalType(HANDLE) },
      controlPoints: { label: 'Control Points', type: canonicalManyDef(VEC2, { kind: 'none' }) },
    },
    lower: ({ ctx, inputsById }) => {
      // Get sides from input (must be compile-time constant)
      const sidesInput = inputsById.sides;
      if (!sidesInput) throw new Error('ProceduralPolygon: sides input not wired — normalization bug');
      const sides = resolveInputConstant(ctx, sidesInput, 'sides', { min: 3, max: 100 });
  
      // Create path topology (compile-time, without id field)
      const topology = createPolygonTopology(sides);
  
      // Register topology and get assigned numeric ID
      const topologyId = registerDynamicTopology(topology, `polygon-${sides}`);
  
      // Create instance over DOMAIN_CONTROL with N control points
      // No shapeField - control points are internal data, not rendered directly
      const controlInstance = ctx.b.createInstance(
        DOMAIN_CONTROL,
        sides,
        undefined,  // No shapeField (control points aren't rendered)
        'static'
      );
  
      // Build actual instance ref from created instance
      const ref = instanceRef(DOMAIN_CONTROL as string, controlInstance as string);
  
      // Use index to compute angle: angle = index * (2π / sides)
      const indexField = ctx.b.intrinsic('index',
        canonicalMany(INT, { kind: 'none' }, ref)
      );
  
      // Post-normalization: all inputs guaranteed wired — no fallback needed
      // [LAW:one-source-of-truth] inputs are the single source; config was a dead fallback
      const radiusXInput = inputsById.radiusX;
      if (!radiusXInput) throw new Error('ProceduralPolygon: radiusX input not wired — normalization bug');
      const radiusXSig = radiusXInput.id;
  
      const radiusYInput = inputsById.radiusY;
      if (!radiusYInput) throw new Error('ProceduralPolygon: radiusY input not wired — normalization bug');
      const radiusYSig = radiusYInput.id;
  
      const sidesSig = ctx.b.constant(intConst(sides), canonicalType(INT));
  
      // ═══════════════════════════════════════════════════════════════════════
      // DECOMPOSED POLYGON VERTEX COMPUTATION (was polygonVertex kernel)
      // ═══════════════════════════════════════════════════════════════════════
      //
      // Original kernel logic:
      //   angle = (index / sides) * 2π - π/2
      //   x = radiusX * cos(angle)
      //   y = radiusY * sin(angle)
      //   output = construct([x, y]) → vec2
      //
      // Now decomposed into explicit opcode sequences.
      // ═══════════════════════════════════════════════════════════════════════
  
      // Constants
      const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));
      const halfPi = ctx.b.constant(floatConst(Math.PI / 2), canonicalType(FLOAT));
  
      // The field type for intermediates (float, same instance ref as index)
      const floatFieldType = canonicalMany(FLOAT, { kind: 'none' }, ref);
  
      // Step 1: broadcast single-instance values to field extent
      const sidesBroadcast = ctx.b.broadcast(sidesSig, floatFieldType);
      const radiusXBroadcast = ctx.b.broadcast(radiusXSig, floatFieldType);
      const radiusYBroadcast = ctx.b.broadcast(radiusYSig, floatFieldType);
      const twoPiBroadcast = ctx.b.broadcast(twoPi, floatFieldType);
      const halfPiBroadcast = ctx.b.broadcast(halfPi, floatFieldType);
  
      // Step 2: angle = (index / sides) * 2π - π/2
      const div = ctx.b.opcode(OpCode.Div);
      const mul = ctx.b.opcode(OpCode.Mul);
      const sub = ctx.b.opcode(OpCode.Sub);
      const cos = ctx.b.opcode(OpCode.Cos);
      const sin = ctx.b.opcode(OpCode.Sin);
  
      const angleFrac = ctx.b.zipAuto([indexField, sidesBroadcast], div, floatFieldType);
      const angleScaled = ctx.b.zipAuto([angleFrac, twoPiBroadcast], mul, floatFieldType);
      const angle = ctx.b.zipAuto([angleScaled, halfPiBroadcast], sub, floatFieldType);
  
      // Step 3: x = radiusX * cos(angle), y = radiusY * sin(angle)
      const cosAngle = ctx.b.mapAuto(angle, cos, floatFieldType);
      const sinAngle = ctx.b.mapAuto(angle, sin, floatFieldType);
      const xField = ctx.b.zipAuto([radiusXBroadcast, cosAngle], mul, floatFieldType);
      const yField = ctx.b.zipAuto([radiusYBroadcast, sinAngle], mul, floatFieldType);
  
      // Step 4: construct([x, y]) → vec2
      const computedPositions = ctx.b.construct(
        [xField, yField],
        canonicalMany(VEC2, { kind: 'none' }, ref)
      );
  
      // Create shape reference with numeric topology ID
      const shapeRefSig = ctx.b.shapeRef(
        topologyId,  // Numeric ID returned from registerDynamicTopology
        [],  // No topology params
        canonicalType(HANDLE),
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
