/**
 * Slew Block
 *
 * y += (x - y) * rate * dt
 *
 * Rate-limited smoothing lens using exponential smoothing.
 * Similar to Lag but designed for lens-on-port usage.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitNone, contractClamp01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { inferType, unitVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode, stableStateId } from '../../compiler/ir/types';
import { zipAuto, planStatefulStorage } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const SLEW_CARD = cardinalityVar(cardinalityVarId('slew_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Slew',
  label: 'Slew',
  category: 'lens',
  description: 'Rate-limited smoothing: y += (x - y) * rate * dt',
  form: 'primitive',
  capability: 'state',
  loweringPurity: 'stateful',
  isStateful: true,  // Allows feedback cycles - reads from previous frame
  inputs: {
    in: { label: 'In', type: inferType(FLOAT, unitVar('slew_U'), { cardinality: SLEW_CARD }) },
    rate: { label: 'Rate', type: canonicalType(FLOAT, unitNone(), { cardinality: SLEW_CARD }, contractClamp01()), defaultValue: 0.5 },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('slew_U'), { cardinality: SLEW_CARD }) },
  },
  lower: ({ ctx, inputsById }) => {
    const input = inputsById.in;
    const rate = inputsById.rate;
    if (!input) throw new Error('Slew input required');
    if (!rate) throw new Error('Slew: rate is required');

    const outType = ctx.outTypes[0];

    // Symbolic state key
    const stateKey = stableStateId(ctx.instanceId, 'slew');
    const stateStorage = planStatefulStorage(ctx, stateKey, outType, 0);

    // Read previous state (symbolic key, no allocation)
    const prevValue = ctx.b.stateRead(stateKey, outType);

    // Compute: lerp(prev, input, rate)
    const lerpFn = ctx.b.opcode(OpCode.Lerp);
    const newValue = zipAuto([prevValue, input.id, rate.id], lerpFn, outType, ctx.b);

    // Return effects-as-data (no imperative calls)
    return {
      outputsById: {
        out: { id: newValue, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        stateDecls: [
          stateStorage.stateDecl,
        ],
        stepRequests: [
          { kind: stateStorage.writeKind, stateKey, value: newValue },
        ],
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
