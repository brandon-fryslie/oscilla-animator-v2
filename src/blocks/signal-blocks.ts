/**
 * Signal Blocks
 *
 * Blocks that produce and transform scalar signals.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from './registry';
import { signalType, type PayloadType, unitPhase01, unitNorm01, unitVar, strideOf } from '../core/canonical-types';
import { OpCode, stableStateId } from '../compiler/ir/types';
import type { SigExprId } from '../compiler/ir/Indices';

// =============================================================================
// Const (Payload-Generic)
// =============================================================================

/**
 * Payload-Generic constant block.
 *
 * This block outputs a constant value with type determined by context.
 * The payload type is resolved by pass0-payload-resolution based on
 * what this block connects to. The resolved type is stored in `payloadType`.
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
    payloadType: {
      type: signalType('float'),  // Metadata storage - not a wirable port
      value: undefined,
      hidden: true,
      exposedAsPort: false,
    },
  },
  outputs: {
    // Unit is polymorphic (UnitVar) - resolved by pass1 constraint solver
    // Payload is polymorphic - resolved by pass0 based on context
    out: { label: 'Output', type: signalType('float', unitVar('const_out')) },
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
    const outType = ctx.outTypes[0];

    switch (payloadType) {
      case 'float': {
        if (typeof rawValue !== 'number') {
          throw new Error(`Const<float> requires number value, got ${typeof rawValue}`);
        }
        sigId = ctx.b.sigConst(rawValue, signalType('float'));
        break;
      }
      case 'cameraProjection':
      case 'int': {
        if (typeof rawValue !== 'number') {
          throw new Error(`Const<${payloadType}> requires number value, got ${typeof rawValue}`);
        }
        sigId = ctx.b.sigConst(Math.floor(rawValue), signalType(payloadType as any));
        break;
      }
      case 'bool': {
        if (typeof rawValue !== 'boolean' && typeof rawValue !== 'number') {
          throw new Error(`Const<bool> requires boolean or number value, got ${typeof rawValue}`);
        }
        sigId = ctx.b.sigConst(rawValue ? 1 : 0, signalType('bool'));
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
      default: {
        throw new Error(`Unsupported payload type for Const: ${payloadType}`);
      }
    }

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
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
    phase: { label: 'Phase', type: signalType('float', unitPhase01()) },
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
    const outType = ctx.outTypes[0];

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
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
  isStateful: true,
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
    const outType = ctx.outTypes[0];

    return {
      outputsById: {
        out: { k: 'sig', id: prevId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// Lag - Exponential smoothing filter
// =============================================================================

registerBlock({
  type: 'Lag',
  label: 'Lag (Smooth)',
  category: 'signal',
  description: 'Exponential smoothing toward target. y(t) = lerp(y(t-1), target, smoothing)',
  form: 'primitive',
  capability: 'state',
  isStateful: true,
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    target: { label: 'Target', type: signalType('float') },
    smoothing: { type: signalType('float'), value: 0.1, exposedAsPort: false },
    initialValue: { type: signalType('float'), value: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const targetInput = inputsById.target;
    if (!targetInput || targetInput.k !== 'sig') {
      throw new Error('Lag target input must be a signal');
    }

    const smoothing = (config?.smoothing as number) ?? 0.1;
    const initialValue = (config?.initialValue as number) ?? 0;

    // Allocate persistent state slot with stable ID
    const stateSlot = ctx.b.allocStateSlot(
      stableStateId(ctx.instanceId, 'lag'),
      { initialValue }
    );

    // Read previous value (Phase 1)
    const prevId = ctx.b.sigStateRead(stateSlot, signalType('float'));

    // Compute: lerp(prev, target, smoothing)
    const smoothConst = ctx.b.sigConst(smoothing, signalType('float'));
    const lerpFn = ctx.b.opcode(OpCode.Lerp);
    const outputId = ctx.b.sigZip(
      [prevId, targetInput.id as SigExprId, smoothConst],
      lerpFn,
      signalType('float')
    );

    // Write output to state for next frame (Phase 2)
    ctx.b.stepStateWrite(stateSlot, outputId);

    const slot = ctx.b.allocSlot();
    const outType = ctx.outTypes[0];

    return {
      outputsById: {
        out: { k: 'sig', id: outputId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// Phasor - Phase accumulator with wrap
// =============================================================================

registerBlock({
  type: 'Phasor',
  label: 'Phasor',
  category: 'signal',
  description: 'Phase accumulator 0..1 with wrap. Distinct from Accumulator (unbounded)',
  form: 'primitive',
  capability: 'state',
  isStateful: true,
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    frequency: { label: 'Frequency', type: signalType('float') },
    initialPhase: { type: signalType('float'), value: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Phase', type: signalType('float', unitPhase01()) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const freqInput = inputsById.frequency;
    if (!freqInput || freqInput.k !== 'sig') {
      throw new Error('Phasor frequency input must be a signal');
    }

    const initialPhase = (config?.initialPhase as number) ?? 0;

    // Allocate persistent state slot
    const stateSlot = ctx.b.allocStateSlot(
      stableStateId(ctx.instanceId, 'phasor'),
      { initialValue: initialPhase }
    );

    // Read previous phase (Phase 1)
    const prevPhase = ctx.b.sigStateRead(stateSlot, signalType('float'));

    // Get dt from time system (in ms)
    const dtMs = ctx.b.sigTime('dt', signalType('float'));

    // Convert dt from ms to seconds: dtSec = dt * 0.001
    const msToSec = ctx.b.sigConst(0.001, signalType('float'));
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const dtSec = ctx.b.sigZip([dtMs, msToSec], mulFn, signalType('float'));

    // Compute phase increment: increment = frequency * dtSec
    const increment = ctx.b.sigZip(
      [freqInput.id as SigExprId, dtSec],
      mulFn,
      signalType('float')
    );

    // Accumulate: rawPhase = prev + increment
    const addFn = ctx.b.opcode(OpCode.Add);
    const rawPhase = ctx.b.sigZip([prevPhase, increment], addFn, signalType('float'));

    // Wrap to [0, 1): newPhase = wrap01(rawPhase)
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const newPhase = ctx.b.sigMap(rawPhase, wrapFn, signalType('float', unitPhase01()));

    // Write new phase to state for next frame (Phase 2)
    ctx.b.stepStateWrite(stateSlot, newPhase);

    const slot = ctx.b.allocSlot();
    const outType = ctx.outTypes[0];

    return {
      outputsById: {
        out: { k: 'sig', id: newPhase, slot, type: outType, stride: strideOf(outType.payload) },
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
    const outType = ctx.outTypes[0];

    return {
      outputsById: {
        out: { k: 'sig', id: hashId, slot, type: outType, stride: strideOf(outType.payload) },
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
    const outType = ctx.outTypes[0];

    return {
      outputsById: {
        out: { k: 'sig', id: normalized, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
