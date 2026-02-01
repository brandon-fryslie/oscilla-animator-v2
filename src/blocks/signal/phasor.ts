/**
 * Phasor Block
 *
 * Phase accumulator that wraps at 1.0.
 */

import { registerBlock } from '../registry';
import { canonicalType, unitPhase01, strideOf, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode, stableStateId } from '../../compiler/ir/types';

registerBlock({
  type: 'Phasor',
  label: 'Phasor',
  category: 'signal',
  description: 'Phase accumulator that wraps at 1.0',
  form: 'primitive',
  capability: 'state',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    frequency: { label: 'Frequency (Hz)', type: canonicalType(FLOAT) },
    initialPhase: { type: canonicalType(FLOAT), value: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Phase', type: canonicalType(FLOAT, unitPhase01()) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const frequency = inputsById.frequency;
    const isFrequencySignal = frequency && 'type' in frequency && requireInst(frequency.type.extent.temporality, 'temporality').kind === 'continuous';
    if (!frequency || !isFrequencySignal) {
      throw new Error('Phasor requires frequency signal input');
    }

    const initialPhase = (config?.initialPhase as number) ?? 0;
    const outType = ctx.outTypes[0];

    // Create state for accumulated phase
    const stateId = stableStateId(ctx.instanceId, 'phasor');
    const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue: initialPhase });

    // Read previous phase
    const prevPhase = ctx.b.stateRead(stateSlot, canonicalType(FLOAT, unitPhase01()));

    // Read dt from time system (in seconds)
    const dtSig = ctx.b.time('dt', canonicalType(FLOAT));

    // Compute: phase increment = frequency * dt / 1000 (dt is in ms)
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const divFn = ctx.b.opcode(OpCode.Div);
    const thousand = ctx.b.constant(floatConst(1000), canonicalType(FLOAT));
    const dtSeconds = ctx.b.kernelZip([dtSig, thousand], divFn, canonicalType(FLOAT));
    const increment = ctx.b.kernelZip([frequency.id, dtSeconds], mulFn, canonicalType(FLOAT));

    // Add increment to previous phase
    const addFn = ctx.b.opcode(OpCode.Add);
    const rawPhase = ctx.b.kernelZip([prevPhase, increment], addFn, canonicalType(FLOAT));

    // Wrap to [0, 1)
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const wrappedPhase = ctx.b.kernelMap(rawPhase, wrapFn, canonicalType(FLOAT, unitPhase01()));

    // Write wrapped phase to state
    ctx.b.stepStateWrite(stateSlot, wrappedPhase);

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id: wrappedPhase, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
