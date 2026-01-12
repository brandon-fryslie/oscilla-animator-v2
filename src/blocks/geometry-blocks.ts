/**
 * Geometry Blocks
 *
 * Blocks that work with 2D positions, transformations, and geometric operations.
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField } from '../core/canonical-types';
import type { SigExprId } from '../compiler/ir/Indices';
import { domainId } from '../compiler/ir/Indices';

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
  inputs: [
    { id: 'angle', label: 'Angle', type: signalType('float') },
    { id: 'radius', label: 'Radius', type: signalType('float') },
    { id: 'centerX', label: 'Center X', type: signalType('float') },
    { id: 'centerY', label: 'Center Y', type: signalType('float') },
  ],
  outputs: [
    { id: 'pos', label: 'Position', type: signalType('vec2') },
  ],
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
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        pos: { k: 'sig', id: sigId, slot },
      },
    };
  },
});

// =============================================================================
// Circle (Position from domain)
// =============================================================================

registerBlock({
  type: 'Circle',
  label: 'Circle Layout',
  category: 'geometry',
  description: 'Arranges domain elements in a circle',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'radius', label: 'Radius', type: signalType('float') },
    { id: 'phase', label: 'Phase Offset', type: signalType('float') },
  ],
  outputs: [
    { id: 'pos', label: 'Position', type: signalTypeField('vec2', 'default') },
    { id: 'angle', label: 'Angle', type: signalTypeField('float', 'default') },
  ],
  params: {
    radius: 100,
    phaseOffset: 0,
  },
  lower: ({ ctx, inputsById, config }) => {
    const radius = inputsById.radius;
    const phase = inputsById.phase;

    const radiusValue = config?.radius as number ?? 100;
    const phaseOffset = config?.phaseOffset as number ?? 0;

    // Get the domain from context (this should be passed by the compiler)
    // For now, we'll use 'default' domain ID
    const domain = domainId('default');

    // Create field expressions for circle layout
    // Use fieldSource to get the normalized index for each domain element
    const indexField = ctx.b.fieldSource(domain, 'normalizedIndex', signalTypeField('float', 'default'));

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

    return {
      outputsById: {
        pos: { k: 'field', id: posField, slot: posSlot },
        angle: { k: 'field', id: angleField, slot: angleSlot },
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
  inputs: [
    { id: 'pos', label: 'Position', type: signalType('vec2') },
    { id: 'amountX', label: 'Offset X', type: signalType('float') },
    { id: 'amountY', label: 'Offset Y', type: signalType('float') },
    { id: 'rand', label: 'Random', type: signalType('float') },
  ],
  outputs: [
    { id: 'pos', label: 'Position', type: signalType('vec2') },
  ],
  lower: ({ ctx, inputsById }) => {
    const pos = inputsById.pos;
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
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        pos: { k: 'sig', id: sigId, slot },
      },
    };
  },
});
