/**
 * ScatterUV Block
 *
 * Generates low-discrepancy UV coordinates using a Halton sequence (bases 2, 3).
 * Replaces Grid.uv for texture mapping and noise sampling — provides better
 * spatial coverage than grid or random distributions.
 *
 * Inputs:
 *   index — Field<float> instance indices (determines Halton sequence position)
 *
 * Outputs:
 *   uv    — Field<vec2> Halton-based coordinates in [0,1]²
 */

import { registerBlock } from '../registry';
import { payloadStride } from '../../core/canonical-types';
import { VEC2, FLOAT } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Cardinality behavior declared on port types.
const SCATTER_FIELD_CARD = cardinalityVar(cardinalityVarId('scatter_uv_fields'), {
  relation: 'promoteToMany',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'ScatterUV',
    label: 'Scatter UV',
    category: 'layout',
    description: 'Generate low-discrepancy UV coordinates via Halton sequence (bases 2, 3)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      index: {
        label: 'Index',
        type: inferType(FLOAT, { kind: 'none' }, { cardinality: SCATTER_FIELD_CARD }),
        defaulting: 'forbidden',
      },
    },
    outputs: {
      uv: {
        label: 'UV',
        type: inferType(VEC2, { kind: 'none' }, { cardinality: SCATTER_FIELD_CARD }),
      },
    },
    lower: ({ ctx }) => {
      const uvType = ctx.outTypes[0];

      // [LAW:dataflow-not-control-flow] Always emit placement — basis kind determines algorithm.
      const uvField = ctx.b.placement('uv', 'halton2D', uvType);

      return {
        outputsById: {
          uv: { id: uvField, slot: undefined, type: uvType, stride: payloadStride(uvType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'uv', type: uvType },
          ],
        },
        instanceContext: ctx.inferredInstance,
      };
    },
  });
}
