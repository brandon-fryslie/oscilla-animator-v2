/**
 * Color Blocks
 *
 * Blocks that work with color values and HSV color space.
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField, unitPhase01 } from '../core/canonical-types';
import { defaultSourceConst } from '../types';
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
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    phase: { label: 'Phase', type: signalType('float', unitPhase01()) },
    hue: { label: 'Hue Offset', type: signalType('float') },
    sat: { label: 'Saturation', type: signalType('float') },
    val: { label: 'Value', type: signalType('float') },
  },
  outputs: {
    color: { label: 'Color', type: signalType('color') },
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
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    hue: { label: 'Hue', type: signalType('float') },
    sat: { label: 'Saturation', type: signalType('float') },
    val: { label: 'Value', type: signalType('float') },
  },
  outputs: {
    color: { label: 'Color', type: signalType('color') },
  },
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
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    hue: { label: 'Hue', type: signalTypeField('float', 'default') },
    sat: { label: 'Saturation', type: signalType('float'), defaultSource: defaultSourceConst(1.0) },
    val: { label: 'Value', type: signalType('float'), defaultSource: defaultSourceConst(1.0) },
  },
  outputs: {
    color: { label: 'Color', type: signalTypeField('color', 'default') },
  },
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

// =============================================================================
// ApplyOpacity
// =============================================================================

registerBlock({
  type: 'ApplyOpacity',
  label: 'Apply Opacity',
  category: 'color',
  description: 'Applies per-element opacity to a color field (modulates alpha channel)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    color: { label: 'Color', type: signalTypeField('color', 'default') },
    opacity: { label: 'Opacity', type: signalTypeField('float', 'default') },
  },
  outputs: {
    out: { label: 'Color', type: signalTypeField('color', 'default') },
  },
  lower: ({ ctx, inputsById }) => {
    const color = inputsById.color;
    const opacity = inputsById.opacity;

    if (!color || color.k !== 'field') {
      throw new Error('ApplyOpacity color must be a field');
    }
    if (!opacity || opacity.k !== 'field') {
      throw new Error('ApplyOpacity opacity must be a field');
    }

    const opacityFn = ctx.b.kernel('perElementOpacity');
    const result = ctx.b.fieldZip(
      [color.id as FieldExprId, opacity.id as FieldExprId],
      opacityFn,
      signalTypeField('color', 'default')
    );
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'field', id: result, slot },
      },
      instanceContext: ctx.inferredInstance,
    };
  },
});

// NOTE: ConstColor was removed - use the unified polymorphic Const block instead
