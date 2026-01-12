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
    { id: 'domain', label: 'Domain', type: signalType('int') }, // Domain count
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
// FieldAdd
// =============================================================================

registerBlock({
  type: 'FieldAdd',
  label: 'Field Add',
  category: 'field',
  description: 'Per-element addition of two fields',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'a', label: 'A', type: signalTypeField('float', 'default') },
    { id: 'b', label: 'B', type: signalTypeField('float', 'default') },
  ],
  outputs: [
    { id: 'result', label: 'Result', type: signalTypeField('float', 'default') },
  ],
  params: {},
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
        result: { k: 'field', id: result, slot },
      },
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
  inputs: [
    { id: 'a', label: 'A', type: signalTypeField('float', 'default') },
    { id: 'b', label: 'B', type: signalTypeField('float', 'default') },
  ],
  outputs: [
    { id: 'result', label: 'Result', type: signalTypeField('float', 'default') },
  ],
  params: {},
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
  inputs: [
    { id: 'field', label: 'Field', type: signalTypeField('float', 'default') },
    { id: 'scale', label: 'Scale', type: signalType('float') },
  ],
  outputs: [
    { id: 'result', label: 'Result', type: signalTypeField('float', 'default') },
  ],
  params: {},
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
  inputs: [
    { id: 'input', label: 'Input', type: signalTypeField('float', 'default') },
  ],
  outputs: [
    { id: 'result', label: 'Result', type: signalTypeField('float', 'default') },
  ],
  params: {},
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
  inputs: [
    { id: 'input', label: 'Input', type: signalTypeField('float', 'default') },
  ],
  outputs: [
    { id: 'result', label: 'Result', type: signalTypeField('float', 'default') },
  ],
  params: {},
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
  inputs: [
    { id: 'a', label: 'A', type: signalTypeField('float', 'default') },
    { id: 'b', label: 'B', type: signalTypeField('float', 'default') },
  ],
  outputs: [
    { id: 'result', label: 'Result', type: signalTypeField('float', 'default') },
  ],
  params: {},
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
  inputs: [
    { id: 'angle', label: 'Angle', type: signalTypeField('float', 'default') },
    { id: 'radius', label: 'Radius', type: signalTypeField('float', 'default') },
    { id: 'centerX', label: 'Center X', type: signalType('float'), optional: true, defaultValue: 0.5 },
    { id: 'centerY', label: 'Center Y', type: signalType('float'), optional: true, defaultValue: 0.5 },
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

    // Get center signals (or create default constants)
    const centerXSig = centerX?.k === 'sig' ? centerX.id : ctx.b.sigConst(0.5, signalType('float'));
    const centerYSig = centerY?.k === 'sig' ? centerY.id : ctx.b.sigConst(0.5, signalType('float'));

    // Broadcast center signals to fields
    const centerXField = ctx.b.fieldBroadcast(centerXSig, signalTypeField('float', 'default'));
    const centerYField = ctx.b.fieldBroadcast(centerYSig, signalTypeField('float', 'default'));

    // Zip all four fields together: angle, radius, centerX, centerY -> vec2
    const polarFn = ctx.b.kernel('fieldPolarToCartesian');
    const posField = ctx.b.fieldZip(
      [angle.id, radius.id, centerXField, centerYField],
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
// FieldCartesianToPolar
// =============================================================================

registerBlock({
  type: 'FieldCartesianToPolar',
  label: 'Field Cartesian to Polar',
  category: 'field',
  description: 'Convert Cartesian coordinates (x, y) to polar (angle, radius)',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'pos', label: 'Position', type: signalTypeField('vec2', 'default') },
    { id: 'centerX', label: 'Center X', type: signalType('float'), optional: true, defaultValue: 0.5 },
    { id: 'centerY', label: 'Center Y', type: signalType('float'), optional: true, defaultValue: 0.5 },
  ],
  outputs: [
    { id: 'angle', label: 'Angle', type: signalTypeField('float', 'default') },
    { id: 'radius', label: 'Radius', type: signalTypeField('float', 'default') },
  ],
  params: {},
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
    };
  },
});
