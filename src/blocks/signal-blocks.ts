/**
 * Signal Blocks
 *
 * Blocks that produce and transform scalar signals.
 */

import { registerBlock } from './registry';
import { signalType, type PayloadType } from '../core/canonical-types';
import { OpCode, stableStateId } from '../compiler/ir/types';
import type { SigExprId } from '../compiler/ir/Indices';

// =============================================================================
// Const (Polymorphic)
// =============================================================================

/**
 * Polymorphic constant block.
 *
 * The output type is '???' (polymorphic) - resolved by the normalizer
 * based on what this block is wired to. The resolved type is stored
 * in the `payloadType` input.
 *
 * Supported payload types: float, int, bool, phase, unit
 * (vec2 and color require separate blocks due to value structure)
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
  inputs: {
    value: {
      type: signalType('float'),
      value: 0,
      uiHint: { kind: 'slider', min: 1, max: 10000, step: 1 },
      exposedAsPort: false,
    },
    payloadType: {
      type: signalType('???'),
      value: undefined,
      hidden: true,
      exposedAsPort: false,
    },
  },
  outputs: {
    // Output type is polymorphic - resolved by normalizer from target port
    out: { label: 'Output', type: signalType('???') },
  },
  lower: ({ ctx, config }) => {
    const payloadType = config?.payloadType as PayloadType | undefined;
    const rawValue = config?.value;

    if (payloadType === undefined) {
      throw new Error(
        `Const block missing payloadType. Type must be resolved by normalizer before lowering.`
      );
    }

    if (rawValue === undefined) {
      throw new Error(
        `Const block missing value. Value must be provided.`
      );
    }

    let sigId;
    const slot = ctx.b.allocSlot();

    switch (payloadType) {
      case 'float': {
        if (typeof rawValue !== 'number') {
          throw new Error(`Const<float> requires number value, got ${typeof rawValue}`);
        }
        sigId = ctx.b.sigConst(rawValue, signalType('float'));
        break;
      }
      case 'int': {
        if (typeof rawValue !== 'number') {
          throw new Error(`Const<int> requires number value, got ${typeof rawValue}`);
        }
        sigId = ctx.b.sigConst(Math.floor(rawValue), signalType('int'));
        break;
      }
      case 'bool': {
        if (typeof rawValue !== 'boolean' && typeof rawValue !== 'number') {
          throw new Error(`Const<bool> requires boolean or number value, got ${typeof rawValue}`);
        }
        sigId = ctx.b.sigConst(rawValue ? 1 : 0, signalType('bool'));
        break;
      }
      case 'phase':
      case 'unit': {
        if (typeof rawValue !== 'number') {
          throw new Error(`Const<${payloadType}> requires number value, got ${typeof rawValue}`);
        }
        if (rawValue < 0 || rawValue > 1) {
          throw new Error(`Const<${payloadType}> value must be in [0, 1], got ${rawValue}`);
        }
        sigId = ctx.b.sigConst(rawValue, signalType(payloadType));
        break;
      }
      case 'vec2': {
        const val = rawValue as { x?: number; y?: number };
        if (typeof val !== 'object' || val === null) {
          throw new Error(`Const<vec2> requires {x, y} object, got ${typeof rawValue}`);
        }
        if (typeof val.x !== 'number' || typeof val.y !== 'number') {
          throw new Error(`Const<vec2> requires {x: number, y: number}, got {x: ${typeof val.x}, y: ${typeof val.y}}`);
        }
        const xSig = ctx.b.sigConst(val.x, signalType('float'));
        const ySig = ctx.b.sigConst(val.y, signalType('float'));
        const packFn = ctx.b.kernel('packVec2');
        sigId = ctx.b.sigZip([xSig, ySig], packFn, signalType('vec2'));
        break;
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
        const rSig = ctx.b.sigConst(val.r, signalType('float'));
        const gSig = ctx.b.sigConst(val.g, signalType('float'));
        const bSig = ctx.b.sigConst(val.b, signalType('float'));
        const aSig = ctx.b.sigConst(val.a, signalType('float'));
        const packFn = ctx.b.kernel('packColor');
        sigId = ctx.b.sigZip([rSig, gSig, bSig, aSig], packFn, signalType('color'));
        break;
      }
      case '???': {
        throw new Error(
          `Cannot lower Const block with unresolved type '???'. ` +
          `Type must be resolved by normalizer before lowering.`
        );
      }
      default: {
        throw new Error(`Unsupported payload type for Const: ${payloadType}`);
      }
    }

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot },
      },
    };
  },
});

// =============================================================================
// Oscillator
// =============================================================================

registerBlock({
  type: 'Oscillator',
  label: 'Oscillator',
  category: 'signal',
  description: 'Generates waveforms (oscSin, oscCos, triangle, square, sawtooth)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    // Phase input expects values in [0, 1) range - the kernel converts to radians
    phase: { label: 'Phase', type: signalType('phase') },
    waveform: { type: signalType('float'), value: 0, exposedAsPort: false },
    amplitude: { type: signalType('float'), value: 1.0, exposedAsPort: false },
    offset: { type: signalType('float'), value: 0.0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float') },
  },
  lower: ({ ctx, inputsById, config }) => {
    // Get the phase input
    const phaseValue = inputsById.phase;
    if (!phaseValue || phaseValue.k !== 'sig') {
      throw new Error('Oscillator phase input must be a signal');
    }

    const waveform = (config?.waveform as string) ?? 'oscSin';
    const amplitude = (config?.amplitude as number) ?? 1.0;
    const offset = (config?.offset as number) ?? 0.0;

    // Create oscillator signal expression using sigMap
    // Map the waveform function over the phase input
    // Note: SignalEvaluator kernels (oscSin, oscCos, etc.) expect phase [0,1) and convert to radians
    const waveFn = ctx.b.kernel(waveform); // oscSin, oscCos, etc.
    let sigId: SigExprId = ctx.b.sigMap(phaseValue.id as SigExprId, waveFn, signalType('float'));

    // Apply amplitude if not 1.0
    if (amplitude !== 1.0) {
      const ampConst = ctx.b.sigConst(amplitude, signalType('float'));
      const mulFn = ctx.b.opcode(OpCode.Mul);
      sigId = ctx.b.sigZip([sigId, ampConst], mulFn, signalType('float'));
    }

    // Apply offset if not 0.0
    if (offset !== 0.0) {
      const offsetConst = ctx.b.sigConst(offset, signalType('float'));
      const addFn = ctx.b.opcode(OpCode.Add);
      sigId = ctx.b.sigZip([sigId, offsetConst], addFn, signalType('float'));
    }

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot },
      },
    };
  },
});

// =============================================================================
// UnitDelay - z^-1 delay block
// =============================================================================

registerBlock({
  type: 'UnitDelay',
  label: 'Unit Delay (z^-1)',
  category: 'signal',
  description: 'Delays signal by one frame. Output on frame N = input from frame N-1',
  form: 'primitive',
  capability: 'state',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'Input', type: signalType('float') },
    initialValue: { type: signalType('float'), value: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float') },
  },
  lower: ({ ctx, inputsById, config }) => {
    // Get the input signal
    const input = inputsById.in;
    if (!input || input.k !== 'sig') {
      throw new Error('UnitDelay input must be a signal');
    }

    const initialValue = (config?.initialValue as number) ?? 0;

    // Allocate persistent state slot with stable ID (for hot-swap migration)
    // ctx.instanceId is the blockId which provides stable identity
    const stateSlot = ctx.b.allocStateSlot(
      stableStateId(ctx.instanceId, 'delay'),
      { initialValue }
    );

    // Read previous value FIRST (before any writes in this frame)
    const prevId = ctx.b.sigStateRead(stateSlot, signalType('float'));

    // Schedule write of current input for end of frame
    // This will be written in Phase 2 of ScheduleExecutor
    ctx.b.stepStateWrite(stateSlot, input.id as SigExprId);

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: prevId, slot },
      },
    };
  },
});

// =============================================================================
// Hash - Deterministic hash function
// =============================================================================

registerBlock({
  type: 'Hash',
  label: 'Hash',
  category: 'signal',
  description: 'Deterministic hash function for seeded randomness. Output in [0, 1)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    value: { label: 'Value', type: signalType('float') },
    seed: { label: 'Seed', type: signalType('float'), optional: true },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float') },
  },
  lower: ({ ctx, inputsById }) => {
    // Get required value input
    const value = inputsById.value;
    if (!value || value.k !== 'sig') {
      throw new Error('Hash value input must be a signal');
    }

    // Get optional seed input (default to 0 if not connected)
    const seedInput = inputsById.seed;
    let seedId: SigExprId;
    if (seedInput && seedInput.k === 'sig') {
      seedId = seedInput.id as SigExprId;
    } else {
      seedId = ctx.b.sigConst(0, signalType('float'));
    }

    // Apply hash opcode (already implemented in OpcodeInterpreter)
    const hashFn = ctx.b.opcode(OpCode.Hash);
    const hashId = ctx.b.sigZip([value.id as SigExprId, seedId], hashFn, signalType('float'));

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: hashId, slot },
      },
    };
  },
});

// =============================================================================
// Id01 - Normalized element ID
// =============================================================================

registerBlock({
  type: 'Id01',
  label: 'Normalized ID',
  category: 'signal',
  description: 'Normalize index by count: output = index / count. Safe division handles count=0',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    index: { label: 'Index', type: signalType('float') },
    count: { label: 'Count', type: signalType('float') },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float') },
  },
  lower: ({ ctx, inputsById }) => {
    // Get required inputs
    const index = inputsById.index;
    const count = inputsById.count;

    if (!index || index.k !== 'sig') {
      throw new Error('Id01 index input must be a signal');
    }
    if (!count || count.k !== 'sig') {
      throw new Error('Id01 count input must be a signal');
    }

    // Safe division: index / max(count, 1)
    // This ensures we never divide by zero
    const one = ctx.b.sigConst(1, signalType('float'));
    const maxFn = ctx.b.opcode(OpCode.Max);
    const safeCount = ctx.b.sigZip([count.id as SigExprId, one], maxFn, signalType('float'));

    // Divide index by safe count
    const divFn = ctx.b.opcode(OpCode.Div);
    const normalized = ctx.b.sigZip([index.id as SigExprId, safeCount], divFn, signalType('float'));

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: normalized, slot },
      },
    };
  },
});
