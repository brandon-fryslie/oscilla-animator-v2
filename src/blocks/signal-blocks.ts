/**
 * Signal Blocks
 *
 * Blocks that produce and transform scalar signals.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS, type LowerResult } from './registry';
import { canonicalType, type PayloadType, unitPhase01, unitNorm01, unitVar, payloadVar, strideOf, floatConst, intConst, boolConst, vec2Const, colorConst, cameraProjectionConst } from '../core/canonical-types';
import { FLOAT, INT, BOOL, CAMERA_PROJECTION } from '../core/canonical-types';
import { OpCode, stableStateId } from '../compiler/ir/types';
import { defaultSourceConst } from '../types';
import type { SigExprId, StateSlotId } from '../compiler/ir/Indices';

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
      type: canonicalType(FLOAT),
      value: 0,
      uiHint: { kind: 'slider', min: 1, max: 10000, step: 1 },
      exposedAsPort: false,
    },
  },
  outputs: {
    // Unit is polymorphic (UnitVar) - resolved by pass1 constraint solver
    // Payload is polymorphic (payloadVar) - resolved by pass1 constraint solver
    out: { label: 'Output', type: canonicalType(payloadVar('const_payload'), unitVar('const_out')) },
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

    switch (payloadType.kind) {
      case 'float': {
        if (typeof rawValue !== 'number') {
          throw new Error(`Const<float> requires number value, got ${typeof rawValue}`);
        }
        const sigId = ctx.b.sigConst(floatConst(rawValue), canonicalType(FLOAT));
        const slot = ctx.b.allocSlot(stride);
        return {
          outputsById: {
            out: { k: 'sig', id: sigId, slot, type: outType, stride },
          },
        };
      }
      case 'int': {
        if (typeof rawValue !== 'number') {
          throw new Error(`Const<${payloadType.kind}> requires number value, got ${typeof rawValue}`);
        }
        const sigId = ctx.b.sigConst(intConst(Math.floor(rawValue)), canonicalType(INT));
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
        const sigId = ctx.b.sigConst(boolConst(Boolean(rawValue)), canonicalType(BOOL));
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
        const xSig = ctx.b.sigConst(floatConst(val.x), canonicalType(FLOAT));
        const ySig = ctx.b.sigConst(floatConst(val.y), canonicalType(FLOAT));
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
        const rSig = ctx.b.sigConst(floatConst(val.r), canonicalType(FLOAT));
        const gSig = ctx.b.sigConst(floatConst(val.g), canonicalType(FLOAT));
        const bSig = ctx.b.sigConst(floatConst(val.b), canonicalType(FLOAT));
        const aSig = ctx.b.sigConst(floatConst(val.a), canonicalType(FLOAT));
        const components = [rSig, gSig, bSig, aSig];

        ctx.b.stepSlotWriteStrided(slot, components);

        return {
          outputsById: {
            out: { k: 'sig', id: rSig, slot, type: outType, stride, components },
          },
        };
      }
      case 'cameraProjection': {
        if (typeof rawValue !== 'string') {
          throw new Error(`Const<cameraProjection> requires string value, got ${typeof rawValue}`);
        }
        const sigId = ctx.b.sigConst(cameraProjectionConst(rawValue), canonicalType(CAMERA_PROJECTION));
        const slot = ctx.b.allocSlot(stride);
        return {
          outputsById: {
            out: { k: 'sig', id: sigId, slot, type: outType, stride },
          },
        };
      }
      default: {
        throw new Error(`Unsupported payload type for Const: ${(payloadType as any).kind}`);
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
        const tau = ctx.b.sigConst(floatConst(Math.PI * 2), canonicalType(FLOAT));
        const phaseRadians = ctx.b.sigZip([phase.id, tau], mul, canonicalType(FLOAT, unitPhase01()));
        sigId = ctx.b.sigMap(phaseRadians, sin, canonicalType(FLOAT, unitNorm01()));
        break;
      }
      case 1: {
        // Saw: 2 * (phase - floor(phase)) - 1
        const floor = ctx.b.opcode(OpCode.Floor);
        const sub = ctx.b.opcode(OpCode.Sub);
        const mul = ctx.b.opcode(OpCode.Mul);
        const two = ctx.b.sigConst(floatConst(2), canonicalType(FLOAT));
        const one = ctx.b.sigConst(floatConst(1), canonicalType(FLOAT));

        const phaseFloor = ctx.b.sigMap(phase.id, floor, canonicalType(FLOAT, unitPhase01()));
        const frac = ctx.b.sigZip([phase.id, phaseFloor], sub, canonicalType(FLOAT, unitNorm01()));
        const scaled = ctx.b.sigZip([two, frac], mul, canonicalType(FLOAT, unitNorm01()));
        sigId = ctx.b.sigZip([scaled, one], sub, canonicalType(FLOAT, unitNorm01()));
        break;
      }
      case 2: {
        // Square: phase < 0.5 ? 1 : -1
        const sub = ctx.b.opcode(OpCode.Sub);
        const half = ctx.b.sigConst(floatConst(0.5), canonicalType(FLOAT));
        const sign = ctx.b.opcode(OpCode.Sign);

        const shifted = ctx.b.sigZip([phase.id, half], sub, canonicalType(FLOAT));
        sigId = ctx.b.sigMap(shifted, sign, canonicalType(FLOAT, unitNorm01()));
        break;
      }
      case 3: {
        // Noise: Use simplexNoise1D with phase as seed
        const noise = ctx.b.kernel('simplexNoise1D');
        sigId = ctx.b.sigMap(phase.id, noise, canonicalType(FLOAT, unitNorm01()));
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
  capability: 'state',
  isStateful: true,  // Allows feedback cycles - reads from previous frame
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    delta: { label: 'Delta', type: canonicalType(FLOAT) },
    reset: { label: 'Reset', type: canonicalType(BOOL) },
  },
  outputs: {
    value: { label: 'Value', type: canonicalType(FLOAT) },
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
    const stateId = stableStateId(ctx.instanceId, 'accumulator');
    const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue: 0 });

    // Read current state
    const currentValue = ctx.b.sigStateRead(stateSlot, canonicalType(FLOAT));

    // Compute new value: reset ? 0 : (currentValue + delta)
    const add = ctx.b.opcode(OpCode.Add);
    const zero = ctx.b.sigConst(floatConst(0), canonicalType(FLOAT));
    const newValue = ctx.b.sigZip([currentValue, delta.id], add, canonicalType(FLOAT));

    // Select: reset ? 0 : newValue
    const select = ctx.b.kernel('select');
    const finalValue = ctx.b.sigZip([reset.id, zero, newValue], select, canonicalType(FLOAT));

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

// =============================================================================
// UnitDelay
// =============================================================================

registerBlock({
  type: 'UnitDelay',
  label: 'Unit Delay',
  category: 'signal',
  description: 'Delays input by one frame',
  form: 'primitive',
  capability: 'state',
  isStateful: true,  // Allows feedback cycles - reads from previous frame
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'Input', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(0) },
    initialValue: { type: canonicalType(FLOAT), value: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  // Phase 1: Generate output (reading from state) without needing input resolved
  lowerOutputsOnly: ({ ctx, config }) => {
    const initialValue = (config?.initialValue as number) ?? 0;
    const outType = ctx.outTypes[0];

    // Allocate state slot (will be reused in phase 2)
    const stateId = stableStateId(ctx.instanceId, 'delay');
    const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue });

    // Read previous state (this is the output - delayed by 1 frame)
    const outputId = ctx.b.sigStateRead(stateSlot, canonicalType(FLOAT));

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: outputId, slot, type: outType, stride: strideOf(outType.payload) },
      },
      stateSlot, // Pass to phase 2
    };
  },
  // Phase 2: Generate state write step using resolved input
  lower: ({ ctx, inputsById, config, existingOutputs }): LowerResult => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') {
      throw new Error('UnitDelay requires signal input');
    }

    // If called from two-phase lowering, reuse existing outputs and state slot
    if (existingOutputs?.outputsById && existingOutputs?.stateSlot !== undefined) {
      // Write current input to state for next frame
      ctx.b.stepStateWrite(existingOutputs.stateSlot as StateSlotId, input.id);
      // Return the existing outputs (already registered in phase 1)
      return {
        outputsById: existingOutputs.outputsById,
      };
    }

    // Single-pass lowering (for non-cycle usage)
    const initialValue = (config?.initialValue as number) ?? 0;
    const outType = ctx.outTypes[0];

    // Create state for delayed value
    const stateId = stableStateId(ctx.instanceId, 'delay');
    const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue });

    // Read previous state (this is the output - delayed by 1 frame)
    const outputId = ctx.b.sigStateRead(stateSlot, canonicalType(FLOAT));

    // Write current input to state for next frame
    ctx.b.stepStateWrite(stateSlot, input.id);

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: outputId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// Lag
// =============================================================================

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
    smoothing: { type: canonicalType(FLOAT), value: 0.5, exposedAsPort: false },
    initialValue: { type: canonicalType(FLOAT), value: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const target = inputsById.target;
    if (!target || target.k !== 'sig') {
      throw new Error('Lag requires target signal input');
    }

    const smoothing = (config?.smoothing as number) ?? 0.5;
    const initialValue = (config?.initialValue as number) ?? 0;
    const outType = ctx.outTypes[0];

    // Create state for smoothed value
    const stateId = stableStateId(ctx.instanceId, 'lag');
    const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue });

    // Read previous state
    const prevValue = ctx.b.sigStateRead(stateSlot, canonicalType(FLOAT));

    // Compute: lerp(prev, target, smoothing)
    const lerpFn = ctx.b.opcode(OpCode.Lerp);
    const smoothConst = ctx.b.sigConst(floatConst(smoothing), canonicalType(FLOAT));
    const newValue = ctx.b.sigZip([prevValue, target.id, smoothConst], lerpFn, canonicalType(FLOAT));

    // Write new value to state
    ctx.b.stepStateWrite(stateSlot, newValue);

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: newValue, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// Phasor
// =============================================================================

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
    if (!frequency || frequency.k !== 'sig') {
      throw new Error('Phasor requires frequency signal input');
    }

    const initialPhase = (config?.initialPhase as number) ?? 0;
    const outType = ctx.outTypes[0];

    // Create state for accumulated phase
    const stateId = stableStateId(ctx.instanceId, 'phasor');
    const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue: initialPhase });

    // Read previous phase
    const prevPhase = ctx.b.sigStateRead(stateSlot, canonicalType(FLOAT, unitPhase01()));

    // Read dt from time system (in seconds)
    const dtSig = ctx.b.sigTime('dt', canonicalType(FLOAT));

    // Compute: phase increment = frequency * dt / 1000 (dt is in ms)
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const divFn = ctx.b.opcode(OpCode.Div);
    const thousand = ctx.b.sigConst(floatConst(1000), canonicalType(FLOAT));
    const dtSeconds = ctx.b.sigZip([dtSig, thousand], divFn, canonicalType(FLOAT));
    const increment = ctx.b.sigZip([frequency.id, dtSeconds], mulFn, canonicalType(FLOAT));

    // Add increment to previous phase
    const addFn = ctx.b.opcode(OpCode.Add);
    const rawPhase = ctx.b.sigZip([prevPhase, increment], addFn, canonicalType(FLOAT));

    // Wrap to [0, 1)
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const wrappedPhase = ctx.b.sigMap(rawPhase, wrapFn, canonicalType(FLOAT, unitPhase01()));

    // Write wrapped phase to state
    ctx.b.stepStateWrite(stateSlot, wrappedPhase);

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: wrappedPhase, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// Hash
// =============================================================================

registerBlock({
  type: 'Hash',
  label: 'Hash',
  category: 'signal',
  description: 'Deterministic hash function. Output in [0, 1)',
  form: 'primitive',
  capability: 'pure',
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
    if (!value || value.k !== 'sig') {
      throw new Error('Hash requires value signal input');
    }

    const seed = inputsById.seed;
    let seedId: SigExprId;
    if (seed && seed.k === 'sig') {
      seedId = seed.id;
    } else {
      seedId = ctx.b.sigConst(floatConst(0), canonicalType(FLOAT));
    }

    const hashFn = ctx.b.opcode(OpCode.Hash);
    const hashId = ctx.b.sigZip([value.id, seedId], hashFn, canonicalType(FLOAT));

    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: hashId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
