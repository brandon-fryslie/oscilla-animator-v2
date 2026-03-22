/**
 * InstanceDomain Block
 *
 * Provides per-element domain identity: rank (normalized [0,1]) and index (raw integer).
 */

import { registerBlock } from '../registry';
import { payloadStride, FLOAT, INT } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] InstanceDomain field outputs share one declared cardinality policy.
const INSTANCE_DOMAIN_CARD = cardinalityVar(cardinalityVarId('instance_domain_fields'), {
  relation: 'uniform',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'InstanceDomain',
    label: 'Instance Domain',
    category: 'domain',
    description: 'Provides per-element domain identity: rank and index',
    form: 'primitive',
    capability: 'identity',
    inputs: {},
    outputs: {
      rank: { label: 'Rank', type: inferType(FLOAT, { kind: 'none' }, { cardinality: INSTANCE_DOMAIN_CARD }) },
      index: { label: 'Index', type: inferType(INT, { kind: 'none' }, { cardinality: INSTANCE_DOMAIN_CARD }) },
    },
    lower: ({ ctx }) => {
      const instance = ctx.inferredInstance;
      if (!instance) throw new Error('InstanceDomain: instance inference failed — field block requires inferredInstance');

      const rankType = ctx.outTypes[0];
      const indexType = ctx.outTypes[1];

      // [LAW:one-source-of-truth] Domain properties resolve via domain_property intrinsic kind,
      // distinct from the legacy property intrinsic kind.
      const rankField = ctx.b.domainProperty('rank', rankType);
      const indexField = ctx.b.domainProperty('index', indexType);

      return {
        outputsById: {
          rank: { id: rankField, slot: undefined, type: rankType, stride: payloadStride(rankType.payload) },
          index: { id: indexField, slot: undefined, type: indexType, stride: payloadStride(indexType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'rank', type: rankType },
            { portId: 'index', type: indexType },
          ],
        },
      };
    },
  });
}
