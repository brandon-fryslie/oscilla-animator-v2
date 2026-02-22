/**
 * Oscillator Block
 *
 * Generates oscillating signals (sin, saw, square, noise).
 */

import { registerBlock, requireConfigInt } from '../registry';
import { canonicalType, unitTurns, unitNone, payloadStride, floatConst, requireInst, contractWrap01, contractClamp11, cardinalityVar } from '../../core/canonical-types';
import { FLOAT, INT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import type { ValueExprId } from '../../compiler/ir/Indices';
import { zipAuto, mapAuto } from '../lower-utils';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const OSCILLATOR_CARD = cardinalityVar(cardinalityVarId('oscillator_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Oscillator',
  label: 'Oscillator',
  category: 'scalar',
  description: 'Generates oscillating signals (sin, saw, square, noise)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    phase: {
      label: 'Phase',
      type: canonicalType(FLOAT, unitTurns(), { cardinality: OSCILLATOR_CARD }, contractWrap01()),
    },
    mode: {
      type: canonicalType(INT),
      defaultValue: 0,
      defaultSource: defaultSourceConst(0),
      exposedAsPort: false,
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
    out: { label: 'Output', type: canonicalType(FLOAT, unitNone(), { cardinality: OSCILLATOR_CARD }, contractClamp11()) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const phase = inputsById.phase;
    const isPhaseSignal = phase && 'type' in phase && requireInst(phase.type.extent.temporality, 'temporality').kind === 'continuous';
    if (!phase || !isPhaseSignal) {
      throw new Error('Oscillator phase required as signal');
    }

    const mode = requireConfigInt(config!, 'mode', 0, 3);
    const outType = ctx.outTypes[0];

    let id: ValueExprId;

    // Use zipAuto/mapAuto for cardinality-aware operations:
    // phase may be signal (one) while outType is field (many) in promoteToMany contexts.
    switch (mode) {
      case 0: {
        // Sin
        const mul = ctx.b.opcode(OpCode.Mul);
        const sin = ctx.b.opcode(OpCode.Sin);
        const tau = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));
        const phaseRadians = zipAuto([phase.id, tau], mul, outType, ctx.b);
        id = mapAuto(phaseRadians, sin, outType, ctx.b);
        break;
      }
      case 1: {
        // Saw: 2 * (phase - floor(phase)) - 1
        const floor = ctx.b.opcode(OpCode.Floor);
        const sub = ctx.b.opcode(OpCode.Sub);
        const mul = ctx.b.opcode(OpCode.Mul);
        const two = ctx.b.constant(floatConst(2), canonicalType(FLOAT));
        const one = ctx.b.constant(floatConst(1), canonicalType(FLOAT));

        const phaseFloor = mapAuto(phase.id, floor, outType, ctx.b);
        const frac = zipAuto([phase.id, phaseFloor], sub, outType, ctx.b);
        const scaled = zipAuto([two, frac], mul, outType, ctx.b);
        id = zipAuto([scaled, one], sub, outType, ctx.b);
        break;
      }
      case 2: {
        // Square: phase < 0.5 ? 1 : -1
        const sub = ctx.b.opcode(OpCode.Sub);
        const half = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));
        const sign = ctx.b.opcode(OpCode.Sign);

        const shifted = zipAuto([phase.id, half], sub, outType, ctx.b);
        id = mapAuto(shifted, sign, outType, ctx.b);
        break;
      }
      case 3: {
        // Noise: Deterministic hash of phase (produces pseudo-random [0,1) output)
        const hash = ctx.b.opcode(OpCode.Hash);
        const seed = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
        id = zipAuto([phase.id, seed], hash, outType, ctx.b);
        break;
      }
      default: {
        throw new Error(`Unknown oscillator mode: ${mode}`);
      }
    }

    return {
      outputsById: {
        out: { id, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
