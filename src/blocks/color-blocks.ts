/**
 * Color Blocks
 *
 * Blocks that work with color values and HSV color space.
 */

import { registerBlock } from './registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../core/ids';
import { canonicalType, canonicalField, unitPhase01, strideOf, floatConst } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
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
    phase: { label: 'Phase', type: canonicalType(FLOAT, unitPhase01()) },
    hue: { label: 'Hue Offset', type: canonicalType(FLOAT) },
    sat: { label: 'Saturation', type: canonicalType(FLOAT) },
    val: { label: 'Value', type: canonicalType(FLOAT) },
  },
  outputs: {
    color: { label: 'Color', type: canonicalType(COLOR) },
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
      hue?.k === 'sig' ? (hue.id as SigExprId) : ctx.b.sigConst(floatConst(0), canonicalType(FLOAT)),
      sat?.k === 'sig' ? (sat.id as SigExprId) : ctx.b.sigConst(floatConst(1), canonicalType(FLOAT)),
      val?.k === 'sig' ? (val.id as SigExprId) : ctx.b.sigConst(floatConst(1), canonicalType(FLOAT)),
    ];

    const sigId = ctx.b.sigZip(inputs, colorFn, canonicalType(COLOR));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        color: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
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
    hue: { label: 'Hue', type: canonicalType(FLOAT) },
    sat: { label: 'Saturation', type: canonicalType(FLOAT) },
    val: { label: 'Value', type: canonicalType(FLOAT) },
  },
  outputs: {
    color: { label: 'Color', type: canonicalType(COLOR) },
  },
  lower: ({ ctx, inputsById }) => {
    const hue = inputsById.hue;
    const sat = inputsById.sat;
    const val = inputsById.val;

    if (!hue || hue.k !== 'sig' || !sat || sat.k !== 'sig' || !val || val.k !== 'sig') {
      throw new Error('HSVToColor inputs must be signals');
    }

    const hsvFn = ctx.b.kernel('hsvToRgb');
    const sigId = ctx.b.sigZip([hue.id as SigExprId, sat.id as SigExprId, val.id as SigExprId], hsvFn, canonicalType(COLOR));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        color: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
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
    hue: { label: 'Hue', type: canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    sat: { label: 'Saturation', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(1.0), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    val: { label: 'Value', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(1.0), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    color: { label: 'Color', type: canonicalField(COLOR, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
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
      canonicalField(COLOR, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
    );
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        color: { k: 'field', id: colorField, slot, type: outType, stride: strideOf(outType.payload) },
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
    color: { label: 'Color', type: canonicalField(COLOR, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    opacity: { label: 'Opacity', type: canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  outputs: {
    out: { label: 'Color', type: canonicalField(COLOR, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
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
      canonicalField(COLOR, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
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

// NOTE: ConstColor was removed - use the unified polymorphic Const block instead
