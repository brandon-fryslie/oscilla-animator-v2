/**
 * Oscillator Block
 *
 * Generates oscillating signals (sin, saw, square, noise).
 */

import { registerBlock } from '../registry';
import { canonicalType, unitPhase01, unitNorm01, strideOf, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, INT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import type { ValueExprId } from '../../compiler/ir/Indices';

registerBlock({
  type: 'Oscillator',
  label: 'Oscillator',
  category: 'signal',
  description: 'Generates oscillating signals (sin, saw, square, noise)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    phase: {
      label: 'Phase',
      type: canonicalType(FLOAT, unitPhase01()),
    },
    mode: {
      type: canonicalType(INT),
      value: 0,
      defaultSource: defaultSourceConst(0),
      exposedAsPort: true,
      uiHint: {
        kind: 'select',
        options: [
          { value: '0', label: 'Sin' },
          { value: '1', label: 'Saw' },
          { value: '2', label: 'Square' },
          { value: '3', label: 'Noise' },
        ],
      },
    },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT, unitNorm01()) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const phase = inputsById.phase;
    const isPhaseSignal = phase && 'type' in phase && requireInst(phase.type.extent.temporality, 'temporality').kind === 'continuous';
    if (!phase || !isPhaseSignal) {
      throw new Error('Oscillator phase required as signal');
    }

    const mode = (config?.mode as number) ?? 0;
    const outType = ctx.outTypes[0];

    let id: ValueExprId;

    switch (mode) {
      case 0: {
        // Sin
        const mul = ctx.b.opcode(OpCode.Mul);
        const sin = ctx.b.opcode(OpCode.Sin);
        const tau = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));
        const phaseRadians = ctx.b.kernelZip([phase.id, tau], mul, canonicalType(FLOAT, unitPhase01()));
        id = ctx.b.kernelMap(phaseRadians, sin, canonicalType(FLOAT, unitNorm01()));
        break;
      }
      case 1: {
        // Saw: 2 * (phase - floor(phase)) - 1
        const floor = ctx.b.opcode(OpCode.Floor);
        const sub = ctx.b.opcode(OpCode.Sub);
        const mul = ctx.b.opcode(OpCode.Mul);
        const two = ctx.b.constant(floatConst(2), canonicalType(FLOAT));
        const one = ctx.b.constant(floatConst(1), canonicalType(FLOAT));

        const phaseFloor = ctx.b.kernelMap(phase.id, floor, canonicalType(FLOAT, unitPhase01()));
        const frac = ctx.b.kernelZip([phase.id, phaseFloor], sub, canonicalType(FLOAT, unitNorm01()));
        const scaled = ctx.b.kernelZip([two, frac], mul, canonicalType(FLOAT, unitNorm01()));
        id = ctx.b.kernelZip([scaled, one], sub, canonicalType(FLOAT, unitNorm01()));
        break;
      }
      case 2: {
        // Square: phase < 0.5 ? 1 : -1
        const sub = ctx.b.opcode(OpCode.Sub);
        const half = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));
        const sign = ctx.b.opcode(OpCode.Sign);

        const shifted = ctx.b.kernelZip([phase.id, half], sub, canonicalType(FLOAT));
        id = ctx.b.kernelMap(shifted, sign, canonicalType(FLOAT, unitNorm01()));
        break;
      }
      case 3: {
        // Noise: Deterministic hash of phase (produces pseudo-random [0,1) output)
        const hash = ctx.b.opcode(OpCode.Hash);
        const seed = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
        id = ctx.b.kernelZip([phase.id, seed], hash, canonicalType(FLOAT, unitNorm01()));
        break;
      }
      default: {
        throw new Error(`Unknown oscillator mode: ${mode}`);
      }
    }

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
