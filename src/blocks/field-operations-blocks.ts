/**
 * Field Operation Blocks
 *
 * Blocks that perform operations on fields (per-element computations).
 * These blocks are cardinality-generic (work with both Signals and Fields) and
 * payload-generic where applicable.
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from './registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../core/ids';
import { canonicalType, canonicalField, unitPhase01, strideOf, floatConst, vec2Const, vec3Const, deriveKind } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
import { defaultSourceConst, defaultSourceTimeRoot } from '../types';
import type { SigExprId, FieldExprId } from '../compiler/ir/Indices';
import { slotOffset } from '../compiler/ir/Indices';
import { OpCode } from '../compiler/ir/types';

// =============================================================================
// FromDomainId (fieldOnly - uses intrinsics)
// =============================================================================

registerBlock({
  type: 'FromDomainId',
  label: 'From Domain ID',
  category: 'field',
  description: 'Generates normalized (0..1) ID for each element in a domain',
  form: 'primitive',
  capability: 'identity',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    domain: { label: 'Domain', type: canonicalType(INT) }, // Domain count
  },
  outputs: {
    id01: { label: 'ID (0..1)', type: canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx }) => {
    // Get instance context from Array block or inferred from inputs
    const instance = ctx.inferredInstance ?? ctx.instance;
    if (!instance) {
      throw new Error('FromDomainId requires instance context');
    }

    // Use fieldIntrinsic to get normalized index (0..1) for each instance element
    const id01Field = ctx.b.fieldIntrinsic(instance, 'normalizedIndex', canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        id01: { k: 'field', id: id01Field, slot, type: outType, stride: strideOf(outType.payload) },
      },
      // Propagate instance context
      instanceContext: instance,
    };
  },
});

// NOTE: FieldAdd, FieldMultiply, and FieldScale have been removed.
// Use the cardinality-generic Add and Multiply blocks instead, which work with both
// signals and fields.

// =============================================================================
// Sin (cardinality-generic)
// =============================================================================

registerBlock({
  type: 'Sin',
  label: 'Sin',
  category: 'math',
  description: 'Per-element sine (works with both signals and fields)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  payload: {
    allowedPayloads: {
      input: STANDARD_NUMERIC_PAYLOADS,
      result: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise',
  },
  inputs: {
    input: { label: 'Input', type: canonicalType(FLOAT) },
  },
  outputs: {
    result: { label: 'Result', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const input = inputsById.input;

    if (!input) {
      throw new Error('Sin input required');
    }

    if (input.k === 'sig') {
      // Signal path - use opcode
      const sinFn = ctx.b.opcode(OpCode.Sin);
      const result = ctx.b.sigMap(input.id, sinFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (input.k === 'field') {
      // Field path - use field kernel
      const sinFn = ctx.b.kernel('fieldSin');
      const result = ctx.b.fieldMap(input.id, sinFn, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      throw new Error('Sin input must be signal or field');
    }
  },
});

// =============================================================================
// Cos (cardinality-generic)
// =============================================================================

registerBlock({
  type: 'Cos',
  label: 'Cos',
  category: 'math',
  description: 'Per-element cosine (works with both signals and fields)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  payload: {
    allowedPayloads: {
      input: STANDARD_NUMERIC_PAYLOADS,
      result: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise',
  },
  inputs: {
    input: { label: 'Input', type: canonicalType(FLOAT) },
  },
  outputs: {
    result: { label: 'Result', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const input = inputsById.input;

    if (!input) {
      throw new Error('Cos input required');
    }

    if (input.k === 'sig') {
      // Signal path - use opcode
      const cosFn = ctx.b.opcode(OpCode.Cos);
      const result = ctx.b.sigMap(input.id, cosFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (input.k === 'field') {
      // Field path - use field kernel
      const cosFn = ctx.b.kernel('fieldCos');
      const result = ctx.b.fieldMap(input.id, cosFn, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      throw new Error('Cos input must be signal or field');
    }
  },
});

// =============================================================================
// Mod (cardinality-generic)
// =============================================================================

registerBlock({
  type: 'Mod',
  label: 'Mod',
  category: 'math',
  description: 'Per-element modulo (works with both signals and fields)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      a: STANDARD_NUMERIC_PAYLOADS,
      b: STANDARD_NUMERIC_PAYLOADS,
      result: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise',
  },
  inputs: {
    a: { label: 'A', type: canonicalType(FLOAT) },
    b: { label: 'B', type: canonicalType(FLOAT) },
  },
  outputs: {
    result: { label: 'Result', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || !b) {
      throw new Error('Mod inputs required');
    }

    if (a.k === 'sig' && b.k === 'sig') {
      // Signal path
      const modFn = ctx.b.opcode(OpCode.Mod);
      const result = ctx.b.sigZip([a.id, b.id], modFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (a.k === 'field' && b.k === 'field') {
      // Field path
      const modFn = ctx.b.kernel('fieldMod');
      const result = ctx.b.fieldZip([a.id, b.id], modFn, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      throw new Error('Mod inputs must both be signals or both be fields');
    }
  },
});

// =============================================================================
// FieldPolarToCartesian (cardinality-generic)
// Note: Kept with "Field" prefix to avoid conflict with signal-only PolarToCartesian in geometry-blocks
// =============================================================================

registerBlock({
  type: 'FieldPolarToCartesian',
  label: 'Field Polar to Cartesian',
  category: 'field',
  description: 'Convert polar coordinates (angle, radius) to Cartesian (x, y)',
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
    centerX: { label: 'Center X', type: canonicalType(FLOAT), optional: true, value: 0.5, defaultSource: defaultSourceConst(0.5), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    centerY: { label: 'Center Y', type: canonicalType(FLOAT), optional: true, value: 0.5, defaultSource: defaultSourceConst(0.5), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    pos: { label: 'Position', type: canonicalType(VEC3) },
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
      // Signal path - build compound operation: pos.x = centerX + radius * cos(angle), pos.y = centerY + radius * sin(angle)
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

      // Package as vec3 - use composed kernel to build vec3 from (x, y, z)
      const vec3Fn = ctx.b.kernel('vec3FromComponents');
      const result = ctx.b.sigZip([x, y, z], vec3Fn, canonicalType(VEC3));

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          pos: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (angle.k === 'field' && radius.k === 'field') {
      // Field path - use broadcast for center signals
      const centerXField = ctx.b.Broadcast(centerXSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const centerYField = ctx.b.Broadcast(centerYSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));

      // Zip all four fields together: centerX, centerY, radius, angle -> vec3
      const polarFn = ctx.b.kernel('fieldPolarToCartesian');
      const posField = ctx.b.fieldZip(
        [centerXField, centerYField, radius.id, angle.id],
        polarFn,
        canonicalField(VEC3, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          pos: { k: 'field', id: posField, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      // Mixed path - broadcast signals to fields
      const angleField = angle.k === 'field' ? angle.id : ctx.b.Broadcast((angle as { k: 'sig'; id: SigExprId }).id, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const radiusField = radius.k === 'field' ? radius.id : ctx.b.Broadcast((radius as { k: 'sig'; id: SigExprId }).id, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const centerXField = ctx.b.Broadcast(centerXSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const centerYField = ctx.b.Broadcast(centerYSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));

      const polarFn = ctx.b.kernel('fieldPolarToCartesian');
      const posField = ctx.b.fieldZip(
        [centerXField, centerYField, radiusField, angleField],
        polarFn,
        canonicalField(VEC3, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          pos: { k: 'field', id: posField, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    }
  },
});

// =============================================================================
// FieldCartesianToPolar (cardinality-generic)
// Note: Kept with "Field" prefix to avoid conflict with signal-only CartesianToPolar in geometry-blocks
// =============================================================================

registerBlock({
  type: 'FieldCartesianToPolar',
  label: 'Field Cartesian to Polar',
  category: 'field',
  description: 'Convert Cartesian coordinates (x, y) to polar (angle, radius)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    pos: { label: 'Position', type: canonicalType(VEC3) },
    centerX: { label: 'Center X', type: canonicalType(FLOAT), optional: true, value: 0.5, defaultSource: defaultSourceConst(0.5), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    centerY: { label: 'Center Y', type: canonicalType(FLOAT), optional: true, value: 0.5, defaultSource: defaultSourceConst(0.5), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    angle: { label: 'Angle', type: canonicalType(FLOAT) },
    radius: { label: 'Radius', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const pos = inputsById.pos;
    const centerX = inputsById.centerX;
    const centerY = inputsById.centerY;

    if (!pos) {
      throw new Error('CartesianToPolar pos required');
    }

    // Get center signals (or create default constants)
    const centerXSig = centerX?.k === 'sig' ? centerX.id : ctx.b.sigConst(floatConst(0.5), canonicalType(FLOAT));
    const centerYSig = centerY?.k === 'sig' ? centerY.id : ctx.b.sigConst(floatConst(0.5), canonicalType(FLOAT));

    if (pos.k === 'sig') {
      // Signal path - extract components and compute angle/radius
      // This would need vec3 component extraction and atan2/sqrt opcodes
      // For now, use kernel approach for signal path too
      const extractFn = ctx.b.kernel('vec3ExtractXY');
      const xySig = ctx.b.sigMap(pos.id, extractFn, canonicalType(VEC2));

      // Compute dx = x - centerX, dy = y - centerY
      const subFn = ctx.b.opcode(OpCode.Sub);
      const xyComponents = ctx.b.kernel('vec2ToComponents');
      const components = ctx.b.sigMap(xySig, xyComponents, canonicalType(FLOAT));

      // Use atan2 and sqrt through kernel
      const polarFn = ctx.b.kernel('cartesianToPolarSig');
      const angleResult = ctx.b.sigZip([pos.id, centerXSig, centerYSig], polarFn, canonicalType(FLOAT));
      const radiusResult = ctx.b.sigZip([pos.id, centerXSig, centerYSig], polarFn, canonicalType(FLOAT));

      const outTypeAngle = ctx.outTypes[0];
      const outTypeRadius = ctx.outTypes[1];
      const angleSlot = ctx.b.allocSlot();
      const radiusSlot = ctx.b.allocSlot();

      return {
        outputsById: {
          angle: { k: 'sig', id: angleResult, slot: angleSlot, type: outTypeAngle, stride: strideOf(outTypeAngle.payload) },
          radius: { k: 'sig', id: radiusResult, slot: radiusSlot, type: outTypeRadius, stride: strideOf(outTypeRadius.payload) },
        },
      };
    } else if (pos.k === 'field') {
      // Field path - use broadcast for center signals
      const centerXField = ctx.b.Broadcast(centerXSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const centerYField = ctx.b.Broadcast(centerYSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));

      // Zip all three fields together: pos, centerX, centerY -> (angle, radius)
      const polarFn = ctx.b.kernel('fieldCartesianToPolar');
      const angleField = ctx.b.fieldZip(
        [pos.id, centerXField, centerYField],
        polarFn,
        canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
      );
      const radiusField = ctx.b.fieldZip(
        [pos.id, centerXField, centerYField],
        polarFn,
        canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
      );

      const outTypeAngle = ctx.outTypes[0];
      const outTypeRadius = ctx.outTypes[1];
      const angleSlot = ctx.b.allocSlot();
      const radiusSlot = ctx.b.allocSlot();

      return {
        outputsById: {
          angle: { k: 'field', id: angleField, slot: angleSlot, type: outTypeAngle, stride: strideOf(outTypeAngle.payload) },
          radius: { k: 'field', id: radiusField, slot: radiusSlot, type: outTypeRadius, stride: strideOf(outTypeRadius.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      throw new Error('CartesianToPolar pos must be signal or field');
    }
  },
});

// =============================================================================
// Pulse (cardinality-generic)
// =============================================================================

registerBlock({
  type: 'Pulse',
  label: 'Pulse',
  category: 'field',
  description: 'Per-element pulsing animation based on phase and spread',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    id01: { label: 'ID (0..1)', type: canonicalType(FLOAT) },
    // Phase input expects normalized time cycle [0, 1)
    phase: { label: 'Phase', type: canonicalType(FLOAT, unitPhase01()), defaultSource: defaultSourceTimeRoot('phaseA'), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    base: { label: 'Base', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(0.5), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    amplitude: { label: 'Amplitude', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(1.0), uiHint: { kind: 'slider', min: 0, max: 2, step: 0.01 } },
    spread: { label: 'Spread', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(1.0), uiHint: { kind: 'slider', min: 0, max: 2, step: 0.01 } },
  },
  outputs: {
    value: { label: 'Value', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const id01 = inputsById.id01;
    const phase = inputsById.phase;
    const base = inputsById.base;
    const amplitude = inputsById.amplitude;
    const spread = inputsById.spread;

    if (!id01) {
      throw new Error('Pulse id01 required');
    }

    // Get signal inputs (or create default constants)
    const phaseSig = phase?.k === 'sig' ? phase.id : ctx.b.sigConst(floatConst(0), canonicalType(FLOAT, unitPhase01()));
    const baseSig = base?.k === 'sig' ? base.id : ctx.b.sigConst(floatConst(0.5), canonicalType(FLOAT));
    const ampSig = amplitude?.k === 'sig' ? amplitude.id : ctx.b.sigConst(floatConst(1), canonicalType(FLOAT));
    const spreadSig = spread?.k === 'sig' ? spread.id : ctx.b.sigConst(floatConst(1), canonicalType(FLOAT));

    if (id01.k === 'sig') {
      // Signal path - compute: base + amplitude * sin(2π * (phase + id01 * spread))
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const addFn = ctx.b.opcode(OpCode.Add);
      const sinFn = ctx.b.opcode(OpCode.Sin);

      const idSpread = ctx.b.sigZip([id01.id, spreadSig], mulFn, canonicalType(FLOAT));
      const phaseOffset = ctx.b.sigZip([phaseSig, idSpread], addFn, canonicalType(FLOAT));
      const tau = ctx.b.sigConst(floatConst(2 * Math.PI), canonicalType(FLOAT));
      const angle = ctx.b.sigZip([tau, phaseOffset], mulFn, canonicalType(FLOAT));
      const sinValue = ctx.b.sigMap(angle, sinFn, canonicalType(FLOAT));
      const scaled = ctx.b.sigZip([ampSig, sinValue], mulFn, canonicalType(FLOAT));
      const result = ctx.b.sigZip([baseSig, scaled], addFn, canonicalType(FLOAT));

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          value: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (id01.k === 'field') {
      // Field path - broadcast signal inputs to fields
      const phaseField = ctx.b.Broadcast(phaseSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const baseField = ctx.b.Broadcast(baseSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const ampField = ctx.b.Broadcast(ampSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const spreadField = ctx.b.Broadcast(spreadSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));

      // Compute: base + amplitude * sin(2π * (phase + id01 * spread))
      const pulseFn = ctx.b.kernel('fieldPulse');
      const result = ctx.b.fieldZip(
        [id01.id, phaseField, baseField, ampField, spreadField],
        pulseFn,
        canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          value: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      throw new Error('Pulse id01 must be signal or field');
    }
  },
});

// =============================================================================
// GoldenAngle (cardinality-generic)
// =============================================================================

registerBlock({
  type: 'GoldenAngle',
  label: 'Golden Angle',
  category: 'field',
  description: 'Generate golden angle distribution for each element',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    id01: { label: 'ID (0..1)', type: canonicalType(FLOAT) },
    turns: { label: 'Turns', type: canonicalType(FLOAT), value: 50, defaultSource: defaultSourceConst(50), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 50, step: 0.1 } },
  },
  outputs: {
    angle: { label: 'Angle', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const id01 = inputsById.id01;
    const turns = inputsById.turns;

    if (!id01) {
      throw new Error('GoldenAngle id01 required');
    }

    // Golden angle ≈ 2.39996... radians (137.508°)
    const GOLDEN_ANGLE = 2.39996322972865332;

    // Get turns signal (or create default constant)
    const turnsSig = turns?.k === 'sig' ? turns.id : ctx.b.sigConst(floatConst(50), canonicalType(FLOAT));

    if (id01.k === 'sig') {
      // Signal path - angle = id01 * turns * goldenAngle
      const goldenAngleConst = ctx.b.sigConst(floatConst(GOLDEN_ANGLE), canonicalType(FLOAT));
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const turnsScaled = ctx.b.sigZip([id01.id, turnsSig], mulFn, canonicalType(FLOAT));
      const result = ctx.b.sigZip([turnsScaled, goldenAngleConst], mulFn, canonicalType(FLOAT));

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          angle: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (id01.k === 'field') {
      // Field path - use fieldZipSig kernel with turns signal
      const goldenAngleFn = ctx.b.kernel('fieldGoldenAngle');
      const result = ctx.b.fieldZipSig(id01.id, [turnsSig], goldenAngleFn, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          angle: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      throw new Error('GoldenAngle id01 must be signal or field');
    }
  },
});

// =============================================================================
// AngularOffset (cardinality-generic)
// =============================================================================

registerBlock({
  type: 'AngularOffset',
  label: 'Angular Offset',
  category: 'field',
  description: 'Per-element angular offset based on phase and spin',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    id01: { label: 'ID (0..1)', type: canonicalType(FLOAT) },
    phase: { label: 'Phase', type: canonicalType(FLOAT, unitPhase01()), defaultSource: defaultSourceTimeRoot('phaseA'), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    spin: { label: 'Spin', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(1.0), uiHint: { kind: 'slider', min: -2, max: 2, step: 0.01 } },
  },
  outputs: {
    offset: { label: 'Offset', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const id01 = inputsById.id01;
    const phase = inputsById.phase;
    const spin = inputsById.spin;

    if (!id01) {
      throw new Error('AngularOffset id01 required');
    }

    // Get signal inputs (or create default constants)
    const phaseSig = phase?.k === 'sig' ? phase.id : ctx.b.sigConst(floatConst(0), canonicalType(FLOAT));
    const spinSig = spin?.k === 'sig' ? spin.id : ctx.b.sigConst(floatConst(1), canonicalType(FLOAT));

    if (id01.k === 'sig') {
      // Signal path - offset = 2π * phase * spin
      const tau = ctx.b.sigConst(floatConst(2 * Math.PI), canonicalType(FLOAT));
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const phaseSpin = ctx.b.sigZip([phaseSig, spinSig], mulFn, canonicalType(FLOAT));
      const result = ctx.b.sigZip([tau, phaseSpin], mulFn, canonicalType(FLOAT));

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          offset: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (id01.k === 'field') {
      // Field path - broadcast signal inputs to fields
      const phaseField = ctx.b.Broadcast(phaseSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const spinField = ctx.b.Broadcast(spinSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));

      // offset = 2π * phase * spin
      const offsetFn = ctx.b.kernel('fieldAngularOffset');
      const result = ctx.b.fieldZip(
        [id01.id, phaseField, spinField],
        offsetFn,
        canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          offset: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      throw new Error('AngularOffset id01 must be signal or field');
    }
  },
});

// =============================================================================
// RadiusSqrt (cardinality-generic)
// =============================================================================

registerBlock({
  type: 'RadiusSqrt',
  label: 'Radius Sqrt',
  category: 'field',
  description: 'Square root radius distribution for even area coverage',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    id01: { label: 'ID (0..1)', type: canonicalType(FLOAT) },
    radius: { label: 'Radius', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(0.35), uiHint: { kind: 'slider', min: 0.01, max: 5, step: 0.1 } },
  },
  outputs: {
    out: { label: 'Radius', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const id01 = inputsById.id01;
    const radius = inputsById.radius;

    if (!id01 || !radius) {
      throw new Error('RadiusSqrt id01 and radius required');
    }

    if (id01.k === 'sig' && radius.k === 'sig') {
      // Signal path - effective_radius = radius * sqrt(id01)
      const sqrtFn = ctx.b.opcode(OpCode.Sqrt);
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const sqrtId = ctx.b.sigMap(id01.id, sqrtFn, canonicalType(FLOAT));
      const result = ctx.b.sigZip([radius.id, sqrtId], mulFn, canonicalType(FLOAT));

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (id01.k === 'field' && radius.k === 'field') {
      // Field path - use field kernel
      const sqrtFn = ctx.b.kernel('fieldRadiusSqrt');
      const result = ctx.b.fieldZip(
        [id01.id, radius.id],
        sqrtFn,
        canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      // Mixed path - broadcast signals to fields
      const id01Field = id01.k === 'field' ? id01.id : ctx.b.Broadcast((id01 as { k: 'sig'; id: SigExprId }).id, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const radiusField = radius.k === 'field' ? radius.id : ctx.b.Broadcast((radius as { k: 'sig'; id: SigExprId }).id, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));

      const sqrtFn = ctx.b.kernel('fieldRadiusSqrt');
      const result = ctx.b.fieldZip(
        [id01Field, radiusField],
        sqrtFn,
        canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    }
  },
});

// =============================================================================
// JitterVec (cardinality-generic) - adds random jitter to vec3 positions
// =============================================================================

registerBlock({
  type: 'JitterVec',
  label: 'Jitter Vec',
  category: 'field',
  description: 'Add per-element random jitter to vec3 positions',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    pos: { label: 'Position', type: canonicalType(VEC3) },
    rand: { label: 'Random', type: canonicalType(FLOAT) },
    amountX: { label: 'Amount X', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(0.01), uiHint: { kind: 'slider', min: 0, max: 0.1, step: 0.001 } },
    amountY: { label: 'Amount Y', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(0.01), uiHint: { kind: 'slider', min: 0, max: 0.1, step: 0.001 } },
    amountZ: { label: 'Amount Z', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(0.0), uiHint: { kind: 'slider', min: 0, max: 0.1, step: 0.001 } },
  },
  outputs: {
    out: { label: 'Position', type: canonicalType(VEC3) },
  },
  lower: ({ ctx, inputsById }) => {
    const pos = inputsById.pos;
    const rand = inputsById.rand;
    const amountX = inputsById.amountX;
    const amountY = inputsById.amountY;
    const amountZ = inputsById.amountZ;

    if (!pos || !rand) {
      throw new Error('JitterVec pos and rand required');
    }

    // Get amount signals (or create default constants)
    const amountXSig = amountX?.k === 'sig' ? amountX.id : ctx.b.sigConst(floatConst(0.01), canonicalType(FLOAT));
    const amountYSig = amountY?.k === 'sig' ? amountY.id : ctx.b.sigConst(floatConst(0.01), canonicalType(FLOAT));
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
          out: { k: 'sig', id: xOut, slot, type: outType, stride, components },
        },
      };
    } else if (pos.k === 'field' && rand.k === 'field') {
      // Field path - broadcast amount signals to fields
      const amountXField = ctx.b.Broadcast(amountXSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const amountYField = ctx.b.Broadcast(amountYSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const amountZField = ctx.b.Broadcast(amountZSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));

      const jitterFn = ctx.b.kernel('fieldJitterVec');
      const result = ctx.b.fieldZip(
        [pos.id, rand.id, amountXField, amountYField, amountZField],
        jitterFn,
        canonicalField(VEC3, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      // Mixed path - broadcast signals to fields
      const posField = pos.k === 'field' ? pos.id : ctx.b.Broadcast((pos as { k: 'sig'; id: SigExprId }).id, canonicalField(VEC3, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const randField = rand.k === 'field' ? rand.id : ctx.b.Broadcast((rand as { k: 'sig'; id: SigExprId }).id, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const amountXField = ctx.b.Broadcast(amountXSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const amountYField = ctx.b.Broadcast(amountYSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const amountZField = ctx.b.Broadcast(amountZSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));

      const jitterFn = ctx.b.kernel('fieldJitterVec');
      const result = ctx.b.fieldZip(
        [posField, randField, amountXField, amountYField, amountZField],
        jitterFn,
        canonicalField(VEC3, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    }
  },
});

// =============================================================================
// HueFromPhase (cardinality-generic)
// =============================================================================

registerBlock({
  type: 'HueFromPhase',
  label: 'Hue From Phase',
  category: 'field',
  description: 'Generate per-element hue values from phase and ID',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    id01: { label: 'ID (0..1)', type: canonicalType(FLOAT) },
    phase: { label: 'Phase', type: canonicalType(FLOAT, unitPhase01()), defaultSource: defaultSourceTimeRoot('phaseA'), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    hue: { label: 'Hue', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const id01 = inputsById.id01;
    const phase = inputsById.phase;

    if (!id01) {
      throw new Error('HueFromPhase id01 required');
    }

    // Get phase signal (or create default constant)
    const phaseSig = phase?.k === 'sig' ? phase.id : ctx.b.sigConst(floatConst(0), canonicalType(FLOAT));

    if (id01.k === 'sig') {
      // Signal path - hue = (id01 + phase) mod 1.0
      const addFn = ctx.b.opcode(OpCode.Add);
      const modFn = ctx.b.opcode(OpCode.Mod);
      const sum = ctx.b.sigZip([id01.id, phaseSig], addFn, canonicalType(FLOAT));
      const one = ctx.b.sigConst(floatConst(1.0), canonicalType(FLOAT));
      const result = ctx.b.sigZip([sum, one], modFn, canonicalType(FLOAT));

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          hue: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else if (id01.k === 'field') {
      // Field path - broadcast phase to field
      const phaseField = ctx.b.Broadcast(phaseSig, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));

      // hue = (id01 + phase) mod 1.0
      const hueFn = ctx.b.kernel('fieldHueFromPhase');
      const result = ctx.b.fieldZip(
        [id01.id, phaseField],
        hueFn,
        canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          hue: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      throw new Error('HueFromPhase id01 must be signal or field');
    }
  },
});

// =============================================================================
// SetZ (cardinality-generic)
// =============================================================================

/**
 * Sets the Z component of a vec3 position field.
 * Useful for adding depth/height animation to 2D layouts.
 */
