/**
 * Path Operator Blocks
 *
 * Blocks that operate on paths: field extraction, layout, etc.
 */

import { registerBlock } from './registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../core/ids';
import { canonicalType, canonicalField, strideOf, floatConst, vec2Const, requireInst } from '../core/canonical-types';
import { domainTypeId as domainPath } from '../core/domain-registry';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
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
      type: canonicalField(VEC2, { kind: 'scalar' }, { instanceId: makeInstanceId('control'), domainTypeId: makeDomainTypeId('default') }),
    },
  },
  outputs: {
    position: { label: 'Position', type: canonicalField(VEC3, { kind: 'scalar' }, { instanceId: makeInstanceId('control'), domainTypeId: makeDomainTypeId('default') }) },
    index: { label: 'Index', type: canonicalField(INT, { kind: 'scalar' }, { instanceId: makeInstanceId('control'), domainTypeId: makeDomainTypeId('default') }) },
    tangent: { label: 'Tangent', type: canonicalField(VEC3, { kind: 'scalar' }, { instanceId: makeInstanceId('control'), domainTypeId: makeDomainTypeId('default') }) },
    arcLength: { label: 'Arc Length', type: canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('absolute'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx, inputsById }) => {
    const controlPointsInput = inputsById.controlPoints;
    if (!controlPointsInput || !('type' in controlPointsInput && requireInst(controlPointsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
      throw new Error('PathField requires a controlPoints field input');
    }

    const controlPointsFieldId = controlPointsInput.id;

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
    const vec2ToVec3Fn = ctx.b.kernel('vec2ToVec3');
    const positionFieldId = ctx.b.kernelZip(
      [controlPointsFieldId],
      vec2ToVec3Fn,
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
      tanType
    );

    // Create arc length field (MVP: cumulative Euclidean distance)
    const arcLengthField = ctx.b.pathDerivative(
      controlPointsFieldId,
      'arcLength',
      arcType
    );

    const posSlot = ctx.b.allocSlot();
    const idxSlot = ctx.b.allocSlot();
    const tanSlot = ctx.b.allocSlot();
    const arcSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        position: { id: positionFieldId, slot: posSlot, type: posType, stride: strideOf(posType.payload) },
        index: { id: indexField, slot: idxSlot, type: idxType, stride: strideOf(idxType.payload) },
        tangent: { id: tangentField, slot: tanSlot, type: tanType, stride: strideOf(tanType.payload) },
        arcLength: { id: arcLengthField, slot: arcSlot, type: arcType, stride: strideOf(arcType.payload) },
      },
      instanceContext: instance,
    };
  },
});
