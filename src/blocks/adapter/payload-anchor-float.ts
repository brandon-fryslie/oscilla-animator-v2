/**
 * Adapter_PayloadAnchorFloat Block
 *
 * Cheater adapter: provides a structural break point for polymorphic payload chains.
 * Inserted automatically by normalization when a polymorphic chain has no concrete evidence.
 * Always emits a warning diagnostic.
 *
 * Both ports use payload+unit vars (template vars get alpha-renamed per block instance
 * by extractConstraints() to prevent cross-anchor unification). The solver's finalization
 * defaults unresolved payload vars to float.
 *
 * // [LAW:one-source-of-truth] This block is the single structural authority for payload anchoring.
 * // [LAW:single-enforcer] Only inserted by payloadAnchorPolicyV1, never by users.
 */

import { registerBlock } from '../registry';
import { payloadStride } from '../../core/canonical-types';
import { inferType, payloadVar, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto, mapAuto } from '../lower-utils';

registerBlock({
  type: 'Adapter_PayloadAnchorFloat',
  label: 'Float Anchor',
  category: 'adapter',
  description: 'Anchors polymorphic payload chain (defaults to float via solver finalization)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  // NO adapterSpec — not a normal adapter. Only inserted by cheater policy.
  // NO payload metadata — payload var unifies freely with connected ports.
  // Solver finalization defaults unresolved vars to float.
  inputs: {
    in: {
      label: 'In',
      type: inferType(payloadVar('anchor_P'), unitVar('anchor_U')),
      // NOTE: var IDs are templates — get alpha-renamed per block instance
      // by extractConstraints() template var instantiation (p:{blockId}:anchor_P)
    },
  },
  outputs: {
    out: {
      label: 'Out',
      type: inferType(payloadVar('anchor_P'), unitVar('anchor_U')),
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
