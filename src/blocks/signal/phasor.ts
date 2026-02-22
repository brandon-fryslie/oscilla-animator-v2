/**
 * Phasor Block
 *
 * Phase accumulator that wraps at 1.0.
 */

import { registerBlock, requireConfig } from '../registry';
import { canonicalType, unitTurns, payloadStride, floatConst, requireInst, contractWrap01, cardinalityVar } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode, stableStateId } from '../../compiler/ir/types';
import { zipAuto, mapAuto } from '../lower-utils';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const PHASOR_CARD = cardinalityVar(cardinalityVarId('phasor_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Phasor',
  label: 'Phasor',
  category: 'signal',
  description: 'Phase accumulator that wraps at 1.0',
  form: 'primitive',
  capability: 'state',
  loweringPurity: 'stateful',
  inputs: {
    frequency: { label: 'Frequency (Hz)', type: canonicalType(FLOAT, undefined, { cardinality: PHASOR_CARD }) },
    initialPhase: { type: canonicalType(FLOAT), defaultValue: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Phase', type: canonicalType(FLOAT, unitTurns(), { cardinality: PHASOR_CARD }, contractWrap01()) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const frequency = inputsById.frequency;
    if (!frequency || !('type' in frequency) || requireInst(frequency.type.extent.temporality, 'temporality').kind !== 'continuous') {
      throw new Error('Phasor: frequency input must be continuous (not an event)');
    }

    const initialPhase = requireConfig<number>(config, 'initialPhase', 'number');
    const outType = ctx.outTypes[0];

    // Symbolic state key
    const stateKey = stableStateId(ctx.instanceId, 'phasor');

    // Read previous phase (symbolic key, no allocation)
    const prevPhase = ctx.b.stateRead(stateKey, canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()));

    // Read dt from time system (in seconds)
    const dtSig = ctx.b.time('dt', canonicalType(FLOAT));

    // Compute: phase increment = frequency * dt / 1000 (dt is in ms)
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const divFn = ctx.b.opcode(OpCode.Div);
    const thousand = ctx.b.constant(floatConst(1000), canonicalType(FLOAT));
    const dtSeconds = zipAuto([dtSig, thousand], divFn, outType, ctx.b);
    const increment = zipAuto([frequency.id, dtSeconds], mulFn, outType, ctx.b);

    // Add increment to previous phase
    const addFn = ctx.b.opcode(OpCode.Add);
    const rawPhase = zipAuto([prevPhase, increment], addFn, outType, ctx.b);

    // Wrap to [0, 1)
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const wrappedPhase = mapAuto(rawPhase, wrapFn, outType, ctx.b);

    // Return effects-as-data (no imperative calls)
    return {
      outputsById: {
        out: { id: wrappedPhase, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        stateDecls: [
          { key: stateKey, initialValue: initialPhase },
        ],
        stepRequests: [
          { kind: 'stateWrite' as const, stateKey, value: wrappedPhase },
        ],
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
