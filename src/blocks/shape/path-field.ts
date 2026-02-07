/**
 * PathField Block
 *
 * Extract per-point properties from path control points.
 */

import { registerBlock } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalType, canonicalField, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, INT, VEC2, VEC3 } from '../../core/canonical-types';
import type { ValueExprId } from '../../compiler/ir/Indices';
import type { TopologyId } from '../../shapes/types';

/**
 * Find the topologyId for a given control point field by searching for
 * a shapeRef expression that references it.
 *
 * @param builder - IRBuilder instance
 * @param controlPointFieldId - The field ID to search for
 * @returns The topologyId if found
 * @throws Error if no shapeRef is found
 */
function findTopologyIdForField(builder: import('../../compiler/ir/BlockIRBuilder').BlockIRBuilder, controlPointFieldId: ValueExprId): TopologyId {
  const exprs = builder.getValueExprs();
  for (const expr of exprs) {
    if (expr.kind === 'shapeRef' && expr.controlPointField === controlPointFieldId) {
      return expr.topologyId;
    }
  }
  throw new Error(
    `PathField: Could not find topology for control points field. ` +
    `The control points input must come from a shape-producing block (ProceduralPolygon, ProceduralStar, etc.)`
  );
}

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
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    controlPoints: {
      label: 'Control Points',
      // Use placeholder instance ID - will be replaced by actual instance from connected output
      type: canonicalField(VEC2, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }),
    },
  },
  outputs: {
    // Use placeholder instance IDs - will inherit actual instance from input via preserve cardinality
    position: { label: 'Position', type: canonicalField(VEC3, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    index: { label: 'Index', type: canonicalField(INT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    tangent: { label: 'Tangent', type: canonicalField(VEC3, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    arcLength: { label: 'Arc Length', type: canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx, inputsById }) => {
    const controlPointsInput = inputsById.controlPoints;
    if (!controlPointsInput || !('type' in controlPointsInput && requireInst(controlPointsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
      throw new Error('PathField requires a controlPoints field input');
    }

    const controlPointsFieldId = controlPointsInput.id;

    // Resolve topology ID from the shapeRef that produced this field
    const topologyId = findTopologyIdForField(ctx.b, controlPointsFieldId);

    // Get instance from context (inferred from input fields by lowering system)
    const instance = ctx.inferredInstance ?? ctx.instance;
    if (!instance) {
      throw new Error('PathField requires instance context from control points field');
    }

    const posType = ctx.outTypes[0];
    const idxType = ctx.outTypes[1];
    const tanType = ctx.outTypes[2];
    const arcType = ctx.outTypes[3];

    // Position output: convert VEC2 control points to VEC3 (z=0)
    // vec2ToVec3 logic: extract x and y, then construct vec3 with z=0
    const floatFieldType = { ...posType, payload: FLOAT, unit: { kind: 'scalar' as const } };
    const xField = ctx.b.extract(controlPointsFieldId, 0, floatFieldType);  // X component
    const yField = ctx.b.extract(controlPointsFieldId, 1, floatFieldType);  // Y component
    const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const zField = ctx.b.broadcast(const0, floatFieldType);  // Z = 0

    const positionFieldId = ctx.b.construct(
      [xField, yField, zField],
      posType
    );

    // Create index field
    const indexField = ctx.b.intrinsic('index',
      idxType
    );

    // Create tangent field (MVP: polygonal paths, linear approximation)
    // Outputs VEC3 (z=0) for compatibility with render pipeline
    const tangentField = ctx.b.pathDerivative(
      controlPointsFieldId,
      'tangent',
      topologyId,
      tanType
    );

    // Create arc length field (MVP: cumulative Euclidean distance)
    const arcLengthField = ctx.b.pathDerivative(
      controlPointsFieldId,
      'arcLength',
      topologyId,
      arcType
    );

    return {
      outputsById: {
        position: { id: positionFieldId, slot: undefined, type: posType, stride: payloadStride(posType.payload) },
        index: { id: indexField, slot: undefined, type: idxType, stride: payloadStride(idxType.payload) },
        tangent: { id: tangentField, slot: undefined, type: tanType, stride: payloadStride(tanType.payload) },
        arcLength: { id: arcLengthField, slot: undefined, type: arcType, stride: payloadStride(arcType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'position', type: posType },
          { portId: 'index', type: idxType },
          { portId: 'tangent', type: tanType },
          { portId: 'arcLength', type: arcType },
        ],
      },
      instanceContext: instance,
    };
  },
});
