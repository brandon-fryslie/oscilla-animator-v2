/**
 * LineLayoutUV Block
 *
 * Gauge-invariant line layout using placement basis.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalType, canonicalField, unitWorld3, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, VEC3 } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';

/**
 * LineLayoutUV - Gauge-invariant line layout using placement basis
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec3> positions along a line.
 * Uses UV placement basis instead of normalizedIndex for gauge invariance.
 */
registerBlock({
  type: 'LineLayoutUV',
  label: 'Line Layout (UV)',
  category: 'layout',
  description: 'Arranges elements along a line using UV placement basis (gauge-invariant)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
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
    elements: { label: 'Elements', type: canonicalField(FLOAT, { kind: 'none' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    x0: { label: 'Start X', type: canonicalType(FLOAT), defaultValue: 0.2, defaultSource: defaultSourceConst(0.2), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    y0: { label: 'Start Y', type: canonicalType(FLOAT), defaultValue: 0.2, defaultSource: defaultSourceConst(0.2), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    x1: { label: 'End X', type: canonicalType(FLOAT), defaultValue: 0.8, defaultSource: defaultSourceConst(0.8), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    y1: { label: 'End Y', type: canonicalType(FLOAT), defaultValue: 0.8, defaultSource: defaultSourceConst(0.8), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    position: { label: 'Position', type: canonicalField(VEC3, unitWorld3(), { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx, inputsById }) => {
    const elementsInput = inputsById.elements;

    if (!elementsInput || !('type' in elementsInput && requireInst(elementsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
      throw new Error('LineLayoutUV requires a field input (from Array block)');
    }

    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('LineLayoutUV requires instance context from upstream Array block');
    }

    // Get resolved output type first
    const posType = ctx.outTypes[0];
    const floatFieldType = { ...posType, payload: FLOAT, unit: { kind: 'none' as const } };
    const vec2FieldType = { ...posType, payload: { kind: 'vec2' as const }, unit: { kind: 'none' as const } };

    // Get line endpoints as signals
    const x0Sig = ('type' in inputsById.x0! && requireInst(inputsById.x0!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.x0!.id
      : ctx.b.constant(floatConst(0.2), canonicalType(FLOAT));
    const y0Sig = ('type' in inputsById.y0! && requireInst(inputsById.y0!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.y0!.id
      : ctx.b.constant(floatConst(0.2), canonicalType(FLOAT));
    const x1Sig = ('type' in inputsById.x1! && requireInst(inputsById.x1!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.x1!.id
      : ctx.b.constant(floatConst(0.8), canonicalType(FLOAT));
    const y1Sig = ('type' in inputsById.y1! && requireInst(inputsById.y1!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.y1!.id
      : ctx.b.constant(floatConst(0.8), canonicalType(FLOAT));

    // Use halton2D as default basis kind (user-configurable when BlockDef supports config)
    const basisKind: import('../../compiler/ir/types').BasisKind = 'halton2D';

    // Create UV field from placement basis
    const uvField = ctx.b.placement('uv',
      basisKind,
      vec2FieldType
    );

    // Decompose lineLayoutUV into opcode sequence:
    // u = extract(uvField, 0) — component 0 = X
    const u = ctx.b.extract(uvField, 0, floatFieldType);

    // Constants
    const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const const1 = ctx.b.constant(floatConst(1), canonicalType(FLOAT));

    // Broadcast constants and signals to fields
    const const0Broadcast = ctx.b.broadcast(const0, floatFieldType);
    const const1Broadcast = ctx.b.broadcast(const1, floatFieldType);
    const x0Broadcast = ctx.b.broadcast(x0Sig, floatFieldType);
    const y0Broadcast = ctx.b.broadcast(y0Sig, floatFieldType);
    const x1Broadcast = ctx.b.broadcast(x1Sig, floatFieldType);
    const y1Broadcast = ctx.b.broadcast(y1Sig, floatFieldType);

    // Opcodes
    const clamp = ctx.b.opcode(OpCode.Clamp);
    const lerp = ctx.b.opcode(OpCode.Lerp);

    // u_clamped = clamp(u, 0, 1)
    const u_clamped = ctx.b.kernelZip([u, const0Broadcast, const1Broadcast], clamp, floatFieldType);

    // x = lerp(x0, x1, u_clamped)
    const x = ctx.b.kernelZip([x0Broadcast, x1Broadcast, u_clamped], lerp, floatFieldType);

    // y = lerp(y0, y1, u_clamped)
    const y = ctx.b.kernelZip([y0Broadcast, y1Broadcast, u_clamped], lerp, floatFieldType);

    // z = broadcast(0)
    const z = const0Broadcast;

    // pos = construct([x, y, z]) → vec3
    const positionField = ctx.b.construct([x, y, z], posType);

    // Slot will be allocated by orchestrator

    return {
      outputsById: {
        position: { id: positionField, slot: undefined, type: posType, stride: payloadStride(posType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'position', type: posType },
        ],
      },
      instanceContext: instanceId,
    };
  },
});
