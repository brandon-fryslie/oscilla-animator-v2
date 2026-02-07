/**
 * Hash Block
 *
 * Deterministic hash function. Output in [0, 1).
 */

import { registerBlock } from '../registry';
import { canonicalType, canonicalSignal, payloadStride, floatConst, requireInst, withInstance } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import type { ValueExprId } from '../../compiler/ir/Indices';
import { alignInputs, withoutContract } from '../lower-utils';

registerBlock({
  type: 'Hash',
  label: 'Hash',
  category: 'signal',
  description: 'Deterministic hash function. Output in [0, 1)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    value: { label: 'Value', type: canonicalType(FLOAT) },
    seed: { label: 'Seed', type: canonicalType(FLOAT), optional: true },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const value = inputsById.value;
    if (!value || !('type' in value)) {
      throw new Error('Hash requires value input');
    }
    const temporality = requireInst(value.type.extent.temporality, 'temporality');
    if (temporality.kind !== 'continuous') {
      throw new Error('Hash requires continuous (non-event) input');
    }

    const baseOutType = ctx.outTypes[0];
    const valueCard = requireInst(value.type.extent.cardinality, 'cardinality');
    const outType = valueCard.kind === 'many' ? withInstance(baseOutType, valueCard.instance) : baseOutType;
    const intermediateType = withoutContract(outType);

    const seed = inputsById.seed;
    let seedId: ValueExprId;
    let seedType = canonicalSignal(FLOAT);
    if (seed && 'type' in seed) {
      const seedTemp = requireInst(seed.type.extent.temporality, 'temporality');
      if (seedTemp.kind !== 'continuous') {
        throw new Error('Hash seed must be continuous (non-event) when provided');
      }
      seedId = seed.id;
      seedType = seed.type;
    } else {
      seedType = canonicalType(FLOAT, outType.unit);
      seedId = ctx.b.constant(floatConst(0), seedType);
    }

    const hashFn = ctx.b.opcode(OpCode.Hash);
    const [valueAligned, seedAligned] = alignInputs(value.id, value.type, seedId, seedType, intermediateType, ctx.b);
    const hashId = ctx.b.kernelZip([valueAligned, seedAligned], hashFn, intermediateType);

    return {
      outputsById: {
        out: { id: hashId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
