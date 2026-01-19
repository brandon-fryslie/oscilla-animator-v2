/**
 * Color Blocks
 *
 * Blocks that work with color values and HSV color space.
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField } from '../core/canonical-types';
import { defaultSourceConstant } from '../types';
import type { SigExprId, FieldExprId } from '../compiler/ir/Indices';

// =============================================================================
// ColorLFO
// =============================================================================

registerBlock({
  type: 'ColorLFO',
  label: 'Color LFO',
  category: 'color',
  description: 'Generates animated color from phase via hue rotation',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'phase', label: 'Phase', type: signalType('float') },
    { id: 'hue', label: 'Hue Offset', type: signalType('float') },
    { id: 'sat', label: 'Saturation', type: signalType('float') },
    { id: 'val', label: 'Value', type: signalType('float') },
  ],
  outputs: [
    { id: 'color', label: 'Color', type: signalType('color') },
  ],
  params: {
    hueOffset: 0,
    saturation: 1.0,
    value: 1.0,
  },
  lower: ({ ctx, inputsById }) => {
    const phase = inputsById.phase;
    const hue = inputsById.hue;
    const sat = inputsById.sat;
    const val = inputsById.val;

    if (!phase || phase.k !== 'sig') {
      throw new Error('ColorLFO phase input must be a signal');
    }

    // For now, create a kernel that converts phase to color
    // This will need to be implemented in the runtime kernel library
    const colorFn = ctx.b.kernel('hsvToRgb');

    // Build HSV triple from inputs
    const inputs: SigExprId[] = [
      phase.id as SigExprId,
      hue?.k === 'sig' ? (hue.id as SigExprId) : ctx.b.sigConst(0, signalType('float')),
      sat?.k === 'sig' ? (sat.id as SigExprId) : ctx.b.sigConst(1, signalType('float')),
      val?.k === 'sig' ? (val.id as SigExprId) : ctx.b.sigConst(1, signalType('float')),
    ];

    const sigId = ctx.b.sigZip(inputs, colorFn, signalType('color'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        color: { k: 'sig', id: sigId, slot },
      },
    };
  },
});

// =============================================================================
// HSVToColor
// =============================================================================

registerBlock({
  type: 'HSVToColor',
  label: 'HSV to Color',
  category: 'color',
  description: 'Converts HSV values to RGB color',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'hue', label: 'Hue', type: signalType('float') },
    { id: 'sat', label: 'Saturation', type: signalType('float') },
    { id: 'val', label: 'Value', type: signalType('float') },
  ],
  outputs: [
    { id: 'color', label: 'Color', type: signalType('color') },
  ],
  lower: ({ ctx, inputsById }) => {
    const hue = inputsById.hue;
    const sat = inputsById.sat;
    const val = inputsById.val;

    if (!hue || hue.k !== 'sig' || !sat || sat.k !== 'sig' || !val || val.k !== 'sig') {
      throw new Error('HSVToColor inputs must be signals');
    }

    const hsvFn = ctx.b.kernel('hsvToRgb');
    const sigId = ctx.b.sigZip([hue.id as SigExprId, sat.id as SigExprId, val.id as SigExprId], hsvFn, signalType('color'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        color: { k: 'sig', id: sigId, slot },
      },
    };
  },
});

// =============================================================================
// HsvToRgb (Field-aware variant)
// =============================================================================

registerBlock({
  type: 'HsvToRgb',
  label: 'HSV to RGB',
  category: 'color',
  description: 'Converts HSV values (field or signal) to RGB color field',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'hue', label: 'Hue', type: signalTypeField('float', 'default') },
    { id: 'sat', label: 'Saturation', type: signalType('float'), defaultSource: defaultSourceConstant(1.0) },
    { id: 'val', label: 'Value', type: signalType('float'), defaultSource: defaultSourceConstant(1.0) },
  ],
  outputs: [
    { id: 'color', label: 'Color', type: signalTypeField('color', 'default') },
  ],
  lower: ({ ctx, inputsById }) => {
    const hue = inputsById.hue;
    const sat = inputsById.sat;
    const val = inputsById.val;

    if (!hue || hue.k !== 'field') {
      throw new Error('HsvToRgb hue must be a field');
    }
    if (!sat || sat.k !== 'sig' || !val || val.k !== 'sig') {
      throw new Error('HsvToRgb sat and val must be signals');
    }

    const hsvFn = ctx.b.kernel('hsvToRgb');
    const colorField = ctx.b.fieldZipSig(
      hue.id as FieldExprId,
      [sat.id as SigExprId, val.id as SigExprId],
      hsvFn,
      signalTypeField('color', 'default')
    );
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        color: { k: 'field', id: colorField, slot },
      },
      // Propagate instance context from inputs
      instanceContext: ctx.inferredInstance,
    };
  },
});

// NOTE: ConstColor was removed - use the unified polymorphic Const block instead