registerBlock({
  type: 'SetZ',
  label: 'Set Z',
  category: 'field',
  description: 'Set the Z component of a vec3 position field',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    pos: { label: 'Position', type: canonicalType(VEC3) },
    z: { label: 'Z', type: canonicalType(FLOAT) },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(VEC3) },
  },
  lower: ({ ctx, inputsById }) => {
    const pos = inputsById.pos;
    const z = inputsById.z;

    if (!pos || !z) {
      throw new Error('SetZ pos and z required');
    }

    if (pos.k === 'sig' && z.k === 'sig') {
      // Signal path - decompose input vec3, replace z component, recompose
      // Read input vec3 components from slot
      const posSlot = pos.slot;
      const xIn = ctx.b.sigSlot(slotOffset(posSlot, 0), canonicalType(FLOAT));
      const yIn = ctx.b.sigSlot(slotOffset(posSlot, 1), canonicalType(FLOAT));

      // Multi-component signal: allocate strided slot, emit write step
      const outType = ctx.outTypes[0];
      const stride = strideOf(outType.payload);
      const slot = ctx.b.allocSlot(stride);
      const components = [xIn, yIn, z.id];

      ctx.b.stepSlotWriteStrided(slot, components);

      return {
        outputsById: {
          out: { k: 'sig', id: xIn, slot, type: outType, stride, components },
        },
      };
    } else if (pos.k === 'field' && z.k === 'field') {
      // Field path - zip position and z together
      const setZFn = ctx.b.kernel('fieldSetZ');
      const result = ctx.b.fieldZip(
        [pos.id, z.id],
        setZFn,
        canonicalField(VEC3, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    } else {
      // Mixed path - broadcast signals to fields
      const posField = pos.k === 'field' ? pos.id : ctx.b.Broadcast((pos as { k: 'sig'; id: SigExprId }).id, canonicalField(VEC3, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));
      const zField = z.k === 'field' ? z.id : ctx.b.Broadcast((z as { k: 'sig'; id: SigExprId }).id, canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }));

      const setZFn = ctx.b.kernel('fieldSetZ');
      const result = ctx.b.fieldZip(
        [posField, zField],
        setZFn,
        canonicalField(VEC3, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
      );

      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    }
  },
});
