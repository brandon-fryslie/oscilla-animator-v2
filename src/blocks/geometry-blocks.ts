/**
 * Geometry Blocks
 *
 * Blocks that work with positions, transformations, and geometric operations.
 */

import { registerBlock } from './registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../core/ids';
import { canonicalType, canonicalField, strideOf, unitWorld3, floatConst, requireInst } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
import { defaultSourceConst } from '../types';
import type { ValueExprId } from '../compiler/ir/Indices';
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
    const isCenterXSignal = centerX && 'type' in centerX && requireInst(centerX.type.extent.temporality, 'temporality').kind === 'continuous';
    const isCenterYSignal = centerY && 'type' in centerY && requireInst(centerY.type.extent.temporality, 'temporality').kind === 'continuous';
    const centerXSig = (centerX && isCenterXSignal) ? centerX.id : ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));
    const centerYSig = (centerY && isCenterYSignal) ? centerY.id : ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));

    const isAngleSignal = 'type' in angle && requireInst(angle.type.extent.cardinality, 'cardinality').kind !== 'many';
    const isRadiusSignal = 'type' in radius && requireInst(radius.type.extent.cardinality, 'cardinality').kind !== 'many';

    if (isAngleSignal && isRadiusSignal) {
      // Signal path - compute x = cx + r*cos(a), y = cy + r*sin(a), z = 0
      const cosFn = ctx.b.opcode(OpCode.Cos);
      const sinFn = ctx.b.opcode(OpCode.Sin);
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const addFn = ctx.b.opcode(OpCode.Add);

      const cosAngle = ctx.b.kernelMap(angle.id, cosFn, canonicalType(FLOAT));
      const sinAngle = ctx.b.kernelMap(angle.id, sinFn, canonicalType(FLOAT));
      const xOffset = ctx.b.kernelZip([radius.id, cosAngle], mulFn, canonicalType(FLOAT));
      const yOffset = ctx.b.kernelZip([radius.id, sinAngle], mulFn, canonicalType(FLOAT));
      const x = ctx.b.kernelZip([centerXSig, xOffset], addFn, canonicalType(FLOAT));
      const y = ctx.b.kernelZip([centerYSig, yOffset], addFn, canonicalType(FLOAT));
      const z = ctx.b.constant(floatConst(0), canonicalType(FLOAT));

      // Multi-component signal: allocate strided slot, emit write step
      const outType = ctx.outTypes[0];
      const stride = strideOf(outType.payload);
      const slot = ctx.b.allocSlot(stride);
      const components = [x, y, z];

      ctx.b.stepSlotWriteStrided(slot, components);

      return {
        outputsById: {
          pos: { id: x, slot, type: outType, stride, components },
        },
      };
    } else if (!isAngleSignal && !isRadiusSignal) {
      // Field path - use broadcast for center signals
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };
      const centerXField = ctx.b.broadcast(centerXSig, floatFieldType);
      const centerYField = ctx.b.broadcast(centerYSig, floatFieldType);

      const polarFn = ctx.b.kernel('fieldPolarToCartesian');
      const result = ctx.b.kernelZip(
        [centerXField, centerYField, radius.id, angle.id],
        polarFn,
        outType
      );

      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          pos: { id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      // Mixed path - broadcast signals to fields
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };
      const angleField = isAngleSignal ? ctx.b.broadcast(angle.id, floatFieldType) : angle.id;
      const radiusField = isRadiusSignal ? ctx.b.broadcast(radius.id, floatFieldType) : radius.id;
      const centerXField = ctx.b.broadcast(centerXSig, floatFieldType);
      const centerYField = ctx.b.broadcast(centerYSig, floatFieldType);

      const polarFn = ctx.b.kernel('fieldPolarToCartesian');
      const result = ctx.b.kernelZip(
        [centerXField, centerYField, radiusField, angleField],
        polarFn,
        outType
      );

      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          pos: { id: result, slot, type: outType, stride: strideOf(outType.payload) },
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
    const isAmountXSignal = amountX && 'type' in amountX && requireInst(amountX.type.extent.temporality, 'temporality').kind === 'continuous';
    const isAmountYSignal = amountY && 'type' in amountY && requireInst(amountY.type.extent.temporality, 'temporality').kind === 'continuous';
    const isAmountZSignal = amountZ && 'type' in amountZ && requireInst(amountZ.type.extent.temporality, 'temporality').kind === 'continuous';
    const amountXSig = (amountX && isAmountXSignal) ? amountX.id : ctx.b.constant(floatConst(0.0), canonicalType(FLOAT));
    const amountYSig = (amountY && isAmountYSignal) ? amountY.id : ctx.b.constant(floatConst(0.0), canonicalType(FLOAT));
    const amountZSig = (amountZ && isAmountZSignal) ? amountZ.id : ctx.b.constant(floatConst(0.0), canonicalType(FLOAT));

    const isPosSignal = 'type' in pos && requireInst(pos.type.extent.cardinality, 'cardinality').kind !== 'many';
    const isRandSignal = 'type' in rand && requireInst(rand.type.extent.cardinality, 'cardinality').kind !== 'many';

    if (isPosSignal && isRandSignal) {
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

      const half = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));
      const two = ctx.b.constant(floatConst(2), canonicalType(FLOAT));

      const centered = ctx.b.kernelZip([rand.id, half], subFn, canonicalType(FLOAT));
      const scaled = ctx.b.kernelZip([centered, two], mulFn, canonicalType(FLOAT));

      const jitterX = ctx.b.kernelZip([amountXSig, scaled], mulFn, canonicalType(FLOAT));
      const jitterY = ctx.b.kernelZip([amountYSig, scaled], mulFn, canonicalType(FLOAT));
      const jitterZ = ctx.b.kernelZip([amountZSig, scaled], mulFn, canonicalType(FLOAT));

      const xOut = ctx.b.kernelZip([xIn, jitterX], addFn, canonicalType(FLOAT));
      const yOut = ctx.b.kernelZip([yIn, jitterY], addFn, canonicalType(FLOAT));
      const zOut = ctx.b.kernelZip([zIn, jitterZ], addFn, canonicalType(FLOAT));

      // Multi-component signal: allocate strided slot, emit write step
      const outType = ctx.outTypes[0];
      const stride = strideOf(outType.payload);
      const slot = ctx.b.allocSlot(stride);
      const components = [xOut, yOut, zOut];

      ctx.b.stepSlotWriteStrided(slot, components);

      return {
        outputsById: {
          posOut: { id: xOut, slot, type: outType, stride, components },
        },
      };
    } else if (!isPosSignal && !isRandSignal) {
      // Field path - broadcast amount signals to fields
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };
      const amountXField = ctx.b.broadcast(amountXSig, floatFieldType);
      const amountYField = ctx.b.broadcast(amountYSig, floatFieldType);
      const amountZField = ctx.b.broadcast(amountZSig, floatFieldType);

      const jitterFn = ctx.b.kernel('fieldJitterVec');
      const result = ctx.b.kernelZip(
        [pos.id, rand.id, amountXField, amountYField, amountZField],
        jitterFn,
        outType
      );

      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          posOut: { id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      // Mixed path - broadcast signals to fields
      const outType = ctx.outTypes[0];
      const vec3FieldType = outType;
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };
      const posField = isPosSignal ? ctx.b.broadcast(pos.id, vec3FieldType) : pos.id;
      const randField = isRandSignal ? ctx.b.broadcast(rand.id, floatFieldType) : rand.id;
      const amountXField = ctx.b.broadcast(amountXSig, floatFieldType);
      const amountYField = ctx.b.broadcast(amountYSig, floatFieldType);
      const amountZField = ctx.b.broadcast(amountZSig, floatFieldType);

      const jitterFn = ctx.b.kernel('fieldJitterVec');
      const result = ctx.b.kernelZip(
        [posField, randField, amountXField, amountYField, amountZField],
        jitterFn,
        outType
      );

      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          posOut: { id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    }
  },
});
