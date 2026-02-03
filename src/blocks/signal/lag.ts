/**
 * Lag Block
 *
 * Exponential smoothing filter.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst, requireInst, unitScalar, contractClamp01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode, stableStateId } from '../../compiler/ir/types';

registerBlock({
  type: 'Lag',
  label: 'Lag',
  category: 'signal',
  description: 'Exponential smoothing filter',
  form: 'primitive',
  capability: 'state',
  isStateful: true,  // Allows feedback cycles - reads from previous frame
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    target: { label: 'Target', type: canonicalType(FLOAT) },
    smoothing: { type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()), defaultValue: 0.5, exposedAsPort: false },
    initialValue: { type: canonicalType(FLOAT), defaultValue: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const target = inputsById.target;
    const isTargetSignal = target && 'type' in target && requireInst(target.type.extent.temporality, 'temporality').kind === 'continuous';
    if (!target || !isTargetSignal) {
      throw new Error('Lag requires target signal input');
    }

    const smoothing = (config?.smoothing as number) ?? 0.5;
    const initialValue = (config?.initialValue as number) ?? 0;
    const outType = ctx.outTypes[0];

    // Symbolic state key
    const stateKey = stableStateId(ctx.instanceId, 'lag');

    // Read previous state (symbolic key, no allocation)
    const prevValue = ctx.b.stateRead(stateKey, canonicalType(FLOAT));

    // Compute: lerp(prev, target, smoothing)
    const lerpFn = ctx.b.opcode(OpCode.Lerp);
    const smoothConst = ctx.b.constant(floatConst(smoothing), canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()));
    const newValue = ctx.b.kernelZip([prevValue, target.id, smoothConst], lerpFn, canonicalType(FLOAT));

    // Return effects-as-data (no imperative calls)
    return {
      outputsById: {
        out: { id: newValue, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        stateDecls: [
          { key: stateKey, initialValue },
        ],
        stepRequests: [
          { kind: 'stateWrite' as const, stateKey, value: newValue },
        ],
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
