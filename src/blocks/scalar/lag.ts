/**
 * Lag Block
 *
 * Exponential smoothing filter.
 */

import { registerBlock, requireConfig } from '../registry';
import { canonicalType, payloadStride, floatConst, unitNone, contractClamp01, cardinalityVar } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode, stableStateId } from '../../compiler/ir/types';
import { zipAuto, planStatefulStorage } from '../lower-utils';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const LAG_CARD = cardinalityVar(cardinalityVarId('lag_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Lag',
  label: 'Lag',
  category: 'scalar',
  description: 'Exponential smoothing filter',
  form: 'primitive',
  capability: 'state',
  loweringPurity: 'stateful',
  isStateful: true,  // Allows feedback cycles - reads from previous frame
  inputs: {
    target: { label: 'Target', type: inferType(FLOAT, unitVar('lag_U'), { cardinality: LAG_CARD }) },
    smoothing: { type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()), defaultValue: 0.5, exposedAsPort: false },
    initialValue: { type: canonicalType(FLOAT), defaultValue: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Output', type: inferType(FLOAT, unitVar('lag_U'), { cardinality: LAG_CARD }) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const target = inputsById.target;
    if (!target) {
      throw new Error('Lag target input required');
    }

    const smoothing = requireConfig<number>(config, 'smoothing', 'number');
    const initialValue = requireConfig<number>(config, 'initialValue', 'number');
    const outType = ctx.outTypes[0];

    // Symbolic state key
    const stateKey = stableStateId(ctx.instanceId, 'lag');
    const stateStorage = planStatefulStorage(ctx, stateKey, outType, initialValue);

    // Read previous state (symbolic key, no allocation)
    const prevValue = ctx.b.stateRead(stateKey, outType);

    // Compute: lerp(prev, target, smoothing)
    const lerpFn = ctx.b.opcode(OpCode.Lerp);
    const smoothConst = ctx.b.constant(floatConst(smoothing), canonicalType(FLOAT, unitNone(), undefined, contractClamp01()));
    const newValue = zipAuto([prevValue, target.id, smoothConst], lerpFn, outType, ctx.b);

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
