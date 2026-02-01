/**
 * CircleLayoutUV Block
 *
 * Gauge-invariant circle layout using placement basis.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalType, canonicalField, unitWorld3, strideOf, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, VEC3 } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { rewriteFieldType } from './_helpers';

/**
 * CircleLayoutUV - Gauge-invariant circle layout using placement basis
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec3> positions on a circle.
 * Uses UV placement basis instead of normalizedIndex for gauge invariance.
 */
registerBlock({
  type: 'CircleLayoutUV',
  label: 'Circle Layout (UV)',
  category: 'layout',
  description: 'Arranges elements in a circle pattern using UV placement basis (gauge-invariant)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      elements: ALL_CONCRETE_PAYLOADS,
    },
    semantics: 'typeSpecific',
  },
  inputs: {
    elements: { label: 'Elements', type: canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    radius: { label: 'Radius', type: canonicalType(FLOAT), value: 0.3, defaultSource: defaultSourceConst(0.3), exposedAsPort: true, uiHint: { kind: 'slider', min: 0.01, max: 0.5, step: 0.01 } },
    phase: { label: 'Phase', type: canonicalType(FLOAT, { kind: 'angle', unit: 'phase01' }), value: 0, defaultSource: defaultSourceConst(0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    position: { label: 'Position', type: canonicalField(VEC3, unitWorld3(), { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx, inputsById }) => {
    const elementsInput = inputsById.elements;

    if (!elementsInput || !('type' in elementsInput && requireInst(elementsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
      throw new Error('CircleLayoutUV requires a field input (from Array block)');
    }

    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('CircleLayoutUV requires instance context from upstream Array block');
    }

    // Rewrite output type with actual instance (ctx.outTypes has placeholder 'default')
    const posType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.b);
    const floatFieldType = { ...posType, payload: FLOAT, unit: { kind: 'scalar' as const } };
    const vec2FieldType = { ...posType, payload: { kind: 'vec2' as const }, unit: { kind: 'scalar' as const } };

    // Get radius and phase as signals
    const radiusSig = ('type' in inputsById.radius! && requireInst(inputsById.radius!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.radius!.id
      : ctx.b.constant(floatConst(0.3), canonicalType(FLOAT));
    const phaseSig = ('type' in inputsById.phase! && requireInst(inputsById.phase!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.phase!.id
      : ctx.b.constant(floatConst(0), canonicalType(FLOAT));

    // Use halton2D as default basis kind (user-configurable when BlockDef supports config)
    const basisKind: import('../../compiler/ir/types').BasisKind = 'halton2D';

    // Create UV field from placement basis
    const uvField = ctx.b.placement('uv',
      basisKind,
      vec2FieldType
    );

    // Decompose circleLayoutUV into opcode sequence:
    // u = extract(uvField, 0) — component 0 = X
    const u = ctx.b.extract(uvField, 0, floatFieldType);

    // Constants
    const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const const1 = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
    const const0_5 = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));
    const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));

    // Broadcast constants and signals to fields
    const const0Broadcast = ctx.b.broadcast(const0, floatFieldType);
    const const1Broadcast = ctx.b.broadcast(const1, floatFieldType);
    const const0_5Broadcast = ctx.b.broadcast(const0_5, floatFieldType);
    const twoPiBroadcast = ctx.b.broadcast(twoPi, floatFieldType);
    const phaseBroadcast = ctx.b.broadcast(phaseSig, floatFieldType);
    const radiusBroadcast = ctx.b.broadcast(radiusSig, floatFieldType);

    // Opcodes
    const clamp = ctx.b.opcode(OpCode.Clamp);
    const add = ctx.b.opcode(OpCode.Add);
    const mul = ctx.b.opcode(OpCode.Mul);
    const cos = ctx.b.opcode(OpCode.Cos);
    const sin = ctx.b.opcode(OpCode.Sin);

    // u_clamped = clamp(u, 0, 1)
    const u_clamped = ctx.b.kernelZip([u, const0Broadcast, const1Broadcast], clamp, floatFieldType);

    // angle_base = add(u_clamped, phase_field)
    const angle_base = ctx.b.kernelZip([u_clamped, phaseBroadcast], add, floatFieldType);

    // angle = mul(angle_base, twoPi)
    const angle = ctx.b.kernelZip([angle_base, twoPiBroadcast], mul, floatFieldType);

    // x_raw = cos(angle), y_raw = sin(angle)
    const x_raw = ctx.b.kernelMap(angle, cos, floatFieldType);
    const y_raw = ctx.b.kernelMap(angle, sin, floatFieldType);

    // x_scaled = mul(x_raw, radius), y_scaled = mul(y_raw, radius)
    const x_scaled = ctx.b.kernelZip([x_raw, radiusBroadcast], mul, floatFieldType);
    const y_scaled = ctx.b.kernelZip([y_raw, radiusBroadcast], mul, floatFieldType);

    // x = add(x_scaled, 0.5), y = add(y_scaled, 0.5)
    const x = ctx.b.kernelZip([x_scaled, const0_5Broadcast], add, floatFieldType);
    const y = ctx.b.kernelZip([y_scaled, const0_5Broadcast], add, floatFieldType);

    // z = broadcast(0)
    const z = const0Broadcast;

    // pos = construct([x, y, z]) → vec3
    const positionField = ctx.b.construct([x, y, z], posType);

    const posSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        position: { id: positionField, slot: posSlot, type: posType, stride: strideOf(posType.payload) },
      },
      instanceContext: instanceId,
    };
  },
});
