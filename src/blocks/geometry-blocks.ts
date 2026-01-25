/**
 * Geometry Blocks
 *
 * Blocks that work with positions, transformations, and geometric operations.
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField, strideOf, unitWorld3 } from '../core/canonical-types';
import { defaultSourceConst } from '../types';
import type { SigExprId, FieldExprId } from '../compiler/ir/Indices';
import { OpCode } from '../compiler/ir/types';

// =============================================================================
// PolarToCartesian
// =============================================================================

registerBlock({
  type: 'PolarToCartesian',
  label: 'Polar to Cartesian',
  category: 'geometry',
  description: 'Converts polar coordinates (angle, radius) to cartesian (x, y, z=0)',
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
    centerX: {
      label: 'Center X',
      type: signalType('float'),
      defaultSource: defaultSourceConst(0.5),
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    },
    centerY: {
      label: 'Center Y',
      type: signalType('float'),
      defaultSource: defaultSourceConst(0.5),
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    },
  },
  outputs: {
    pos: { label: 'Position', type: signalType('vec3', unitWorld3()) },
  },
  lower: ({ ctx, inputsById }) => {
    const angle = inputsById.angle;
    const radius = inputsById.radius;
    const centerX = inputsById.centerX;
    const centerY = inputsById.centerY;

    if (!angle || !radius) {
      throw new Error('PolarToCartesian angle and radius required');
    }

    // Get center signals (or create default constants)
    const centerXSig = centerX?.k === 'sig' ? centerX.id : ctx.b.sigConst(0.5, signalType('float'));
    const centerYSig = centerY?.k === 'sig' ? centerY.id : ctx.b.sigConst(0.5, signalType('float'));

    if (angle.k === 'sig' && radius.k === 'sig') {
      // Signal path - compute x = cx + r*cos(a), y = cy + r*sin(a), z = 0
      const cosFn = ctx.b.opcode(OpCode.Cos);
      const sinFn = ctx.b.opcode(OpCode.Sin);
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const addFn = ctx.b.opcode(OpCode.Add);

      const cosAngle = ctx.b.sigMap(angle.id, cosFn, signalType('float'));
      const sinAngle = ctx.b.sigMap(angle.id, sinFn, signalType('float'));
      const xOffset = ctx.b.sigZip([radius.id, cosAngle], mulFn, signalType('float'));
      const yOffset = ctx.b.sigZip([radius.id, sinAngle], mulFn, signalType('float'));
      const x = ctx.b.sigZip([centerXSig, xOffset], addFn, signalType('float'));
      const y = ctx.b.sigZip([centerYSig, yOffset], addFn, signalType('float'));
      const z = ctx.b.sigConst(0, signalType('float'));

      // Package as vec3 using the vec3FromComponents kernel
      const vec3Fn = ctx.b.kernel('vec3FromComponents');
      const result = ctx.b.sigZip([x, y, z], vec3Fn, signalType('vec3', unitWorld3()));

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          pos: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (angle.k === 'field' && radius.k === 'field') {
      // Field path - use broadcast for center signals
      const centerXField = ctx.b.Broadcast(centerXSig, signalTypeField('float', 'default'));
      const centerYField = ctx.b.Broadcast(centerYSig, signalTypeField('float', 'default'));

      const polarFn = ctx.b.kernel('fieldPolarToCartesian');
      const result = ctx.b.fieldZip(
        [centerXField, centerYField, radius.id as FieldExprId, angle.id as FieldExprId],
        polarFn,
        signalTypeField('vec3', 'default')
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          pos: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      // Mixed path - broadcast signals to fields
      const angleField = angle.k === 'field' ? angle.id : ctx.b.Broadcast((angle as { k: 'sig'; id: SigExprId }).id, signalTypeField('float', 'default'));
      const radiusField = radius.k === 'field' ? radius.id : ctx.b.Broadcast((radius as { k: 'sig'; id: SigExprId }).id, signalTypeField('float', 'default'));
      const centerXField = ctx.b.Broadcast(centerXSig, signalTypeField('float', 'default'));
      const centerYField = ctx.b.Broadcast(centerYSig, signalTypeField('float', 'default'));

      const polarFn = ctx.b.kernel('fieldPolarToCartesian');
      const result = ctx.b.fieldZip(
        [centerXField, centerYField, radiusField, angleField],
        polarFn,
        signalTypeField('vec3', 'default')
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          pos: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    }
  },
});

// =============================================================================
// OffsetVec
// =============================================================================

registerBlock({
  type: 'OffsetVec',
  label: 'Offset Vec',
  category: 'geometry',
  description: 'Offsets a vec3 position by x, y, z amounts with optional randomization',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    posIn: { label: 'Position In', type: signalType('vec3', unitWorld3()) },
    amountX: {
      label: 'Amount X',
      type: signalType('float'),
      defaultSource: defaultSourceConst(0.0),
      uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.01 },
    },
    amountY: {
      label: 'Amount Y',
      type: signalType('float'),
      defaultSource: defaultSourceConst(0.0),
      uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.01 },
    },
    amountZ: {
      label: 'Amount Z',
      type: signalType('float'),
      defaultSource: defaultSourceConst(0.0),
      uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.01 },
    },
    rand: {
      label: 'Random',
      type: signalType('float'),
      defaultSource: defaultSourceConst(0.0),
    },
  },
  outputs: {
    posOut: { label: 'Position Out', type: signalType('vec3', unitWorld3()) },
  },
  lower: ({ ctx, inputsById }) => {
    const pos = inputsById.posIn;
    const amountX = inputsById.amountX;
    const amountY = inputsById.amountY;
    const amountZ = inputsById.amountZ;
    const rand = inputsById.rand;

    if (!pos || !rand) {
      throw new Error('OffsetVec pos and rand required');
    }

    // Get amount signals
    const amountXSig = amountX?.k === 'sig' ? amountX.id : ctx.b.sigConst(0.0, signalType('float'));
    const amountYSig = amountY?.k === 'sig' ? amountY.id : ctx.b.sigConst(0.0, signalType('float'));
    const amountZSig = amountZ?.k === 'sig' ? amountZ.id : ctx.b.sigConst(0.0, signalType('float'));

    if (pos.k === 'sig' && rand.k === 'sig') {
      // Signal path - use kernel to build jittered vec3
      const jitterFn = ctx.b.kernel('jitterVecSig');
      const result = ctx.b.sigZip([pos.id, rand.id, amountXSig, amountYSig, amountZSig], jitterFn, signalType('vec3', unitWorld3()));

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          posOut: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (pos.k === 'field' && rand.k === 'field') {
      // Field path - broadcast amount signals to fields
      const amountXField = ctx.b.Broadcast(amountXSig, signalTypeField('float', 'default'));
      const amountYField = ctx.b.Broadcast(amountYSig, signalTypeField('float', 'default'));
      const amountZField = ctx.b.Broadcast(amountZSig, signalTypeField('float', 'default'));

      const jitterFn = ctx.b.kernel('fieldJitterVec');
      const result = ctx.b.fieldZip(
        [pos.id as FieldExprId, rand.id as FieldExprId, amountXField, amountYField, amountZField],
        jitterFn,
        signalTypeField('vec3', 'default')
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          posOut: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      // Mixed path - broadcast signals to fields
      const posField = pos.k === 'field' ? pos.id : ctx.b.Broadcast((pos as { k: 'sig'; id: SigExprId }).id, signalTypeField('vec3', 'default'));
      const randField = rand.k === 'field' ? rand.id : ctx.b.Broadcast((rand as { k: 'sig'; id: SigExprId }).id, signalTypeField('float', 'default'));
      const amountXField = ctx.b.Broadcast(amountXSig, signalTypeField('float', 'default'));
      const amountYField = ctx.b.Broadcast(amountYSig, signalTypeField('float', 'default'));
      const amountZField = ctx.b.Broadcast(amountZSig, signalTypeField('float', 'default'));

      const jitterFn = ctx.b.kernel('fieldJitterVec');
      const result = ctx.b.fieldZip(
        [posField, randField, amountXField, amountYField, amountZField],
        jitterFn,
        signalTypeField('vec3', 'default')
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          posOut: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    }
  },
});
