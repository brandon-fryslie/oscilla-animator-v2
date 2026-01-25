/**
 * Signal Blocks
 *
 * Blocks that produce and transform scalar signals.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from './registry';
import { signalType, type PayloadType, unitPhase01, unitNorm01, unitVar, payloadVar, strideOf } from '../core/canonical-types';
import { OpCode, stableStateId } from '../compiler/ir/types';
import type { SigExprId } from '../compiler/ir/Indices';

// =============================================================================
// Const (Payload-Generic)
// =============================================================================

/**
 * Payload-Generic constant block.
 *
 * This block outputs a constant value with type determined by context.
 * The payload type and unit are resolved by pass1 constraint solver
 * through constraint propagation from connected ports.
 *
 * Payload-Generic Contract (per spec §1):
 * - Closed admissible payload set: float, int, bool, vec2, color
 * - Per-payload specialization is total (see lower function)
 * - No implicit coercions
 * - Deterministic resolution via payloadType param
 *
 * Semantics: typeSpecific (each payload has different value structure)
 */
registerBlock({
  type: 'Const',
  label: 'Constant',
  category: 'signal',
  description: 'Outputs a constant value (type inferred from target)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      out: ALL_CONCRETE_PAYLOADS,
    },
    // Const has no inputs that affect output type - it's a source block
    // The output type is determined by context (what it connects to)
    combinations: ALL_CONCRETE_PAYLOADS.map(p => ({
      inputs: [] as PayloadType[],
      output: p,
    })),
    semantics: 'typeSpecific',
  },
  inputs: {
    value: {
      type: signalType('float'),
      value: 0,
      uiHint: { kind: 'slider', min: 1, max: 10000, step: 1 },
      exposedAsPort: false,
    },
  },
  outputs: {
    // Unit is polymorphic (UnitVar) - resolved by pass1 constraint solver
    // Payload is polymorphic (payloadVar) - resolved by pass1 constraint solver
    out: { label: 'Output', type: signalType(payloadVar('const_payload'), unitVar('const_out')) },
  },
  lower: ({ ctx, config }) => {
    // Get resolved payload type from ctx.outTypes (populated from pass1 portTypes)
    const outType = ctx.outTypes[0];
    if (!outType) {
      throw new Error(`Const block missing resolved output type from pass1`);
    }
    const payloadType = outType.payload as PayloadType;
    const rawValue = config?.value;

    if (rawValue === undefined) {
      throw new Error(
        `Const block missing value. Value must be provided.`
      );
    }

    const stride = strideOf(outType.payload);

    switch (payloadType) {
      case 'float': {
        if (typeof rawValue !== 'number') {
          throw new Error(`Const<float> requires number value, got ${typeof rawValue}`);
        }
        const sigId = ctx.b.sigConst(rawValue, signalType('float'));
        const slot = ctx.b.allocSlot(stride);
        return {
          outputsById: {
            out: { k: 'sig', id: sigId, slot, type: outType, stride },
          },
        };
      }
      case 'cameraProjection':
      case 'int': {
        if (typeof rawValue !== 'number') {
          throw new Error(`Const<${payloadType}> requires number value, got ${typeof rawValue}`);
        }
        const sigId = ctx.b.sigConst(Math.floor(rawValue), signalType(payloadType as any));
        const slot = ctx.b.allocSlot(stride);
        return {
          outputsById: {
            out: { k: 'sig', id: sigId, slot, type: outType, stride },
          },
        };
      }
      case 'bool': {
        if (typeof rawValue !== 'boolean' && typeof rawValue !== 'number') {
          throw new Error(`Const<bool> requires boolean or number value, got ${typeof rawValue}`);
        }
        const sigId = ctx.b.sigConst(rawValue ? 1 : 0, signalType('bool'));
        const slot = ctx.b.allocSlot(stride);
        return {
          outputsById: {
            out: { k: 'sig', id: sigId, slot, type: outType, stride },
          },
        };
      }
      case 'vec2': {
        const val = rawValue as { x?: number; y?: number };
        if (typeof val !== 'object' || val === null) {
          throw new Error(`Const<vec2> requires {x, y} object, got ${typeof rawValue}`);
        }
        if (typeof val.x !== 'number' || typeof val.y !== 'number') {
          throw new Error(`Const<vec2> requires {x: number, y: number}, got {x: ${typeof val.x}, y: ${typeof val.y}}`);
        }

        // Multi-component signal: allocate strided slot, compute components, emit write step
        const slot = ctx.b.allocSlot(stride);
        const xSig = ctx.b.sigConst(val.x, signalType('float'));
        const ySig = ctx.b.sigConst(val.y, signalType('float'));
        const components = [xSig, ySig];

        ctx.b.stepSlotWriteStrided(slot, components);

        return {
          outputsById: {
            out: { k: 'sig', id: xSig, slot, type: outType, stride, components },
          },
        };
      }
      case 'color': {
        const val = rawValue as { r?: number; g?: number; b?: number; a?: number };
        if (typeof val !== 'object' || val === null) {
          throw new Error(`Const<color> requires {r, g, b, a} object, got ${typeof rawValue}`);
        }
        if (typeof val.r !== 'number' || typeof val.g !== 'number' ||
          typeof val.b !== 'number' || typeof val.a !== 'number') {
          throw new Error(`Const<color> requires {r, g, b, a} as numbers`);
        }

        // Multi-component signal: allocate strided slot, compute components, emit write step
        const slot = ctx.b.allocSlot(stride);
        const rSig = ctx.b.sigConst(val.r, signalType('float'));
        const gSig = ctx.b.sigConst(val.g, signalType('float'));
        const bSig = ctx.b.sigConst(val.b, signalType('float'));
        const aSig = ctx.b.sigConst(val.a, signalType('float'));
        const components = [rSig, gSig, bSig, aSig];

        ctx.b.stepSlotWriteStrided(slot, components);

        return {
          outputsById: {
            out: { k: 'sig', id: rSig, slot, type: outType, stride, components },
          },
        };
      }
      default: {
        throw new Error(`Unsupported payload type for Const: ${payloadType}`);
      }
    }
  },
});

