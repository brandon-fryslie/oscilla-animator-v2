/**
 * Path Operator Blocks
 *
 * Blocks that operate on paths: field extraction, layout, etc.
 */

import { registerBlock } from './registry';
import { canonicalType, signalTypeField, strideOf } from '../core/canonical-types';
import { domainTypeId } from '../core/domain-registry';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
import type { FieldExprId, SigExprId } from '../compiler/ir/Indices';
import { defaultSourceConst } from '../types';

// =============================================================================
// PathField Block
// =============================================================================

/**
 * PathField - Extract per-point properties from path control points
 *
 * Takes a path's control points field and exposes the control points
 * along with computed per-point properties (index, tangent, arc length).
 * All outputs are over the DOMAIN_CONTROL domain (one value per control point).
 *
 * Outputs:
 * - position: Field<vec3> - control point positions (z=0, converted from input vec2)
 * - index: Field<int> - control point index
 * - tangent: Field<vec3> - tangent direction at each point (z=0, MVP: polygonal paths)
 * - arcLength: Field<float> - cumulative arc length from first point
 *
 * MVP Limitations (Phase 1):
 * - Tangent assumes straight-line segments (polygonal paths)
 *   - Uses central difference: tangent[i] = (point[i+1] - point[i-1]) / 2
 *   - Exact for polygonal paths, linear approximation for bezier curves
 * - Arc length computed as cumulative Euclidean distance
 *   - Exact for polygonal paths, approximation for bezier curves
 * - Assumes closed path (tangent at endpoints wraps around)
 * - Tangent magnitude varies with point spacing
 *
 * Phase 2 Enhancements (Future):
 * - Accurate tangent for bezier curves (requires topology access)
 * - Accurate arc length via numerical integration
 * - Support for open (non-closed) paths
 * - Curvature computation
 *
 * Use Cases This Supports:
 * - Tangent visualization on ProceduralPolygon/Star
 * - Arc length for uniform speed along polygons
 * - Control point debugging via tangent vectors
 *
 * Example usage:
 * ```
 * polygon = ProceduralPolygon(sides=5)
 * fields = PathField(controlPoints=polygon.controlPoints)
 * // fields.position contains the 5 vertex positions
 * // fields.index contains 0, 1, 2, 3, 4
 * // fields.tangent contains tangent directions (polygonal approximation)
 * // fields.arcLength contains cumulative distances [0, d1, d1+d2, ...]
 * ```
 */
registerBlock({
  type: 'PathField',
  label: 'Path Field',
  category: 'shape',
  description: 'Extract per-point properties from path control points (MVP: polygonal paths)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    controlPoints: {
      label: 'Control Points',
      type: signalTypeField(VEC2, 'control'),
    },
  },
  outputs: {
    position: { label: 'Position', type: signalTypeField(VEC3, 'control') },
    index: { label: 'Index', type: signalTypeField(INT, 'control') },
    tangent: { label: 'Tangent', type: signalTypeField(VEC3, 'control') },
    arcLength: { label: 'Arc Length', type: signalTypeField(FLOAT, 'absolute') },
  },
  lower: ({ ctx, inputsById }) => {
    const controlPointsInput = inputsById.controlPoints;
    if (!controlPointsInput || controlPointsInput.k !== 'field') {
      throw new Error('PathField requires a controlPoints field input');
    }

    const controlPointsFieldId = controlPointsInput.id as FieldExprId;

    // Get instance from context (inferred from input fields by lowering system)
    const instance = ctx.inferredInstance ?? ctx.instance;
    if (!instance) {
      throw new Error('PathField requires instance context from control points field');
    }

    // Position output: convert VEC2 control points to VEC3 (z=0)
    const vec2ToVec3Fn = ctx.b.kernel('vec2ToVec3');
    const positionFieldId = ctx.b.fieldZip(
      [controlPointsFieldId],
      vec2ToVec3Fn,
      signalTypeField(VEC3, 'control')
    );

    // Create index field
    const indexField = ctx.b.fieldIntrinsic(
      instance,
      'index',
      signalTypeField(INT, 'control')
    );

    // Create tangent field (MVP: polygonal paths, linear approximation)
    // Outputs VEC3 (z=0) for compatibility with render pipeline
    const tangentField = ctx.b.fieldPathDerivative(
      controlPointsFieldId,
      'tangent',
      signalTypeField(VEC3, 'control')
    );

    // Create arc length field (MVP: cumulative Euclidean distance)
    const arcLengthField = ctx.b.fieldPathDerivative(
      controlPointsFieldId,
      'arcLength',
      signalTypeField(FLOAT, 'absolute')
    );

    const posSlot = ctx.b.allocSlot();
    const idxSlot = ctx.b.allocSlot();
    const tanSlot = ctx.b.allocSlot();
    const arcSlot = ctx.b.allocSlot();

    const posType = ctx.outTypes[0];
    const idxType = ctx.outTypes[1];
    const tanType = ctx.outTypes[2];
    const arcType = ctx.outTypes[3];

    return {
      outputsById: {
        position: { k: 'field', id: positionFieldId, slot: posSlot, type: posType, stride: strideOf(posType.payload) },
        index: { k: 'field', id: indexField, slot: idxSlot, type: idxType, stride: strideOf(idxType.payload) },
        tangent: { k: 'field', id: tangentField, slot: tanSlot, type: tanType, stride: strideOf(tanType.payload) },
        arcLength: { k: 'field', id: arcLengthField, slot: arcSlot, type: arcType, stride: strideOf(arcType.payload) },
      },
      instanceContext: instance,
    };
  },
});

