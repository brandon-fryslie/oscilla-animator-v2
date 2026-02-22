/**
 * DomainIndex Block
 *
 * Provides the normalized index [0,1] for each domain element.
 */

import { registerBlock } from '../registry';
import { payloadStride, FLOAT, INT } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] DomainIndex field outputs share one declared cardinality policy.
const DOMAIN_INDEX_CARD = cardinalityVar(cardinalityVarId('domain_index_fields'), {
  relation: 'uniform',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'DomainIndex',
    label: 'Domain Index',
    category: 'domain',
    description: 'Provides the normalized index [0,1] for each domain element',
    form: 'primitive',
    capability: 'identity',
    inputs: {},
    outputs: {
      index: { label: 'Index', type: inferType(FLOAT, { kind: 'none' }, { cardinality: DOMAIN_INDEX_CARD }) },
      indexInt: { label: 'Index (int)', type: inferType(INT, { kind: 'none' }, { cardinality: DOMAIN_INDEX_CARD }) },
    },
    lower: ({ ctx }) => {
      // Get instance context from Array block or inferred from inputs
      const instance = ctx.inferredInstance;
      if (!instance) throw new Error('DomainIndex: instance inference failed — field block requires inferredInstance');
  
      const indexType = ctx.outTypes[0];
      const indexIntType = ctx.outTypes[1];
  
      // Create field expressions that expose instance index
      const indexField = ctx.b.intrinsic('normalizedIndex', indexType);
      const indexIntField = ctx.b.intrinsic('index', indexIntType);
  
      // Slot will be allocated by orchestrator
      // Slot will be allocated by orchestrator
  
      return {
        outputsById: {
          index: { id: indexField, slot: undefined, type: indexType, stride: payloadStride(indexType.payload) },
          indexInt: { id: indexIntField, slot: undefined, type: indexIntType, stride: payloadStride(indexIntType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'index', type: indexType },
            { portId: 'indexInt', type: indexIntType },
          ],
        },
      };
    },
  });
}
