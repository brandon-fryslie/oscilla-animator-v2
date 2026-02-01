/**
 * Field Operation Blocks
 *
 * Blocks that perform operations on fields (per-element computations).
 * These blocks are cardinality-generic (work with both Signals and Fields) and
 * payload-generic where applicable.
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from './registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../core/ids';
import { canonicalType, canonicalField, strideOf, requireInst } from '../core/canonical-types';
import { FLOAT, INT } from '../core/canonical-types';
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

    const outType = ctx.outTypes[0];
    // Use intrinsic to get normalized index (0..1) for each instance element
    const id01Field = ctx.b.intrinsic('normalizedIndex', outType);
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        id01: { id: id01Field, slot, type: outType, stride: strideOf(outType.payload) },
      },
      // Propagate instance context
      instanceContext: instance,
    };
  },
});

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

    const isField = 'type' in input && requireInst(input.type.extent.cardinality, 'cardinality').kind === 'many';

    if (!isField) {
      // Signal path - use opcode
      const sinFn = ctx.b.opcode(OpCode.Sin);
      const result = ctx.b.kernelMap(input.id, sinFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else {
      // Field path - use field kernel
      const outType = ctx.outTypes[0];
      const sinFn = ctx.b.kernel('fieldSin');
      const result = ctx.b.kernelMap(input.id, sinFn, outType);
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
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

    const isField = 'type' in input && requireInst(input.type.extent.cardinality, 'cardinality').kind === 'many';

    if (!isField) {
      // Signal path - use opcode
      const cosFn = ctx.b.opcode(OpCode.Cos);
      const result = ctx.b.kernelMap(input.id, cosFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    } else {
      // Field path - use field kernel
      const outType = ctx.outTypes[0];
      const cosFn = ctx.b.kernel('fieldCos');
      const result = ctx.b.kernelMap(input.id, cosFn, outType);
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          result: { id: result, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    }
  },
});