// =============================================================================
// LayoutAlongPath Block
// =============================================================================

/**
 * LayoutAlongPath - Place instances at positions along a path (SIMPLIFIED MVP)
 *
 * For MVP: This block creates a simple even distribution of instances
 * along a circular path. Full path following with arbitrary control points
 * requires cross-domain field access which is a future enhancement.
 *
 * Inputs:
 * - radius: float - radius of circular path
 * - count: int - number of instances to place
 *
 * Outputs:
 * - positions: Field<vec2> - instance positions along circular path
 * - tangents: Field<vec2> - tangent directions (perpendicular to radius)
 * - t: Field<float> - normalized position parameter (0 to 1)
 *
 * Note: Full arbitrary path support requires kernel that can sample
 * control points from a different domain, which is not yet implemented.
 *
 * Example usage:
 * ```
 * layout = LayoutAlongPath(radius=0.2, count=20)
 * circles = Render(position=layout.positions, shape=Circle())
 * // Creates 20 circles evenly distributed around a circle
 * ```
 */
registerBlock({
  type: 'LayoutAlongPath',
  label: 'Layout Along Path',
  category: 'layout',
  description: 'Place instances evenly along a circular path (MVP version)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'transform',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    radius: {
      label: 'Radius',
      type: canonicalType(FLOAT),
      value: 0.15,
      defaultSource: defaultSourceConst(0.15),
      uiHint: { kind: 'slider', min: 0.01, max: 0.5, step: 0.01 },
    },
    count: {
      label: 'Count',
      type: canonicalType(INT),
      value: 10,
      defaultSource: defaultSourceConst(10),
      uiHint: { kind: 'slider', min: 1, max: 100, step: 1 },
    },
  },
  outputs: {
    positions: { label: 'Positions', type: signalTypeField(VEC2, 'default') },
    tangents: { label: 'Tangents', type: signalTypeField(VEC2, 'default') },
    t: { label: 'T', type: signalTypeField(FLOAT, 'default') },
  },
  lower: ({ ctx, inputsById, config }) => {
    // Get count from config
    const count = (config?.count as number) ?? 10;
    if (count < 1) {
      throw new Error(`LayoutAlongPath count must be at least 1, got ${count}`);
    }

    // Create instance for the layout positions
    const layoutInstance = ctx.b.createInstance(
      domainTypeId('default'),  // Use default domain for layout instances
      count,
      'static'
    );

    // Get normalized index for the layout instances (0 to 1)
    const normalizedIndexField = ctx.b.fieldIntrinsic(
      layoutInstance,
      'normalizedIndex',
      signalTypeField(FLOAT, 'default')
    );

    // The 't' output is just the normalized index
    const tField = normalizedIndexField;

    // Get radius signal
    const radiusInput = inputsById.radius;
    const radiusSig = radiusInput?.k === 'sig'
      ? radiusInput.id as SigExprId
      : ctx.b.sigConst((config?.radius as number) ?? 0.15, canonicalType(FLOAT));

    const phaseSig = ctx.b.sigConst(0, canonicalType(FLOAT));

    // Use circleLayout kernel to create positions
    const circleLayoutFn = ctx.b.kernel('circleLayout');
    const positionsField = ctx.b.fieldZipSig(
      normalizedIndexField,
      [radiusSig, phaseSig],
      circleLayoutFn,
      signalTypeField(VEC2, 'default')
    );

    // For tangents in MVP, we'll output a constant zero field
    // Full tangent calculation requires more complex field operations
    // Users can compute tangents manually if needed
    const zeroSig = ctx.b.sigConst(0, canonicalType(FLOAT));
    const zeroXField = ctx.b.Broadcast(zeroSig, signalTypeField(FLOAT, 'default'));
    const zeroYField = ctx.b.Broadcast(zeroSig, signalTypeField(FLOAT, 'default'));
    const makeVec2Fn = ctx.b.kernel('makeVec2');
    const tangentsField = ctx.b.fieldZip(
      [zeroXField, zeroYField],
      makeVec2Fn,
      signalTypeField(VEC2, 'default')
    );

    const posSlot = ctx.b.allocSlot();
    const tanSlot = ctx.b.allocSlot();
    const tSlot = ctx.b.allocSlot();
    const posType = ctx.outTypes[0];
    const tanType = ctx.outTypes[1];
    const tType = ctx.outTypes[2];

    return {
      outputsById: {
        positions: { k: 'field', id: positionsField, slot: posSlot, type: posType, stride: strideOf(posType.payload) },
        tangents: { k: 'field', id: tangentsField, slot: tanSlot, type: tanType, stride: strideOf(tanType.payload) },
        t: { k: 'field', id: tField, slot: tSlot, type: tType, stride: strideOf(tType.payload) },
      },
    };
  },
});
