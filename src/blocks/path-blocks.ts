/**
 * Path Blocks
 *
 * Blocks that create and manipulate path shapes.
 * Paths are defined by topology (verbs + control point count) and
 * control points (Field<vec2> over DOMAIN_CONTROL).
 */

import { registerBlock } from './registry';
import { canonicalType, canonicalField, strideOf, floatConst, vec2Const, intConst } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../core/ids';
import { DOMAIN_CONTROL } from '../core/domain-registry';
import { PathVerb, type PathTopologyDef } from '../shapes/types';
import { registerDynamicTopology } from '../shapes/registry';
import { defaultSourceConst } from '../types';

// =============================================================================
// Helper: Create Polygon Topology
// =============================================================================

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
function createPolygonTopology(sides: number): Omit<PathTopologyDef, 'id'> {
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

// =============================================================================
// ProceduralPolygon Block
// =============================================================================

/**
 * ProceduralPolygon - Creates a regular polygon with N sides
 *
 * Generates a polygon shape with evenly-spaced vertices on an ellipse.
 * The polygon is defined by:
 * - Topology: N vertices connected by LINE segments (compile-time)
 * - Control points: Field<vec2> with positions computed from radiusX/radiusY (runtime)
 *
 * Outputs:
 * - shape: Signal<shape> with path topology + control point field
 * - controlPoints: Field<vec2> for control point positions (can be modified via FieldMap)
 *
 * Example usage:
 * ```
 * ProceduralPolygon(sides=5, radiusX=0.2, radiusY=0.2) → Pentagon
 * ProceduralPolygon(sides=3, radiusX=0.1, radiusY=0.15) → Elliptical triangle
 * ```
 */
registerBlock({
  type: 'ProceduralPolygon',
  label: 'Polygon',
  category: 'shape',
  description: 'Creates a procedural regular polygon with N sides',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'signalOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    sides: {
      label: 'Sides',
      type: canonicalType(INT),
      value: 5,  // Pentagon by default
      defaultSource: defaultSourceConst(5),
      uiHint: { kind: 'slider', min: 3, max: 12, step: 1 },
    },
    radiusX: {
      label: 'Radius X',
      type: canonicalType(FLOAT),
      value: 0.1,
      defaultSource: defaultSourceConst(0.1),
      uiHint: { kind: 'slider', min: 0.01, max: 0.5, step: 0.01 },
    },
    radiusY: {
      label: 'Radius Y',
      type: canonicalType(FLOAT),
      value: 0.1,
      defaultSource: defaultSourceConst(0.1),
      uiHint: { kind: 'slider', min: 0.01, max: 0.5, step: 0.01 },
    },
  },
  outputs: {
    shape: { label: 'Shape', type: canonicalType(SHAPE) },
    controlPoints: { label: 'Control Points', type: canonicalField(VEC2, { kind: 'scalar' }, { instanceId: makeInstanceId('control'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx, inputsById, config }) => {
    // Get sides from config (must be compile-time constant)
    const sides = (config?.sides as number) ?? 5;
    if (sides < 3) {
      throw new Error(`Polygon must have at least 3 sides, got ${sides}`);
    }

    // Create path topology (compile-time, without id field)
    const topology = createPolygonTopology(sides);

    // Register topology and get assigned numeric ID
    const topologyId = registerDynamicTopology(topology, `polygon-${sides}`);

    // Create instance over DOMAIN_CONTROL with N control points
    const controlInstance = ctx.b.createInstance(
      DOMAIN_CONTROL,
      sides,
      'static'
    );

    // Use index to compute angle: angle = index * (2π / sides)
    const indexField = ctx.b.fieldIntrinsic(
      controlInstance,
      'index',
      canonicalField(INT, { kind: 'scalar' }, { instanceId: makeInstanceId('control'), domainTypeId: makeDomainTypeId('default') })
    );

    // Get radiusX and radiusY signals
    // Local-space convention: Default radius is 1.0 (unit local-space)
    const radiusXInput = inputsById.radiusX;
    const radiusXSig = radiusXInput?.k === 'sig'
      ? radiusXInput.id
      : ctx.b.sigConst(floatConst((config?.radiusX as number) ?? 1.0), canonicalType(FLOAT));

    const radiusYInput = inputsById.radiusY;
    const radiusYSig = radiusYInput?.k === 'sig'
      ? radiusYInput.id
      : ctx.b.sigConst(floatConst((config?.radiusY as number) ?? 1.0), canonicalType(FLOAT));

    const sidesSig = ctx.b.sigConst(intConst(sides), canonicalType(INT));

    // Compute control point positions using kernel
    // kernel('polygonVertex') takes: (index, sides, radiusX, radiusY) → vec2
    const polygonVertexFn = ctx.b.kernel('polygonVertex');
    const computedPositions = ctx.b.fieldZipSig(
      indexField,
      [sidesSig, radiusXSig, radiusYSig],
      polygonVertexFn,
      canonicalField(VEC2, { kind: 'scalar' }, { instanceId: makeInstanceId('control'), domainTypeId: makeDomainTypeId('default') })
    );

    // Create shape reference with numeric topology ID
    const shapeRefSig = ctx.b.sigShapeRef(
      topologyId,  // Numeric ID returned from registerDynamicTopology
      [],  // No topology params
      canonicalType(SHAPE),
      { id: computedPositions, stride: VEC2.stride }  // Control point field with stride
    );

    const shapeSlot = ctx.b.allocSlot();
    const cpSlot = ctx.b.allocSlot();
    const shapeType = ctx.outTypes[0];
    const cpType = ctx.outTypes[1];

    return {
      outputsById: {
        shape: { k: 'sig', id: shapeRefSig, slot: shapeSlot, type: shapeType, stride: strideOf(shapeType.payload) },
        controlPoints: { k: 'field', id: computedPositions, slot: cpSlot, type: cpType, stride: strideOf(cpType.payload) },
      },
      instanceContext: controlInstance,
    };
  },
});

// =============================================================================
// Helper: Create Star Topology
// =============================================================================

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

// =============================================================================
// ProceduralStar Block
// =============================================================================

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
    shape: { label: 'Shape', type: canonicalType(SHAPE) },
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

    // Use index to determine if outer (even) or inner (odd)
    const indexField = ctx.b.fieldIntrinsic(
      controlInstance,
      'index',
      canonicalField(INT, { kind: 'scalar' }, { instanceId: makeInstanceId('control'), domainTypeId: makeDomainTypeId('default') })
    );

    // Get outerRadius and innerRadius signals
    // Local-space convention: Default radii are unit scale (1.0 outer, 0.4 inner for nice star)
    const outerRadiusInput = inputsById.outerRadius;
    const outerRadiusSig = outerRadiusInput?.k === 'sig'
      ? outerRadiusInput.id
      : ctx.b.sigConst(floatConst((config?.outerRadius as number) ?? 1.0), canonicalType(FLOAT));

    const innerRadiusInput = inputsById.innerRadius;
    const innerRadiusSig = innerRadiusInput?.k === 'sig'
      ? innerRadiusInput.id
      : ctx.b.sigConst(floatConst((config?.innerRadius as number) ?? 0.4), canonicalType(FLOAT));

    const pointsSig = ctx.b.sigConst(intConst(points), canonicalType(INT));

    // Compute control point positions using kernel
    // kernel('starVertex') takes: (index, points, outerRadius, innerRadius) → vec2
    const starVertexFn = ctx.b.kernel('starVertex');
    const computedPositions = ctx.b.fieldZipSig(
      indexField,
      [pointsSig, outerRadiusSig, innerRadiusSig],
      starVertexFn,
      canonicalField(VEC2, { kind: 'scalar' }, { instanceId: makeInstanceId('control'), domainTypeId: makeDomainTypeId('default') })
    );

    // Create shape reference with numeric topology ID
    const shapeRefSig = ctx.b.sigShapeRef(
      topologyId,  // Numeric ID returned from registerDynamicTopology
      [],  // No topology params
      canonicalType(SHAPE),
      { id: computedPositions, stride: VEC2.stride }  // Control point field with stride
    );

    const shapeSlot = ctx.b.allocSlot();
    const cpSlot = ctx.b.allocSlot();
    const shapeType = ctx.outTypes[0];
    const cpType = ctx.outTypes[1];

    return {
      outputsById: {
        shape: { k: 'sig', id: shapeRefSig, slot: shapeSlot, type: shapeType, stride: strideOf(shapeType.payload) },
        controlPoints: { k: 'field', id: computedPositions, slot: cpSlot, type: cpType, stride: strideOf(cpType.payload) },
      },
      instanceContext: controlInstance,
    };
  },
});