// =============================================================================
// Oscillator
// =============================================================================

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
      type: signalType('float', unitPhase01()),
    },
    mode: {
      type: signalType('int'),
      value: 0,
      exposedAsPort: false,
      uiHint: {
        kind: 'select',
        options: [
          { value: 0, label: 'Sin' },
          { value: 1, label: 'Saw' },
          { value: 2, label: 'Square' },
          { value: 3, label: 'Noise' },
        ],
      },
    },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float', unitNorm01()) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const phase = inputsById.phase;
    if (!phase || phase.k !== 'sig') {
      throw new Error('Oscillator phase required as signal');
    }

    const mode = (config?.mode as number) ?? 0;
    const outType = ctx.outTypes[0];

    let sigId: SigExprId;

    switch (mode) {
      case 0: {
        // Sin
        const mul = ctx.b.opcode(OpCode.Mul);
        const sin = ctx.b.opcode(OpCode.Sin);
        const tau = ctx.b.sigConst(Math.PI * 2, signalType('float'));
        const phaseRadians = ctx.b.sigZip([phase.id, tau], mul, signalType('float', unitPhase01()));
        sigId = ctx.b.sigMap(phaseRadians, sin, signalType('float', unitNorm01()));
        break;
      }
      case 1: {
        // Saw: 2 * (phase - floor(phase)) - 1
        const floor = ctx.b.opcode(OpCode.Floor);
        const sub = ctx.b.opcode(OpCode.Sub);
        const mul = ctx.b.opcode(OpCode.Mul);
        const two = ctx.b.sigConst(2, signalType('float'));
        const one = ctx.b.sigConst(1, signalType('float'));

        const phaseFloor = ctx.b.sigMap(phase.id, floor, signalType('float', unitPhase01()));
        const frac = ctx.b.sigZip([phase.id, phaseFloor], sub, signalType('float', unitNorm01()));
        const scaled = ctx.b.sigZip([two, frac], mul, signalType('float', unitNorm01()));
        sigId = ctx.b.sigZip([scaled, one], sub, signalType('float', unitNorm01()));
        break;
      }
      case 2: {
        // Square: phase < 0.5 ? 1 : -1
        const sub = ctx.b.opcode(OpCode.Sub);
        const half = ctx.b.sigConst(0.5, signalType('float'));
        const sign = ctx.b.opcode(OpCode.Sign);

        const shifted = ctx.b.sigZip([phase.id, half], sub, signalType('float'));
        sigId = ctx.b.sigMap(shifted, sign, signalType('float', unitNorm01()));
        break;
      }
      case 3: {
        // Noise: Use simplexNoise1D with phase as seed
        const noise = ctx.b.kernel('simplexNoise1D');
        sigId = ctx.b.sigMap(phase.id, noise, signalType('float', unitNorm01()));
        break;
      }
      default: {
        throw new Error(`Unknown oscillator mode: ${mode}`);
      }
    }

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// Accumulator
// =============================================================================

registerBlock({
  type: 'Accumulator',
  label: 'Accumulator',
  category: 'signal',
  description: 'Accumulates value over time with delta input',
  form: 'primitive',
  capability: 'stateful',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    delta: { label: 'Delta', type: signalType('float') },
    reset: { label: 'Reset', type: signalType('bool') },
  },
  outputs: {
    value: { label: 'Value', type: signalType('float') },
  },
  lower: ({ ctx, inputsById }) => {
    const delta = inputsById.delta;
    const reset = inputsById.reset;

    if (!delta || delta.k !== 'sig') {
      throw new Error('Accumulator delta required as signal');
    }
    if (!reset || reset.k !== 'sig') {
      throw new Error('Accumulator reset required as signal');
    }

    const outType = ctx.outTypes[0];

    // Create state for accumulated value
    const stateId = stableStateId(`accumulator_${ctx.instanceId}`);
    const stateSlot = ctx.b.createState(stateId, 0); // Initial value = 0

    // Read current state
    const currentValue = ctx.b.sigStateRead(stateSlot, signalType('float'));

    // Compute new value: reset ? 0 : (currentValue + delta)
    const add = ctx.b.opcode(OpCode.Add);
    const zero = ctx.b.sigConst(0, signalType('float'));
    const newValue = ctx.b.sigZip([currentValue, delta.id], add, signalType('float'));

    // Select: reset ? 0 : newValue
    const select = ctx.b.kernel('select');
    const finalValue = ctx.b.sigZip([reset.id, zero, newValue], select, signalType('float'));

    // Write back to state
    ctx.b.stepStateWrite(stateSlot, finalValue);

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        value: { k: 'sig', id: finalValue, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
