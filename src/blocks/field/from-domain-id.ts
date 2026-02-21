/**
 * FromDomainId Block
 *
 * Generates normalized (0..1) ID for each element in a domain.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT, INT } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Output field cardinality behavior is declared on CT/ICT.
const FROM_DOMAIN_ID_OUT_CARD = cardinalityVar(cardinalityVarId('from_domain_id_out'), {
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'FromDomainId',
  label: 'From Domain ID',
  category: 'field',
  description: 'Generates normalized (0..1) ID for each element in a domain',
  form: 'primitive',
  capability: 'identity',
  loweringPurity: 'pure',
  inputs: {
    domain: { label: 'Domain', type: canonicalType(INT) }, // Domain count
  },
  outputs: {
    id01: { label: 'ID (0..1)', type: inferType(FLOAT, { kind: 'none' }, { cardinality: FROM_DOMAIN_ID_OUT_CARD }) },
  },
  lower: ({ ctx }) => {
    // Get instance context from Array block or inferred from inputs
    const instance = ctx.inferredInstance !== undefined ? ctx.inferredInstance : ctx.instance;
    if (!instance) {
      throw new Error('FromDomainId requires instance context');
    }

    const outType = ctx.outTypes[0];
    const id01Field = ctx.b.intrinsic('normalizedIndex', outType);

    return {
      outputsById: {
        id01: { id: id01Field, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'id01', type: outType },
        ],
      },
      instanceContext: instance,
    };
  },
});
