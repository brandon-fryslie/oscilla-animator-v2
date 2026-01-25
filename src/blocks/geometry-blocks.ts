/**
 * Geometry Blocks
 *
 * Blocks that work with 2D positions, transformations, and geometric operations.
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField, unitPhase01, strideOf } from '../core/canonical-types';
import type { SigExprId } from '../compiler/ir/Indices';

// =============================================================================
// PolarToCartesian
// =============================================================================

registerBlock({
  type: 'PolarToCartesian',
  label: 'Polar to Cartesian',
  category: 'geometry',
  description: 'Converts polar coordinates (angle, radius) to cartesian (x, y)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    angle: { label: 'Angle', type: signalType('float') },
    radius: { label: 'Radius', type: signalType('float') },
    centerX: { label: 'Center X', type: signalType('float') },
    centerY: { label: 'Center Y', type: signalType('float') },
  },
  outputs: {
    pos: { label: 'Position', type: signalType('vec2') },
  },
  lower: ({ ctx, inputsById }) => {
    const angle = inputsById.angle;
    const radius = inputsById.radius;
    const centerX = inputsById.centerX;
    const centerY = inputsById.centerY;

    if (!angle || angle.k !== 'sig' || !radius || radius.k !== 'sig') {
      throw new Error('PolarToCartesian angle and radius must be signals');
    }

    // Build input array: [angle, radius, centerX, centerY]
    const inputs: SigExprId[] = [
      angle.id as SigExprId,
      radius.id as SigExprId,
      centerX?.k === 'sig' ? (centerX.id as SigExprId) : ctx.b.sigConst(0, signalType('float')),
      centerY?.k === 'sig' ? (centerY.id as SigExprId) : ctx.b.sigConst(0, signalType('float')),
    ];

    const polarFn = ctx.b.kernel('polarToCartesian');
    const sigId = ctx.b.sigZip(inputs, polarFn, signalType('vec2'));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        pos: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// Circle (Position from domain)
// =============================================================================

registerBlock({
  type: 'CircularLayout',
  label: 'Circular Layout',
  category: 'layout',
  description: 'Arranges domain elements in a circle',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    radius: { label: 'Radius', type: signalType('float'), value: 100 },
    phase: { label: 'Phase Offset', type: signalType('float', unitPhase01()), value: 0 },
  },
  outputs: {
    pos: { label: 'Position', type: signalTypeField('vec2', 'default') },
    angle: { label: 'Angle', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const radius = inputsById.radius;
    const phase = inputsById.phase;

    const radiusValue = config?.radius as number ?? 100;
    const phaseOffset = config?.phase as number ?? 0;

    // Get instance context from Array block or inferred from inputs
    const instance = ctx.inferredInstance ?? ctx.instance;
    if (!instance) {
      throw new Error('Circle requires instance context');
    }

    // Create field expressions for circle layout
    // Use fieldIntrinsic to get the normalized index for each instance element
    const indexField = ctx.b.fieldIntrinsic(instance, 'normalizedIndex', signalTypeField('float', 'default'));

    // Apply circle layout transformation
    const radiusSig = radius?.k === 'sig' ? radius.id as SigExprId : ctx.b.sigConst(radiusValue, signalType('float'));
    const phaseSig = phase?.k === 'sig' ? phase.id as SigExprId : ctx.b.sigConst(phaseOffset, signalType('float'));

    // Map the circle layout function over the index field
    const circleFn = ctx.b.kernel('circleLayout');
    const posField = ctx.b.fieldZipSig(indexField, [radiusSig, phaseSig], circleFn, signalTypeField('vec2', 'default'));

    // Calculate angles
    const angleFn = ctx.b.kernel('circleAngle');
    const angleField = ctx.b.fieldZipSig(indexField, [phaseSig], angleFn, signalTypeField('float', 'default'));

    const posSlot = ctx.b.allocSlot();
    const angleSlot = ctx.b.allocSlot();
    const posType = ctx.outTypes[0];
    const angleType = ctx.outTypes[1];

    return {
      outputsById: {
        pos: { k: 'field', id: posField, slot: posSlot, type: posType, stride: strideOf(posType.payload) },
        angle: { k: 'field', id: angleField, slot: angleSlot, type: angleType, stride: strideOf(angleType.payload) },
      },
    };
  },
});

// =============================================================================
// OffsetPosition
// =============================================================================

registerBlock({
  type: 'OffsetPosition',
  label: 'Offset Position',
  category: 'geometry',
  description: 'Offsets a position by x and y amounts with optional randomization',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    posIn: { label: 'Position In', type: signalType('vec2') },
    amountX: { label: 'Offset X', type: signalType('float') },
    amountY: { label: 'Offset Y', type: signalType('float') },
    rand: { label: 'Random', type: signalType('float') },
  },
  outputs: {
    posOut: { label: 'Position Out', type: signalType('vec2') },
  },
  lower: ({ ctx, inputsById }) => {
    const pos = inputsById.posIn;
    const amountX = inputsById.amountX;
    const amountY = inputsById.amountY;
    const rand = inputsById.rand;

    if (!pos || pos.k !== 'sig') {
      throw new Error('OffsetPosition pos input must be a signal');
    }

    const inputs: SigExprId[] = [
      pos.id as SigExprId,
      amountX?.k === 'sig' ? (amountX.id as SigExprId) : ctx.b.sigConst(0, signalType('float')),
      amountY?.k === 'sig' ? (amountY.id as SigExprId) : ctx.b.sigConst(0, signalType('float')),
      rand?.k === 'sig' ? (rand.id as SigExprId) : ctx.b.sigConst(0, signalType('float')),
    ];

    const offsetFn = ctx.b.kernel('offsetPosition');
    const sigId = ctx.b.sigZip(inputs, offsetFn, signalType('vec2'));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        posOut: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
