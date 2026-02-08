/**
 * Adapter_PayloadAnchorFloat Block
 *
 * Cheater adapter: anchors polymorphic payload chain to float.
 * Inserted automatically by normalization when a polymorphic chain has no concrete evidence.
 * Always emits a warning diagnostic.
 *
 * Both ports have concrete FLOAT payload with shared unit var (template var
 * gets alpha-renamed per block instance to prevent cross-anchor unification).
 *
 * // [LAW:one-source-of-truth] This block is the single structural authority for "guess float".
 * // [LAW:single-enforcer] Only inserted by payloadAnchorPolicyV1, never by users.
 */

import { registerBlock } from '../registry';
import { payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto, mapAuto } from '../lower-utils';

registerBlock({
  type: 'Adapter_PayloadAnchorFloat',
  label: 'Float Anchor',
  category: 'adapter',
  description: 'Anchors polymorphic payload chain to float (cheater adapter)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  // NO adapterSpec — not a normal adapter. Only inserted by cheater policy.
  inputs: {
    in: {
      label: 'In',
      type: inferType(FLOAT, unitVar('anchor_U')),
      // NOTE: unitVar ID is a template — gets alpha-renamed per block instance
      // by extractConstraints() template var instantiation (u:{blockId}:anchor_U)
    },
  },
  outputs: {
    out: {
      label: 'Out',
      type: inferType(FLOAT, unitVar('anchor_U')),
    },
  },
  lower: ({ inputsById, ctx }) => {
    // Real identity op — must allocate new ValueExprId, not alias input
    const input = inputsById.in;
    if (!input) throw new Error('PayloadAnchorFloat: input required');
    const outType = ctx.outTypes[0];
    const identityFn = ctx.b.opcode(OpCode.Identity);
    const result = mapAuto(input.id, identityFn, outType, ctx.b);
    return {
      outputsById: {
        out: {
          id: result,
          slot: undefined,
          type: outType,
          stride: payloadStride(outType.payload),
        },
      },
      effects: {
        slotRequests: [{ portId: 'out', type: outType }],
      },
    };
  },
});
