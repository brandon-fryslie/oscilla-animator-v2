/**
 * ConstructVec2 Block
 *
 * Construct a vec2 payload from two scalar components.
 * This is a type-changing lens (float, float -> vec2).
 */

import { registerBlock } from '../registry';
import { payloadStride } from '../../core/canonical-types';
import { FLOAT, VEC2 } from '../../core/canonical-types';
import { inferType, unitVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const CONSTRUCT_VEC2_CARD = cardinalityVar(cardinalityVarId('construct_vec2_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'ConstructVec2',
    label: 'Construct Vec2',
    category: 'lens',
    description: 'Construct a vec2 from two scalar components (x, y)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      x: { label: 'X', type: inferType(FLOAT, unitVar('construct_vec2_u'), { cardinality: CONSTRUCT_VEC2_CARD }), defaultValue: 1.0 },
      y: { label: 'Y', type: inferType(FLOAT, unitVar('construct_vec2_u'), { cardinality: CONSTRUCT_VEC2_CARD }), defaultValue: 1.0 },
    },
    outputs: {
      out: { label: 'Out', type: inferType(VEC2, unitVar('construct_vec2_u'), { cardinality: CONSTRUCT_VEC2_CARD }) },
    },
    lower: ({ inputsById, ctx }) => {
      const xInput = inputsById.x;
      const yInput = inputsById.y;

      if (!xInput || !yInput) {
        throw new Error('ConstructVec2 requires both inputs (x, y)');
      }

      // [LAW:dataflow-not-control-flow] Adapter policy handles one->many broadcast
      // before lowering; constructAuto runs unconditionally.
      const outType = ctx.outTypes[0];
      const result = ctx.b.constructAuto([xInput.id, yInput.id], outType);

      return {
        outputsById: {
          out: { id: result, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'out', type: outType },
          ],
        },
      };
    },
  });
}
