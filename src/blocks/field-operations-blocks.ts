/**
 * Field Operation Blocks
 *
 * Blocks that perform operations on fields (per-element computations).
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField } from '../core/canonical-types';
import type { SigExprId, FieldExprId } from '../compiler/ir/Indices';
import { domainId } from '../compiler/ir/Indices';

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
  inputs: [
    { id: 'domain', label: 'Domain', type: signalType('domain') },
  ],
  outputs: [
    { id: 'id01', label: 'ID (0..1)', type: signalTypeField('float', 'default') },
  ],
  params: {},
  lower: ({ ctx }) => {
    // Use fieldSource to get normalized index (0..1) for each domain element
    const domain = domainId('default');
    const id01Field = ctx.b.fieldSource(domain, 'normalizedIndex', signalTypeField('float', 'default'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        id01: { k: 'field', id: id01Field, slot },
      },
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
  description: 'Pulsing wave across field elements with per-element phase offset',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'phase', label: 'Phase', type: signalType('float') },
    { id: 'id01', label: 'ID (0..1)', type: signalTypeField('float', 'default') },
    { id: 'base', label: 'Base', type: signalType('float') },
    { id: 'amplitude', label: 'Amplitude', type: signalType('float') },
    { id: 'spread', label: 'Spread', type: signalType('float') },
  ],
  outputs: [
    { id: 'value', label: 'Value', type: signalTypeField('float', 'default') },
  ],
  params: {},
  lower: ({ ctx, inputsById }) => {
    const phase = inputsById.phase;
    const id01 = inputsById.id01;
    const base = inputsById.base;
    const amplitude = inputsById.amplitude;
    const spread = inputsById.spread;

    if (!phase || phase.k !== 'sig') {
      throw new Error('FieldPulse phase must be a signal');
    }
    if (!id01 || id01.k !== 'field') {
      throw new Error('FieldPulse id01 must be a field');
    }

    const phaseSig = phase.id as SigExprId;
    const baseSig = base?.k === 'sig' ? (base.id as SigExprId) : ctx.b.sigConst(1.0, signalType('float'));
    const amplitudeSig = amplitude?.k === 'sig' ? (amplitude.id as SigExprId) : ctx.b.sigConst(0.5, signalType('float'));
    const spreadSig = spread?.k === 'sig' ? (spread.id as SigExprId) : ctx.b.sigConst(1.0, signalType('float'));

    // Calculate: base + amplitude * sin(phase + id01 * spread * 2π)
    const pulseFn = ctx.b.kernel('fieldPulse');
    const valueField = ctx.b.fieldZipSig(
      id01.id as FieldExprId,
      [phaseSig, baseSig, amplitudeSig, spreadSig],
      pulseFn,
      signalTypeField('float', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        value: { k: 'field', id: valueField, slot },
      },
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
  description: 'Golden angle spiral distribution (137.5° increments)',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'id01', label: 'ID (0..1)', type: signalTypeField('float', 'default') },
  ],
  outputs: [
    { id: 'angle', label: 'Angle', type: signalTypeField('float', 'default') },
  ],
  params: {
    turns: 1,
  },
  lower: ({ ctx, inputsById, config }) => {
    const id01 = inputsById.id01;

    if (!id01 || id01.k !== 'field') {
      throw new Error('FieldGoldenAngle id01 must be a field');
    }

    const turns = (config?.turns as number) ?? 1;
    const turnsSig = ctx.b.sigConst(turns, signalType('float'));

    // Calculate: id01 * turns * 137.5° (golden angle)
    const goldenFn = ctx.b.kernel('fieldGoldenAngle');
    const angleField = ctx.b.fieldZipSig(
      id01.id as FieldExprId,
      [turnsSig],
      goldenFn,
      signalTypeField('float', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        angle: { k: 'field', id: angleField, slot },
      },
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
  description: 'Applies angular offset based on phase and ID',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'phase', label: 'Phase', type: signalType('float') },
    { id: 'id01', label: 'ID (0..1)', type: signalTypeField('float', 'default') },
    { id: 'spin', label: 'Spin', type: signalType('float') },
  ],
  outputs: [
    { id: 'offset', label: 'Offset', type: signalTypeField('float', 'default') },
  ],
  params: {},
  lower: ({ ctx, inputsById }) => {
    const phase = inputsById.phase;
    const id01 = inputsById.id01;
    const spin = inputsById.spin;

    if (!phase || phase.k !== 'sig') {
      throw new Error('FieldAngularOffset phase must be a signal');
    }
    if (!id01 || id01.k !== 'field') {
      throw new Error('FieldAngularOffset id01 must be a field');
    }

    const phaseSig = phase.id as SigExprId;
    const spinSig = spin?.k === 'sig' ? (spin.id as SigExprId) : ctx.b.sigConst(1.0, signalType('float'));

    // Calculate: phase * spin * 2π
    const offsetFn = ctx.b.kernel('fieldAngularOffset');
    const offsetField = ctx.b.fieldZipSig(
      id01.id as FieldExprId,
      [phaseSig, spinSig],
      offsetFn,
      signalTypeField('float', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        offset: { k: 'field', id: offsetField, slot },
      },
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
  description: 'Adds two fields element-wise',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'a', label: 'A', type: signalTypeField('float', 'default') },
    { id: 'b', label: 'B', type: signalTypeField('float', 'default') },
  ],
  outputs: [
    { id: 'out', label: 'Output', type: signalTypeField('float', 'default') },
  ],
  params: {},
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || a.k !== 'field' || !b || b.k !== 'field') {
      throw new Error('FieldAdd inputs must be fields');
    }

    const addFn = ctx.b.kernel('add');
    const outField = ctx.b.fieldZip(
      [a.id as FieldExprId, b.id as FieldExprId],
      addFn,
      signalTypeField('float', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'field', id: outField, slot },
      },
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
  description: 'Square root distribution for even area coverage',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'id01', label: 'ID (0..1)', type: signalTypeField('float', 'default') },
    { id: 'radius', label: 'Radius', type: signalTypeField('float', 'default') },
  ],
  outputs: [
    { id: 'radius', label: 'Radius', type: signalTypeField('float', 'default') },
  ],
  params: {},
  lower: ({ ctx, inputsById }) => {
    const id01 = inputsById.id01;
    const radius = inputsById.radius;

    if (!id01 || id01.k !== 'field') {
      throw new Error('FieldRadiusSqrt id01 must be a field');
    }
    if (!radius || radius.k !== 'field') {
      throw new Error('FieldRadiusSqrt radius must be a field');
    }

    // Calculate: radius * sqrt(id01)
    const sqrtFn = ctx.b.kernel('fieldRadiusSqrt');
    const outField = ctx.b.fieldZip(
      [radius.id as FieldExprId, id01.id as FieldExprId],
      sqrtFn,
      signalTypeField('float', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        radius: { k: 'field', id: outField, slot },
      },
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
  description: 'Converts polar coordinates to cartesian for fields',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'angle', label: 'Angle', type: signalTypeField('float', 'default') },
    { id: 'radius', label: 'Radius', type: signalTypeField('float', 'default') },
    { id: 'centerX', label: 'Center X', type: signalType('float') },
    { id: 'centerY', label: 'Center Y', type: signalType('float') },
  ],
  outputs: [
    { id: 'pos', label: 'Position', type: signalTypeField('vec2', 'default') },
  ],
  params: {},
  lower: ({ ctx, inputsById }) => {
    const angle = inputsById.angle;
    const radius = inputsById.radius;
    const centerX = inputsById.centerX;
    const centerY = inputsById.centerY;

    if (!angle || angle.k !== 'field' || !radius || radius.k !== 'field') {
      throw new Error('FieldPolarToCartesian angle and radius must be fields');
    }

    const centerXSig = centerX?.k === 'sig' ? (centerX.id as SigExprId) : ctx.b.sigConst(0.5, signalType('float'));
    const centerYSig = centerY?.k === 'sig' ? (centerY.id as SigExprId) : ctx.b.sigConst(0.5, signalType('float'));

    // Zip angle and radius fields together
    const polarFn = ctx.b.kernel('fieldPolarToCartesian');
    const posField = ctx.b.fieldZipSig(
      angle.id as FieldExprId,
      [radius.id as FieldExprId, centerXSig, centerYSig],
      polarFn,
      signalTypeField('vec2', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        pos: { k: 'field', id: posField, slot },
      },
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
  description: 'Adds random jitter to 2D positions',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'pos', label: 'Position', type: signalTypeField('vec2', 'default') },
    { id: 'rand', label: 'Random', type: signalTypeField('float', 'default') },
    { id: 'amountX', label: 'Amount X', type: signalType('float') },
    { id: 'amountY', label: 'Amount Y', type: signalType('float') },
  ],
  outputs: [
    { id: 'pos', label: 'Position', type: signalTypeField('vec2', 'default') },
  ],
  params: {},
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

    const amountXSig = amountX?.k === 'sig' ? (amountX.id as SigExprId) : ctx.b.sigConst(0.01, signalType('float'));
    const amountYSig = amountY?.k === 'sig' ? (amountY.id as SigExprId) : ctx.b.sigConst(0.01, signalType('float'));

    // Apply jitter: pos + random offset
    const jitterFn = ctx.b.kernel('fieldJitter2D');
    const outField = ctx.b.fieldZipSig(
      pos.id as FieldExprId,
      [rand.id as FieldExprId, amountXSig, amountYSig],
      jitterFn,
      signalTypeField('vec2', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        pos: { k: 'field', id: outField, slot },
      },
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
  description: 'Generates rainbow hue values from phase and ID',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'phase', label: 'Phase', type: signalType('float') },
    { id: 'id01', label: 'ID (0..1)', type: signalTypeField('float', 'default') },
  ],
  outputs: [
    { id: 'hue', label: 'Hue', type: signalTypeField('float', 'default') },
  ],
  params: {},
  lower: ({ ctx, inputsById }) => {
    const phase = inputsById.phase;
    const id01 = inputsById.id01;

    if (!phase || phase.k !== 'sig') {
      throw new Error('FieldHueFromPhase phase must be a signal');
    }
    if (!id01 || id01.k !== 'field') {
      throw new Error('FieldHueFromPhase id01 must be a field');
    }

    // Calculate: (phase + id01) mod 1.0
    const hueFn = ctx.b.kernel('fieldHueFromPhase');
    const hueField = ctx.b.fieldZipSig(
      id01.id as FieldExprId,
      [phase.id as SigExprId],
      hueFn,
      signalTypeField('float', 'default')
    );

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        hue: { k: 'field', id: hueField, slot },
      },
    };
  },
});
