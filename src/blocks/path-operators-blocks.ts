/**
 * Path Operator Blocks
 *
 * Blocks that operate on paths: field extraction, layout, etc.
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField, strideOf } from '../core/canonical-types';
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
 * along with computed per-point properties (index).
 * All outputs are over the DOMAIN_CONTROL domain (one value per control point).
 *
 * Outputs:
 * - position: Field<vec2> - control point positions (pass-through)
 * - index: Field<int> - control point index
 *
 * Future enhancements (not in MVP):
 * - tangent: Field<vec2> - tangent direction at each point
 * - arcLength: Field<float> - cumulative arc length (0 to 1 normalized)
 *
 * Note: This block operates on the controlPoints output from ProceduralPolygon/Star.
 *
 * Example usage:
 * ```
 * polygon = ProceduralPolygon(sides=5)
 * fields = PathField(controlPoints=polygon.controlPoints)
 * // fields.position contains the 5 vertex positions
 * // fields.index contains 0, 1, 2, 3, 4
 * ```
 */
registerBlock({
  type: 'PathField',
  label: 'Path Field',
  category: 'shape',
  description: 'Extract per-point properties from path control points',
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
    position: { label: 'Position', type: signalTypeField(VEC2, 'control') },
    index: { label: 'Index', type: signalTypeField(INT, 'control') },
  },
  lower: ({ ctx, inputsById }) => {
    const controlPointsInput = inputsById.controlPoints;
    if (!controlPointsInput || controlPointsInput.k !== 'field') {
      throw new Error('PathField requires a controlPoints field input');
    }

    const controlPointsFieldId = controlPointsInput.id as FieldExprId;

    // Position output is just a pass-through of the input
    const positionFieldId = controlPointsFieldId;

    // Get the instance ID from the control points field
    // We need to extract this from the field expression
    // For now, we'll use the inferred instance from the context
    const instance = ctx.inferredInstance ?? ctx.instance;
    if (!instance) {
      throw new Error('PathField requires instance context from control points field');
    }

    // Create index field
    const indexField = ctx.b.fieldIntrinsic(
      instance,
      'index',
      signalTypeField(INT, 'control')
    );

    const posSlot = ctx.b.allocSlot();
    const idxSlot = ctx.b.allocSlot();
    const posType = ctx.outTypes[0];
    const idxType = ctx.outTypes[1];

    return {
      outputsById: {
        position: { k: 'field', id: positionFieldId, slot: posSlot, type: posType, stride: strideOf(posType.payload) },
        index: { k: 'field', id: indexField, slot: idxSlot, type: idxType, stride: strideOf(idxType.payload) },
      },
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
      type: signalType(FLOAT),
      value: 0.15,
      defaultSource: defaultSourceConst(0.15),
      uiHint: { kind: 'slider', min: 0.01, max: 0.5, step: 0.01 },
    },
    count: {
      label: 'Count',
      type: signalType(INT),
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
      : ctx.b.sigConst((config?.radius as number) ?? 0.15, signalType(FLOAT));

    const phaseSig = ctx.b.sigConst(0, signalType(FLOAT));

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
    const zeroSig = ctx.b.sigConst(0, signalType(FLOAT));
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
