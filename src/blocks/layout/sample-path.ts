/**
 * SamplePath Block (Type 2 Sampling)
 *
 * Cross-instance path sampling: maps an array of instances onto a parametric
 * curve defined by upstream control points.
 *
 * Inputs:
 *   controlPoints — Field<vec2> from a shape-producing block (source instance domain)
 *   t             — Field<float> 0..1 parameter values (target instance domain)
 *
 * Outputs:
 *   position      — Field<vec2> sampled positions along the path (target domain)
 *   tangent       — Field<float> tangent angle at each sample point (target domain)
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, requireInst } from '../../core/canonical-types';
import { FLOAT, VEC2 } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import type { ValueExprId } from '../../compiler/ir/Indices';
import type { TopologyId } from '../../shapes/types';

// [LAW:one-source-of-truth] Cardinality behavior declared on port types, not external metadata.

// Source domain: control points from upstream shape
const SOURCE_CARD = cardinalityVar(cardinalityVarId('sample_path_source'), {
  relation: 'promoteToMany',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

// Target domain: sampling instances (t parameter and outputs share this)
const TARGET_CARD = cardinalityVar(cardinalityVarId('sample_path_target'), {
  relation: 'promoteToMany',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

/**
 * Find the topologyId for a given control point field by searching for
 * a shapeRef expression that references it.
 */
function findTopologyIdForField(builder: import('../../compiler/ir/BlockIRBuilder').BlockIRBuilder, controlPointFieldId: ValueExprId): TopologyId {
  const exprs = builder.getValueExprs();
  for (const expr of exprs) {
    if (expr.kind === 'shapeRef' && expr.controlPointField === controlPointFieldId) {
      return expr.topologyId;
    }
  }
  throw new Error(
    `SamplePath: Could not find topology for control points field. ` +
    `The controlPoints input must come from a shape-producing block (ProceduralPolygon, ProceduralStar, etc.)`
  );
}

export function register(): void {
  registerBlock({
    type: 'SamplePath',
    label: 'Sample Path',
    category: 'layout',
    description: 'Sample positions and tangents along a path at given parameter values (Type 2 sampling)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      controlPoints: {
        label: 'Control Points',
        type: inferType(VEC2, { kind: 'none' }, { cardinality: SOURCE_CARD }),
        defaulting: 'forbidden',
      },
      t: {
        label: 't',
        type: inferType(FLOAT, { kind: 'none' }, { cardinality: TARGET_CARD }),
        defaulting: 'forbidden',
      },
    },
    outputs: {
      position: {
        label: 'Position',
        type: inferType(VEC2, { kind: 'none' }, { cardinality: TARGET_CARD }),
      },
      tangent: {
        label: 'Tangent',
        type: inferType(FLOAT, { kind: 'none' }, { cardinality: TARGET_CARD }),
      },
    },
    lower: ({ ctx, inputsById }) => {
      const cpInput = inputsById.controlPoints;
      if (!cpInput || !('type' in cpInput && requireInst(cpInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
        throw new Error('SamplePath requires a field input for controlPoints');
      }

      const tInput = inputsById.t;
      if (!tInput || !('type' in tInput && requireInst(tInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
        throw new Error('SamplePath requires a field input for t');
      }

      // Resolve topology from upstream shape
      const topologyId = findTopologyIdForField(ctx.b, cpInput.id);

      // Target instance context comes from the t field
      const tCard = requireInst(tInput.type.extent.cardinality, 'cardinality');
      const targetInstanceId =
        tCard.kind === 'many'
          ? (typeof tCard.instance === 'object' ? tCard.instance.instanceId : tCard.instance)
          : (() => {
              throw new Error('SamplePath requires many cardinality for t');
            })();

      const posType = ctx.outTypes[0];
      const tanType = ctx.outTypes[1];

      // [LAW:dataflow-not-control-flow] Both outputs always computed via pathSample kernel
      const positionField = ctx.b.pathSample(cpInput.id, tInput.id, topologyId, 'position', posType);
      const tangentField = ctx.b.pathSample(cpInput.id, tInput.id, topologyId, 'tangentAngle', tanType);

      return {
        outputsById: {
          position: { id: positionField, slot: undefined, type: posType, stride: payloadStride(posType.payload) },
          tangent: { id: tangentField, slot: undefined, type: tanType, stride: payloadStride(tanType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'position', type: posType },
            { portId: 'tangent', type: tanType },
          ],
        },
        instanceContext: targetInstanceId,
      };
    },
  });
}
