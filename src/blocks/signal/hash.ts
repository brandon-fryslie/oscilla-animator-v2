/**
 * Hash Block
 *
 * Deterministic hash function. Output in [0, 1).
 */

import { registerBlock } from '../registry';
import { defaultSourceConst } from '../../types';
import { canonicalType, canonicalSignal, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import type { ValueExprId } from '../../compiler/ir/Indices';
import { withoutContract } from '../lower-utils';

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
    seed: { label: 'Seed', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(0) },
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

    // outTypes[0] already has instance info pre-populated by orchestrator
    const outType = ctx.outTypes[0];
    const intermediateType = withoutContract(outType);

    const seed = inputsById.seed;
    let seedId: ValueExprId;
    if (seed && 'type' in seed) {
      const seedTemp = requireInst(seed.type.extent.temporality, 'temporality');
      if (seedTemp.kind !== 'continuous') {
        throw new Error('Hash seed must be continuous (non-event) when provided');
      }
      seedId = seed.id;
    } else {
      seedId = ctx.b.constant(floatConst(0), canonicalType(FLOAT, outType.unit));
    }

    const hashFn = ctx.b.opcode(OpCode.Hash);
    const hashId = ctx.b.zipAuto([value.id, seedId], hashFn, intermediateType);

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
