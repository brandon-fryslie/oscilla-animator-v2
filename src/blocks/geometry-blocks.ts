/**
 * Geometry Blocks
 *
 * Blocks that work with positions, transformations, and geometric operations.
 */

import { registerBlock } from './registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../core/ids';
import { canonicalType, canonicalField, strideOf, unitWorld3, floatConst } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
import { defaultSourceConst } from '../types';
import type { SigExprId, FieldExprId } from '../compiler/ir/Indices';
import { slotOffset } from '../compiler/ir/Indices';
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
    angle: { label: 'Angle', type: canonicalType(FLOAT) },
    radius: { label: 'Radius', type: canonicalType(FLOAT) },
    centerX: {
      label: 'Center X',
      type: canonicalType(FLOAT),
      defaultSource: defaultSourceConst(0.5),
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    },
    centerY: {
      label: 'Center Y',
      type: canonicalType(FLOAT),
      defaultSource: defaultSourceConst(0.5),
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    },
  },
  outputs: {
    pos: { label: 'Position', type: canonicalType(VEC3, unitWorld3()) },
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
    const centerXSig = centerX?.k === 'sig' ? centerX.id : ctx.b.sigConst(floatConst(0.5), canonicalType(FLOAT));
    const centerYSig = centerY?.k === 'sig' ? centerY.id : ctx.b.sigConst(floatConst(0.5), canonicalType(FLOAT));

    if (angle.k === 'sig' && radius.k === 'sig') {
      // Signal path - compute x = cx + r*cos(a), y = cy + r*sin(a), z = 0
      const cosFn = ctx.b.opcode(OpCode.Cos);
      const sinFn = ctx.b.opcode(OpCode.Sin);
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const addFn = ctx.b.opcode(OpCode.Add);

      const cosAngle = ctx.b.sigMap(angle.id, cosFn, canonicalType(FLOAT));
      const sinAngle = ctx.b.sigMap(angle.id, sinFn, canonicalType(FLOAT));
      const xOffset = ctx.b.sigZip([radius.id, cosAngle], mulFn, canonicalType(FLOAT));
      const yOffset = ctx.b.sigZip([radius.id, sinAngle], mulFn, canonicalType(FLOAT));
      const x = ctx.b.sigZip([centerXSig, xOffset], addFn, canonicalType(FLOAT));
      const y = ctx.b.sigZip([centerYSig, yOffset], addFn, canonicalType(FLOAT));
      const z = ctx.b.sigConst(floatConst(0), canonicalType(FLOAT));

      // Multi-component signal: allocate strided slot, emit write step
      const outType = ctx.outTypes[0];
      const stride = strideOf(outType.payload);
      const slot = ctx.b.allocSlot(stride);
      const components = [x, y, z];

      ctx.b.stepSlotWriteStrided(slot, components);

      return {
        outputsById: {
          pos: { k: 'sig', id: x, slot, type: outType, stride, components },
        },
      };
    } else if (angle.k === 'field' && radius.k === 'field') {
      // Field path - use broadcast for center signals
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };
      const centerXField = ctx.b.Broadcast(centerXSig, floatFieldType);
      const centerYField = ctx.b.Broadcast(centerYSig, floatFieldType);

      const polarFn = ctx.b.kernel('fieldPolarToCartesian');
      const result = ctx.b.fieldZip(
        [centerXField, centerYField, radius.id as FieldExprId, angle.id as FieldExprId],
        polarFn,
        outType
      );

      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          pos: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      // Mixed path - broadcast signals to fields
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };
      const angleField = angle.k === 'field' ? angle.id : ctx.b.Broadcast((angle as { k: 'sig'; id: SigExprId }).id, floatFieldType);
      const radiusField = radius.k === 'field' ? radius.id : ctx.b.Broadcast((radius as { k: 'sig'; id: SigExprId }).id, floatFieldType);
      const centerXField = ctx.b.Broadcast(centerXSig, floatFieldType);
      const centerYField = ctx.b.Broadcast(centerYSig, floatFieldType);

      const polarFn = ctx.b.kernel('fieldPolarToCartesian');
      const result = ctx.b.fieldZip(
        [centerXField, centerYField, radiusField, angleField],
        polarFn,
        outType
      );

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
    posIn: { label: 'Position In', type: canonicalType(VEC3, unitWorld3()) },
    amountX: {
      label: 'Amount X',
      type: canonicalType(FLOAT),
      defaultSource: defaultSourceConst(0.0),
      uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.01 },
    },
    amountY: {
      label: 'Amount Y',
      type: canonicalType(FLOAT),
      defaultSource: defaultSourceConst(0.0),
      uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.01 },
    },
    amountZ: {
      label: 'Amount Z',
      type: canonicalType(FLOAT),
      defaultSource: defaultSourceConst(0.0),
      uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.01 },
    },
    rand: {
      label: 'Random',
      type: canonicalType(FLOAT),
      defaultSource: defaultSourceConst(0.0),
    },
  },
  outputs: {
    posOut: { label: 'Position Out', type: canonicalType(VEC3, unitWorld3()) },
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
    const amountXSig = amountX?.k === 'sig' ? amountX.id : ctx.b.sigConst(floatConst(0.0), canonicalType(FLOAT));
    const amountYSig = amountY?.k === 'sig' ? amountY.id : ctx.b.sigConst(floatConst(0.0), canonicalType(FLOAT));
    const amountZSig = amountZ?.k === 'sig' ? amountZ.id : ctx.b.sigConst(floatConst(0.0), canonicalType(FLOAT));

    if (pos.k === 'sig' && rand.k === 'sig') {
      // Signal path - decompose input vec3, compute jittered components, recompose
      // Read input vec3 components from slot
      const posSlot = pos.slot;
      const xIn = ctx.b.sigSlot(slotOffset(posSlot, 0), canonicalType(FLOAT));
      const yIn = ctx.b.sigSlot(slotOffset(posSlot, 1), canonicalType(FLOAT));
      const zIn = ctx.b.sigSlot(slotOffset(posSlot, 2), canonicalType(FLOAT));

      // Compute jitter for each component based on rand
      // Simple jitter: pos + amount * (rand - 0.5) * 2
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const addFn = ctx.b.opcode(OpCode.Add);
      const subFn = ctx.b.opcode(OpCode.Sub);

      const half = ctx.b.sigConst(floatConst(0.5), canonicalType(FLOAT));
      const two = ctx.b.sigConst(floatConst(2), canonicalType(FLOAT));

      const centered = ctx.b.sigZip([rand.id, half], subFn, canonicalType(FLOAT));
      const scaled = ctx.b.sigZip([centered, two], mulFn, canonicalType(FLOAT));

      const jitterX = ctx.b.sigZip([amountXSig, scaled], mulFn, canonicalType(FLOAT));
      const jitterY = ctx.b.sigZip([amountYSig, scaled], mulFn, canonicalType(FLOAT));
      const jitterZ = ctx.b.sigZip([amountZSig, scaled], mulFn, canonicalType(FLOAT));

      const xOut = ctx.b.sigZip([xIn, jitterX], addFn, canonicalType(FLOAT));
      const yOut = ctx.b.sigZip([yIn, jitterY], addFn, canonicalType(FLOAT));
      const zOut = ctx.b.sigZip([zIn, jitterZ], addFn, canonicalType(FLOAT));

      // Multi-component signal: allocate strided slot, emit write step
      const outType = ctx.outTypes[0];
      const stride = strideOf(outType.payload);
      const slot = ctx.b.allocSlot(stride);
      const components = [xOut, yOut, zOut];

      ctx.b.stepSlotWriteStrided(slot, components);

      return {
        outputsById: {
          posOut: { k: 'sig', id: xOut, slot, type: outType, stride, components },
        },
      };
    } else if (pos.k === 'field' && rand.k === 'field') {
      // Field path - broadcast amount signals to fields
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };
      const amountXField = ctx.b.Broadcast(amountXSig, floatFieldType);
      const amountYField = ctx.b.Broadcast(amountYSig, floatFieldType);
      const amountZField = ctx.b.Broadcast(amountZSig, floatFieldType);

      const jitterFn = ctx.b.kernel('fieldJitterVec');
      const result = ctx.b.fieldZip(
        [pos.id as FieldExprId, rand.id as FieldExprId, amountXField, amountYField, amountZField],
        jitterFn,
        outType
      );

      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          posOut: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      // Mixed path - broadcast signals to fields
      const outType = ctx.outTypes[0];
      const vec3FieldType = outType;
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };
      const posField = pos.k === 'field' ? pos.id : ctx.b.Broadcast((pos as { k: 'sig'; id: SigExprId }).id, vec3FieldType);
      const randField = rand.k === 'field' ? rand.id : ctx.b.Broadcast((rand as { k: 'sig'; id: SigExprId }).id, floatFieldType);
      const amountXField = ctx.b.Broadcast(amountXSig, floatFieldType);
      const amountYField = ctx.b.Broadcast(amountYSig, floatFieldType);
      const amountZField = ctx.b.Broadcast(amountZSig, floatFieldType);

      const jitterFn = ctx.b.kernel('fieldJitterVec');
      const result = ctx.b.fieldZip(
        [posField, randField, amountXField, amountYField, amountZField],
        jitterFn,
        outType
      );

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
