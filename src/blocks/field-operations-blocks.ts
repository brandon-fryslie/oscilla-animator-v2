/**
 * Field Operation Blocks
 *
 * Blocks that perform operations on fields (per-element computations).
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField } from '../core/canonical-types';
import { defaultSourceConst, defaultSourceTimeRoot } from '../types';
import type { SigExprId, FieldExprId } from '../compiler/ir/Indices';

// =============================================================================
// FieldFromDomainId
// =============================================================================

registerBlock({
  type: 'FieldFromDomainId',
  label: 'Field From Domain ID',
  category: 'field',
  description: 'Generates normalized (0..1) ID for each element in a domain',
  form: 'primitive',
  capability: 'identity',
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
      throw new Error('FieldFromDomainId requires instance context');
    }

    // Use fieldIntrinsic to get normalized index (0..1) for each instance element
    const id01Field = ctx.b.fieldIntrinsic(instance, 'normalizedIndex', signalTypeField('float', 'default'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        id01: { k: 'field', id: id01Field, slot },
      },
      // Propagate instance context
      instanceContext: instance,
    };
  },
});

// =============================================================================
// FieldAdd
// =============================================================================

registerBlock({
  type: 'FieldAdd',
  label: 'Field Add',
  category: 'field',
  description: 'Per-element addition of two fields',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    a: { label: 'A', type: signalTypeField('float', 'default') },
    b: { label: 'B', type: signalTypeField('float', 'default') },
  },
  outputs: {
    out: { label: 'Output', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || a.k !== 'field' || !b || b.k !== 'field') {
      throw new Error('FieldAdd inputs must be fields');
    }

    const addFn = ctx.b.kernel('fieldAdd');
    const result = ctx.b.fieldZip([a.id, b.id], addFn, signalTypeField('float', 'default'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'field', id: result, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldMultiply
// =============================================================================

registerBlock({
  type: 'FieldMultiply',
  label: 'Field Multiply',
  category: 'field',
  description: 'Per-element multiplication of two fields',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    a: { label: 'A', type: signalTypeField('float', 'default') },
    b: { label: 'B', type: signalTypeField('float', 'default') },
  },
  outputs: {
    result: { label: 'Result', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || a.k !== 'field' || !b || b.k !== 'field') {
      throw new Error('FieldMultiply inputs must be fields');
    }

    const mulFn = ctx.b.kernel('fieldMultiply');
    const result = ctx.b.fieldZip([a.id, b.id], mulFn, signalTypeField('float', 'default'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        result: { k: 'field', id: result, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldScale
// =============================================================================

registerBlock({
  type: 'FieldScale',
  label: 'Field Scale',
  category: 'field',
  description: 'Scale a field by a signal',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    field: { label: 'Field', type: signalTypeField('float', 'default') },
    scale: { label: 'Scale', type: signalType('float'), defaultSource: defaultSourceConst(1.0) },
  },
  outputs: {
    result: { label: 'Result', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const field = inputsById.field;
    const scale = inputsById.scale;

    if (!field || field.k !== 'field') {
      throw new Error('FieldScale field input must be a field');
    }
    if (!scale || scale.k !== 'sig') {
      throw new Error('FieldScale scale input must be a signal');
    }

    const scaleFn = ctx.b.kernel('fieldScale');
    const result = ctx.b.fieldZipSig(field.id, [scale.id], scaleFn, signalTypeField('float', 'default'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        result: { k: 'field', id: result, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldSin
// =============================================================================

registerBlock({
  type: 'FieldSin',
  label: 'Field Sin',
  category: 'field',
  description: 'Per-element sine of a field',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    input: { label: 'Input', type: signalTypeField('float', 'default') },
  },
  outputs: {
    result: { label: 'Result', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const input = inputsById.input;

    if (!input || input.k !== 'field') {
      throw new Error('FieldSin input must be a field');
    }

    const sinFn = ctx.b.kernel('fieldSin');
    const result = ctx.b.fieldMap(input.id, sinFn, signalTypeField('float', 'default'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        result: { k: 'field', id: result, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldCos
// =============================================================================

registerBlock({
  type: 'FieldCos',
  label: 'Field Cos',
  category: 'field',
  description: 'Per-element cosine of a field',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    input: { label: 'Input', type: signalTypeField('float', 'default') },
  },
  outputs: {
    result: { label: 'Result', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const input = inputsById.input;

    if (!input || input.k !== 'field') {
      throw new Error('FieldCos input must be a field');
    }

    const cosFn = ctx.b.kernel('fieldCos');
    const result = ctx.b.fieldMap(input.id, cosFn, signalTypeField('float', 'default'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        result: { k: 'field', id: result, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldMod
// =============================================================================

registerBlock({
  type: 'FieldMod',
  label: 'Field Modulo',
  category: 'field',
  description: 'Per-element modulo of two fields',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    a: { label: 'A', type: signalTypeField('float', 'default') },
    b: { label: 'B', type: signalTypeField('float', 'default') },
  },
  outputs: {
    result: { label: 'Result', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || a.k !== 'field' || !b || b.k !== 'field') {
      throw new Error('FieldMod inputs must be fields');
    }

    const modFn = ctx.b.kernel('fieldMod');
    const result = ctx.b.fieldZip([a.id, b.id], modFn, signalTypeField('float', 'default'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        result: { k: 'field', id: result, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldPolarToCartesian
// =============================================================================

registerBlock({
  type: 'FieldPolarToCartesian',
  label: 'Field Polar to Cartesian',
  category: 'field',
  description: 'Convert polar coordinates (angle, radius) to Cartesian (x, y)',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    angle: { label: 'Angle', type: signalTypeField('float', 'default') },
    radius: { label: 'Radius', type: signalTypeField('float', 'default') },
    centerX: { label: 'Center X', type: signalType('float'), optional: true, value: 0.5, defaultSource: defaultSourceConst(0.5) },
    centerY: { label: 'Center Y', type: signalType('float'), optional: true, value: 0.5, defaultSource: defaultSourceConst(0.5) },
  },
  outputs: {
    pos: { label: 'Position', type: signalTypeField('vec2', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const angle = inputsById.angle;
    const radius = inputsById.radius;
    const centerX = inputsById.centerX;
    const centerY = inputsById.centerY;

    if (!angle || angle.k !== 'field' || !radius || radius.k !== 'field') {
      throw new Error('FieldPolarToCartesian angle and radius must be fields');
    }

    // Get center signals (or create default constants)
    const centerXSig = centerX?.k === 'sig' ? centerX.id : ctx.b.sigConst(0.5, signalType('float'));
    const centerYSig = centerY?.k === 'sig' ? centerY.id : ctx.b.sigConst(0.5, signalType('float'));

    // Broadcast center signals to fields
    const centerXField = ctx.b.fieldBroadcast(centerXSig, signalTypeField('float', 'default'));
    const centerYField = ctx.b.fieldBroadcast(centerYSig, signalTypeField('float', 'default'));

    // Zip all four fields together: centerX, centerY, radius, angle -> vec2
    // NOTE: Order must match kernel expectation in Materializer.ts
    const polarFn = ctx.b.kernel('fieldPolarToCartesian');
    const posField = ctx.b.fieldZip(
      [centerXField, centerYField, radius.id, angle.id],
      polarFn,
      signalTypeField('vec2', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        pos: { k: 'field', id: posField, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldCartesianToPolar
// =============================================================================

registerBlock({
  type: 'FieldCartesianToPolar',
  label: 'Field Cartesian to Polar',
  category: 'field',
  description: 'Convert Cartesian coordinates (x, y) to polar (angle, radius)',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    pos: { label: 'Position', type: signalTypeField('vec2', 'default') },
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
      throw new Error('FieldCartesianToPolar pos must be a field');
    }

    // Get center signals (or create default constants)
    const centerXSig = centerX?.k === 'sig' ? centerX.id : ctx.b.sigConst(0.5, signalType('float'));
    const centerYSig = centerY?.k === 'sig' ? centerY.id : ctx.b.sigConst(0.5, signalType('float'));

    // Broadcast center signals to fields
    const centerXField = ctx.b.fieldBroadcast(centerXSig, signalTypeField('float', 'default'));
    const centerYField = ctx.b.fieldBroadcast(centerYSig, signalTypeField('float', 'default'));

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

    const angleSlot = ctx.b.allocSlot();
    const radiusSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        angle: { k: 'field', id: angleField, slot: angleSlot },
        radius: { k: 'field', id: radiusField, slot: radiusSlot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldPulse
// =============================================================================

registerBlock({
  type: 'FieldPulse',
  label: 'Field Pulse',
  category: 'field',
  description: 'Per-element pulsing animation based on phase and spread',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    id01: { label: 'ID (0..1)', type: signalTypeField('float', 'default') },
    // Phase input expects normalized time cycle [0, 1)
    phase: { label: 'Phase', type: signalType('phase'), defaultSource: defaultSourceTimeRoot('phaseA') },
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
      throw new Error('FieldPulse id01 must be a field');
    }

    // Broadcast signal inputs to fields
    const phaseSig = phase?.k === 'sig' ? phase.id : ctx.b.sigConst(0, signalType('phase'));
    const baseSig = base?.k === 'sig' ? base.id : ctx.b.sigConst(0, signalType('float'));
    const ampSig = amplitude?.k === 'sig' ? amplitude.id : ctx.b.sigConst(1, signalType('float'));
    const spreadSig = spread?.k === 'sig' ? spread.id : ctx.b.sigConst(1, signalType('float'));

    const phaseField = ctx.b.fieldBroadcast(phaseSig, signalTypeField('float', 'default'));
    const baseField = ctx.b.fieldBroadcast(baseSig, signalTypeField('float', 'default'));
    const ampField = ctx.b.fieldBroadcast(ampSig, signalTypeField('float', 'default'));
    const spreadField = ctx.b.fieldBroadcast(spreadSig, signalTypeField('float', 'default'));

    // Compute: base + amplitude * sin(2π * (phase + id01 * spread))
    const pulseFn = ctx.b.kernel('fieldPulse');
    const result = ctx.b.fieldZip(
      [id01.id, phaseField, baseField, ampField, spreadField],
      pulseFn,
      signalTypeField('float', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        value: { k: 'field', id: result, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldGoldenAngle
// =============================================================================

registerBlock({
  type: 'FieldGoldenAngle',
  label: 'Field Golden Angle',
  category: 'field',
  description: 'Generate golden angle distribution for each element',
  form: 'primitive',
  capability: 'pure',
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
      throw new Error('FieldGoldenAngle id01 must be a field');
    }

    // Golden angle ≈ 2.39996... radians (137.508°)
    // angle = id01 * turns * goldenAngle
    const goldenAngleFn = ctx.b.kernel('fieldGoldenAngle');
    // Use fieldZip (not fieldMap) because fieldGoldenAngle is a field kernel
    const result = ctx.b.fieldZip([id01.id], goldenAngleFn, signalTypeField('float', 'default'));

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        angle: { k: 'field', id: result, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldAngularOffset
// =============================================================================

registerBlock({
  type: 'FieldAngularOffset',
  label: 'Field Angular Offset',
  category: 'field',
  description: 'Per-element angular offset based on phase and spin',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    id01: { label: 'ID (0..1)', type: signalTypeField('float', 'default') },
    // Phase input expects normalized time cycle [0, 1)
    phase: { label: 'Phase', type: signalType('phase'), defaultSource: defaultSourceTimeRoot('phaseA') },
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
      throw new Error('FieldAngularOffset id01 must be a field');
    }

    // Broadcast signal inputs to fields
    const phaseSig = phase?.k === 'sig' ? phase.id : ctx.b.sigConst(0, signalType('phase'));
    const spinSig = spin?.k === 'sig' ? spin.id : ctx.b.sigConst(1, signalType('float'));

    const phaseField = ctx.b.fieldBroadcast(phaseSig, signalTypeField('float', 'default'));
    const spinField = ctx.b.fieldBroadcast(spinSig, signalTypeField('float', 'default'));

    // offset = 2π * phase * spin
    const offsetFn = ctx.b.kernel('fieldAngularOffset');
    const result = ctx.b.fieldZip(
      [id01.id, phaseField, spinField],
      offsetFn,
      signalTypeField('float', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        offset: { k: 'field', id: result, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldRadiusSqrt
// =============================================================================

registerBlock({
  type: 'FieldRadiusSqrt',
  label: 'Field Radius Sqrt',
  category: 'field',
  description: 'Square root radius distribution for even area coverage',
  form: 'primitive',
  capability: 'pure',
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
      throw new Error('FieldRadiusSqrt id01 must be a field');
    }
    if (!radius || radius.k !== 'field') {
      throw new Error('FieldRadiusSqrt radius must be a field');
    }

    // effective_radius = radius * sqrt(id01)
    const sqrtFn = ctx.b.kernel('fieldRadiusSqrt');
    const result = ctx.b.fieldZip(
      [id01.id, radius.id],
      sqrtFn,
      signalTypeField('float', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'field', id: result, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldJitter2D
// =============================================================================

registerBlock({
  type: 'FieldJitter2D',
  label: 'Field Jitter 2D',
  category: 'field',
  description: 'Add per-element random jitter to 2D positions',
  form: 'primitive',
  capability: 'pure',
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
      throw new Error('FieldJitter2D pos must be a field');
    }
    if (!rand || rand.k !== 'field') {
      throw new Error('FieldJitter2D rand must be a field');
    }

    // Broadcast signal inputs to fields
    const amountXSig = amountX?.k === 'sig' ? amountX.id : ctx.b.sigConst(0, signalType('float'));
    const amountYSig = amountY?.k === 'sig' ? amountY.id : ctx.b.sigConst(0, signalType('float'));

    const amountXField = ctx.b.fieldBroadcast(amountXSig, signalTypeField('float', 'default'));
    const amountYField = ctx.b.fieldBroadcast(amountYSig, signalTypeField('float', 'default'));

    // pos += vec2(rand * amountX, rand * amountY)
    const jitterFn = ctx.b.kernel('fieldJitter2D');
    const result = ctx.b.fieldZip(
      [pos.id, rand.id, amountXField, amountYField],
      jitterFn,
      signalTypeField('vec2', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'field', id: result, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// =============================================================================
// FieldHueFromPhase
// =============================================================================

registerBlock({
  type: 'FieldHueFromPhase',
  label: 'Field Hue From Phase',
  category: 'field',
  description: 'Generate per-element hue values from phase and ID',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    id01: { label: 'ID (0..1)', type: signalTypeField('float', 'default') },
    // Phase input expects normalized time cycle [0, 1)
    phase: { label: 'Phase', type: signalType('phase'), defaultSource: defaultSourceTimeRoot('phaseA') },
  },
  outputs: {
    hue: { label: 'Hue', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const id01 = inputsById.id01;
    const phase = inputsById.phase;

    if (!id01 || id01.k !== 'field') {
      throw new Error('FieldHueFromPhase id01 must be a field');
    }

    // Broadcast phase to field
    const phaseSig = phase?.k === 'sig' ? phase.id : ctx.b.sigConst(0, signalType('phase'));
    const phaseField = ctx.b.fieldBroadcast(phaseSig, signalTypeField('float', 'default'));

    // hue = (id01 + phase) mod 1.0
    const hueFn = ctx.b.kernel('fieldHueFromPhase');
    const result = ctx.b.fieldZip(
      [id01.id, phaseField],
      hueFn,
      signalTypeField('float', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        hue: { k: 'field', id: result, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});
