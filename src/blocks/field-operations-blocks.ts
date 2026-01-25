/**
 * Field Operation Blocks
 *
 * Blocks that perform operations on fields (per-element computations).
 * These blocks are cardinality-generic (work with both Signals and Fields) and
 * payload-generic where applicable.
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from './registry';
import { signalType, signalTypeField, unitPhase01, strideOf } from '../core/canonical-types';
import { defaultSourceConst, defaultSourceTimeRoot } from '../types';
import type { SigExprId, FieldExprId } from '../compiler/ir/Indices';
import { OpCode } from '../compiler/ir/types';

// =============================================================================
// FromDomainId (field-only - domain intrinsic)
// =============================================================================

registerBlock({
  type: 'FromDomainId',
  label: 'From Domain ID',
  category: 'field',
  description: 'Generates normalized (0..1) ID for each element in a domain',
  form: 'primitive',
  capability: 'identity',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    domain: { label: 'Domain', type: signalType('int') }, // Domain count
  },
  outputs: {
    id01: { label: 'ID (0..1)', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx }) => {
    // Get instance context from Array block or inferred from inputs
    const instance = ctx.inferredInstance ?? ctx.instance;
    if (!instance) {
      throw new Error('FromDomainId requires instance context');
    }

    // Use fieldIntrinsic to get normalized index (0..1) for each instance element
    const id01Field = ctx.b.fieldIntrinsic(instance, 'normalizedIndex', signalTypeField('float', 'default'));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        id01: { k: 'field', id: id01Field, slot, type: outType, stride: strideOf(outType.payload) },
      },
      // Propagate instance context
      instanceContext: instance,
    };
  },
});

// NOTE: FieldAdd, FieldMultiply, and FieldScale have been removed.
// Use the cardinality-generic Add and Multiply blocks instead, which work with both
// signals and fields.

// =============================================================================
// Sin (cardinality-generic)
// =============================================================================

registerBlock({
  type: 'Sin',
  label: 'Sin',
  category: 'math',
  description: 'Per-element sine (works with both signals and fields)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  payload: {
    allowedPayloads: {
      input: STANDARD_NUMERIC_PAYLOADS,
      result: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise',
  },
  inputs: {
    input: { label: 'Input', type: signalType('float') },
  },
  outputs: {
    result: { label: 'Result', type: signalType('float') },
  },
  lower: ({ ctx, inputsById }) => {
    const input = inputsById.input;

    if (!input) {
      throw new Error('Sin input required');
    }

    if (input.k === 'sig') {
      // Signal path - use opcode
      const sinFn = ctx.b.opcode(OpCode.Sin);
      const result = ctx.b.sigMap(input.id, sinFn, signalType('float'));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (input.k === 'field') {
      // Field path - use field kernel
      const sinFn = ctx.b.kernel('fieldSin');
      const result = ctx.b.fieldMap(input.id, sinFn, signalTypeField('float', 'default'));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      throw new Error('Sin input must be signal or field');
    }
  },
});

// =============================================================================
// Cos (cardinality-generic)
// =============================================================================

registerBlock({
  type: 'Cos',
  label: 'Cos',
  category: 'math',
  description: 'Per-element cosine (works with both signals and fields)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  payload: {
    allowedPayloads: {
      input: STANDARD_NUMERIC_PAYLOADS,
      result: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise',
  },
  inputs: {
    input: { label: 'Input', type: signalType('float') },
  },
  outputs: {
    result: { label: 'Result', type: signalType('float') },
  },
  lower: ({ ctx, inputsById }) => {
    const input = inputsById.input;

    if (!input) {
      throw new Error('Cos input required');
    }

    if (input.k === 'sig') {
      // Signal path - use opcode
      const cosFn = ctx.b.opcode(OpCode.Cos);
      const result = ctx.b.sigMap(input.id, cosFn, signalType('float'));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (input.k === 'field') {
      // Field path - use field kernel
      const cosFn = ctx.b.kernel('fieldCos');
      const result = ctx.b.fieldMap(input.id, cosFn, signalTypeField('float', 'default'));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      throw new Error('Cos input must be signal or field');
    }
  },
});

// =============================================================================
// Mod (cardinality-generic)
// =============================================================================

registerBlock({
  type: 'Mod',
  label: 'Mod',
  category: 'math',
  description: 'Per-element modulo (works with both signals and fields)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      a: STANDARD_NUMERIC_PAYLOADS,
      b: STANDARD_NUMERIC_PAYLOADS,
      result: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise',
  },
  inputs: {
    a: { label: 'A', type: signalType('float') },
    b: { label: 'B', type: signalType('float') },
  },
  outputs: {
    result: { label: 'Result', type: signalType('float') },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || !b) {
      throw new Error('Mod inputs required');
    }

    if (a.k === 'sig' && b.k === 'sig') {
      // Signal path
      const modFn = ctx.b.opcode(OpCode.Mod);
      const result = ctx.b.sigZip([a.id, b.id], modFn, signalType('float'));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (a.k === 'field' && b.k === 'field') {
      // Field path
      const modFn = ctx.b.kernel('fieldMod');
      const result = ctx.b.fieldZip([a.id, b.id], modFn, signalTypeField('float', 'default'));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      throw new Error('Mod inputs must both be signals or both be fields');
    }
  },
});

// =============================================================================
// FieldPolarToCartesian (field-only - uses broadcast with multiple inputs)
// Note: Kept with "Field" prefix to avoid conflict with signal-only PolarToCartesian in geometry-blocks
// =============================================================================

registerBlock({
  type: 'FieldPolarToCartesian',
  label: 'Field Polar to Cartesian',
  category: 'field',
  description: 'Convert polar coordinates (angle, radius) to Cartesian (x, y)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    angle: { label: 'Angle', type: signalTypeField('float', 'default') },
    radius: { label: 'Radius', type: signalTypeField('float', 'default') },
    centerX: { label: 'Center X', type: signalType('float'), optional: true, value: 0.5, defaultSource: defaultSourceConst(0.5) },
    centerY: { label: 'Center Y', type: signalType('float'), optional: true, value: 0.5, defaultSource: defaultSourceConst(0.5) },
  },
  outputs: {
    pos: { label: 'Position', type: signalTypeField('vec3', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const angle = inputsById.angle;
    const radius = inputsById.radius;
    const centerX = inputsById.centerX;
    const centerY = inputsById.centerY;

    if (!angle || angle.k !== 'field' || !radius || radius.k !== 'field') {
      throw new Error('PolarToCartesian angle and radius must be fields');
    }

    // Get center signals (or create default constants)
    const centerXSig = centerX?.k === 'sig' ? centerX.id : ctx.b.sigConst(0.5, signalType('float'));
    const centerYSig = centerY?.k === 'sig' ? centerY.id : ctx.b.sigConst(0.5, signalType('float'));

    // Broadcast center signals to fields
    const centerXField = ctx.b.Broadcast(centerXSig, signalTypeField('float', 'default'));
    const centerYField = ctx.b.Broadcast(centerYSig, signalTypeField('float', 'default'));

    // Zip all four fields together: centerX, centerY, radius, angle -> vec2
    // NOTE: Order must match kernel expectation in Materializer.ts
    const polarFn = ctx.b.kernel('fieldPolarToCartesian');
    const posField = ctx.b.fieldZip(
      [centerXField, centerYField, radius.id, angle.id],
      polarFn,
      signalTypeField('vec3', 'default')
    );

    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        pos: { k: 'field', id: posField, slot, type: outType, stride: strideOf(outType.payload) },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldCartesianToPolar (field-only - uses broadcast with multiple inputs)
// Note: Kept with "Field" prefix to avoid conflict with signal-only CartesianToPolar in geometry-blocks
// =============================================================================

registerBlock({
  type: 'FieldCartesianToPolar',
  label: 'Field Cartesian to Polar',
  category: 'field',
  description: 'Convert Cartesian coordinates (x, y) to polar (angle, radius)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    pos: { label: 'Position', type: signalTypeField('vec3', 'default') },
    centerX: { label: 'Center X', type: signalType('float'), optional: true, value: 0.5, defaultSource: defaultSourceConst(0.5) },
    centerY: { label: 'Center Y', type: signalType('float'), optional: true, value: 0.5, defaultSource: defaultSourceConst(0.5) },
  },
  outputs: {
    angle: { label: 'Angle', type: signalTypeField('float', 'default') },
    radius: { label: 'Radius', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const pos = inputsById.pos;
    const centerX = inputsById.centerX;
    const centerY = inputsById.centerY;

    if (!pos || pos.k !== 'field') {
      throw new Error('CartesianToPolar pos must be a field');
    }

    // Get center signals (or create default constants)
    const centerXSig = centerX?.k === 'sig' ? centerX.id : ctx.b.sigConst(0.5, signalType('float'));
    const centerYSig = centerY?.k === 'sig' ? centerY.id : ctx.b.sigConst(0.5, signalType('float'));

    // Broadcast center signals to fields
    const centerXField = ctx.b.Broadcast(centerXSig, signalTypeField('float', 'default'));
    const centerYField = ctx.b.Broadcast(centerYSig, signalTypeField('float', 'default'));

    // Zip all three fields together: pos, centerX, centerY -> (angle, radius)
    const polarFn = ctx.b.kernel('fieldCartesianToPolar');
    const angleField = ctx.b.fieldZip(
      [pos.id, centerXField, centerYField],
      polarFn,
      signalTypeField('float', 'default')
    );
    const radiusField = ctx.b.fieldZip(
      [pos.id, centerXField, centerYField],
      polarFn,
      signalTypeField('float', 'default')
    );

    const outTypeAngle = ctx.outTypes[0];
    const outTypeRadius = ctx.outTypes[1];
    const angleSlot = ctx.b.allocSlot();
    const radiusSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        angle: { k: 'field', id: angleField, slot: angleSlot, type: outTypeAngle, stride: strideOf(outTypeAngle.payload) },
        radius: { k: 'field', id: radiusField, slot: radiusSlot, type: outTypeRadius, stride: strideOf(outTypeRadius.payload) },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// Pulse (field-only - uses domain-aware phase distribution)
// =============================================================================

registerBlock({
  type: 'Pulse',
  label: 'Pulse',
  category: 'field',
  description: 'Per-element pulsing animation based on phase and spread',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    id01: { label: 'ID (0..1)', type: signalTypeField('float', 'default') },
    // Phase input expects normalized time cycle [0, 1)
    phase: { label: 'Phase', type: signalType('float', unitPhase01()), defaultSource: defaultSourceTimeRoot('phaseA') },
    base: { label: 'Base', type: signalType('float'), defaultSource: defaultSourceConst(0.5) },
    amplitude: { label: 'Amplitude', type: signalType('float'), defaultSource: defaultSourceConst(1.0) },
    spread: { label: 'Spread', type: signalType('float'), defaultSource: defaultSourceConst(1.0) },
  },
  outputs: {
    value: { label: 'Value', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const id01 = inputsById.id01;
    const phase = inputsById.phase;
    const base = inputsById.base;
    const amplitude = inputsById.amplitude;
    const spread = inputsById.spread;

    if (!id01 || id01.k !== 'field') {
      throw new Error('Pulse id01 must be a field');
    }

    // Broadcast signal inputs to fields
    const phaseSig = phase?.k === 'sig' ? phase.id : ctx.b.sigConst(0, signalType('float', unitPhase01()));
    const baseSig = base?.k === 'sig' ? base.id : ctx.b.sigConst(0, signalType('float'));
    const ampSig = amplitude?.k === 'sig' ? amplitude.id : ctx.b.sigConst(1, signalType('float'));
    const spreadSig = spread?.k === 'sig' ? spread.id : ctx.b.sigConst(1, signalType('float'));

    const phaseField = ctx.b.Broadcast(phaseSig, signalTypeField('float', 'default'));
    const baseField = ctx.b.Broadcast(baseSig, signalTypeField('float', 'default'));
    const ampField = ctx.b.Broadcast(ampSig, signalTypeField('float', 'default'));
    const spreadField = ctx.b.Broadcast(spreadSig, signalTypeField('float', 'default'));

    // Compute: base + amplitude * sin(2π * (phase + id01 * spread))
    const pulseFn = ctx.b.kernel('fieldPulse');
    const result = ctx.b.fieldZip(
      [id01.id, phaseField, baseField, ampField, spreadField],
      pulseFn,
      signalTypeField('float', 'default')
    );

    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        value: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// GoldenAngle (field-only - intrinsic distribution)
// =============================================================================

registerBlock({
  type: 'GoldenAngle',
  label: 'Golden Angle',
  category: 'field',
  description: 'Generate golden angle distribution for each element',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    id01: { label: 'ID (0..1)', type: signalTypeField('float', 'default') },
    turns: { label: 'Turns', type: signalType('float'), value: 50, exposedAsPort: false, hidden: true },
  },
  outputs: {
    angle: { label: 'Angle', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const id01 = inputsById.id01;

    if (!id01 || id01.k !== 'field') {
      throw new Error('GoldenAngle id01 must be a field');
    }

    // Golden angle ≈ 2.39996... radians (137.508°)
    // angle = id01 * turns * goldenAngle
    const goldenAngleFn = ctx.b.kernel('fieldGoldenAngle');
    // Use fieldZip (not fieldMap) because fieldGoldenAngle is a field kernel
    const result = ctx.b.fieldZip([id01.id], goldenAngleFn, signalTypeField('float', 'default'));

    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        angle: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// AngularOffset (field-only - uses domain-aware distribution)
// =============================================================================

registerBlock({
  type: 'AngularOffset',
  label: 'Angular Offset',
  category: 'field',
  description: 'Per-element angular offset based on phase and spin',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    id01: { label: 'ID (0..1)', type: signalTypeField('float', 'default') },
    phase: { label: 'Phase', type: signalType('float', unitPhase01()), defaultSource: defaultSourceTimeRoot('phaseA') },
    spin: { label: 'Spin', type: signalType('float'), defaultSource: defaultSourceConst(1.0) },
  },
  outputs: {
    offset: { label: 'Offset', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const id01 = inputsById.id01;
    const phase = inputsById.phase;
    const spin = inputsById.spin;

    if (!id01 || id01.k !== 'field') {
      throw new Error('AngularOffset id01 must be a field');
    }

    // Broadcast signal inputs to fields
    const phaseSig = phase?.k === 'sig' ? phase.id : ctx.b.sigConst(0, signalType('float'));
    const spinSig = spin?.k === 'sig' ? spin.id : ctx.b.sigConst(1, signalType('float'));

    const phaseField = ctx.b.Broadcast(phaseSig, signalTypeField('float', 'default'));
    const spinField = ctx.b.Broadcast(spinSig, signalTypeField('float', 'default'));

    // offset = 2π * phase * spin
    const offsetFn = ctx.b.kernel('fieldAngularOffset');
    const result = ctx.b.fieldZip(
      [id01.id, phaseField, spinField],
      offsetFn,
      signalTypeField('float', 'default')
    );

    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        offset: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// RadiusSqrt (field-only - per-field operation)
// =============================================================================

registerBlock({
  type: 'RadiusSqrt',
  label: 'Radius Sqrt',
  category: 'field',
  description: 'Square root radius distribution for even area coverage',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    id01: { label: 'ID (0..1)', type: signalTypeField('float', 'default') },
    radius: { label: 'Radius', type: signalTypeField('float', 'default'), defaultSource: defaultSourceConst(0.35) },
  },
  outputs: {
    out: { label: 'Radius', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const id01 = inputsById.id01;
    const radius = inputsById.radius;

    if (!id01 || id01.k !== 'field') {
      throw new Error('RadiusSqrt id01 must be a field');
    }
    if (!radius || radius.k !== 'field') {
      throw new Error('RadiusSqrt radius must be a field');
    }

    // effective_radius = radius * sqrt(id01)
    const sqrtFn = ctx.b.kernel('fieldRadiusSqrt');
    const result = ctx.b.fieldZip(
      [id01.id, radius.id],
      sqrtFn,
      signalTypeField('float', 'default')
    );

    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// Jitter2D (field-only - per-field operation)
// =============================================================================

registerBlock({
  type: 'Jitter2D',
  label: 'Jitter 2D',
  category: 'field',
  description: 'Add per-element random jitter to 2D positions',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    pos: { label: 'Position', type: signalTypeField('vec2', 'default') },
    rand: { label: 'Random', type: signalTypeField('float', 'default') },
    amountX: { label: 'Amount X', type: signalType('float'), defaultSource: defaultSourceConst(0.01) },
    amountY: { label: 'Amount Y', type: signalType('float'), defaultSource: defaultSourceConst(0.01) },
  },
  outputs: {
    out: { label: 'Position', type: signalTypeField('vec2', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const pos = inputsById.pos;
    const rand = inputsById.rand;
    const amountX = inputsById.amountX;
    const amountY = inputsById.amountY;

    if (!pos || pos.k !== 'field') {
      throw new Error('Jitter2D pos must be a field');
    }
    if (!rand || rand.k !== 'field') {
      throw new Error('Jitter2D rand must be a field');
    }

    // Broadcast signal inputs to fields
    const amountXSig = amountX?.k === 'sig' ? amountX.id : ctx.b.sigConst(0, signalType('float'));
    const amountYSig = amountY?.k === 'sig' ? amountY.id : ctx.b.sigConst(0, signalType('float'));

    const amountXField = ctx.b.Broadcast(amountXSig, signalTypeField('float', 'default'));
    const amountYField = ctx.b.Broadcast(amountYSig, signalTypeField('float', 'default'));

    // pos += vec2(rand * amountX, rand * amountY)
    const jitterFn = ctx.b.kernel('fieldJitter2D');
    const result = ctx.b.fieldZip(
      [pos.id, rand.id, amountXField, amountYField],
      jitterFn,
      signalTypeField('vec2', 'default')
    );

    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// HueFromPhase (field-only - domain-aware hue generation)
// =============================================================================

registerBlock({
  type: 'HueFromPhase',
  label: 'Hue From Phase',
  category: 'field',
  description: 'Generate per-element hue values from phase and ID',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    id01: { label: 'ID (0..1)', type: signalTypeField('float', 'default') },
    phase: { label: 'Phase', type: signalType('float', unitPhase01()), defaultSource: defaultSourceTimeRoot('phaseA') },
  },
  outputs: {
    hue: { label: 'Hue', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const id01 = inputsById.id01;
    const phase = inputsById.phase;

    if (!id01 || id01.k !== 'field') {
      throw new Error('HueFromPhase id01 must be a field');
    }

    // Broadcast phase to field
    const phaseSig = phase?.k === 'sig' ? phase.id : ctx.b.sigConst(0, signalType('float'));
    const phaseField = ctx.b.Broadcast(phaseSig, signalTypeField('float', 'default'));

    // hue = (id01 + phase) mod 1.0
    const hueFn = ctx.b.kernel('fieldHueFromPhase');
    const result = ctx.b.fieldZip(
      [id01.id, phaseField],
      hueFn,
      signalTypeField('float', 'default')
    );

    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        hue: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// SetZ (field-only - per-field operation)
// =============================================================================

/**
 * Sets the Z component of a vec3 position field.
 * Useful for adding depth/height animation to 2D layouts.
 */
registerBlock({
  type: 'SetZ',
  label: 'Set Z',
  category: 'field',
  description: 'Set the Z component of a vec3 position field',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    pos: { label: 'Position', type: signalTypeField('vec3', 'default') },
    z: { label: 'Z', type: signalTypeField('float', 'default') },
  },
  outputs: {
    out: { label: 'Output', type: signalTypeField('vec3', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const pos = inputsById.pos;
    const z = inputsById.z;

    if (!pos || pos.k !== 'field') {
      throw new Error('SetZ pos must be a field');
    }
    if (!z || z.k !== 'field') {
      throw new Error('SetZ z must be a field');
    }

    // Zip position and z together: (vec3, float) -> vec3 with new z
    const setZFn = ctx.b.kernel('fieldSetZ');
    const result = ctx.b.fieldZip(
      [pos.id, z.id],
      setZFn,
      signalTypeField('vec3', 'default')
    );

    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
      },
      instanceContext: ctx.inferredInstance,
    };
  },
});
