/**
 * Construct Block
 *
 * Construct a vec3 payload from three scalar components.
 * This is a type-CHANGING lens (float, float, float → vec3).
 *
 * Example: construct(1.0, 2.0, 3.0) → vec3(1, 2, 3)
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT, VEC3 } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const CONSTRUCT_CARD = cardinalityVar(cardinalityVarId('construct_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Construct',
    label: 'Construct Vec3',
    category: 'lens',
    description: 'Construct a vec3 from three scalar components (x, y, z)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      x: { label: 'X', type: canonicalType(FLOAT, undefined, { cardinality: CONSTRUCT_CARD }), defaultValue: 0.0 },
      y: { label: 'Y', type: canonicalType(FLOAT, undefined, { cardinality: CONSTRUCT_CARD }), defaultValue: 0.0 },
      z: { label: 'Z', type: canonicalType(FLOAT, undefined, { cardinality: CONSTRUCT_CARD }), defaultValue: 0.0 },
    },
    outputs: {
      out: { label: 'Out', type: canonicalType(VEC3, undefined, { cardinality: CONSTRUCT_CARD }) },
    },
    lower: ({ inputsById, ctx }) => {
      const xInput = inputsById.x;
      const yInput = inputsById.y;
      const zInput = inputsById.z;
  
      if (!xInput || !yInput || !zInput) {
        throw new Error('Construct requires all inputs (x, y, z)');
      }
  
      // [LAW:dataflow-not-control-flow] Adapter policy handles one→many broadcast before lowering.
      const outType = ctx.outTypes[0];
      const result = ctx.b.construct([xInput.id, yInput.id, zInput.id], outType);
  
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
