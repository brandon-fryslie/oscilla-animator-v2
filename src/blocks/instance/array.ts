/**
 * Array Block (Payload-Generic)
 *
 * Creates multiple copies of an element (Signal<T> → Field<T>).
 * Stage 2: Cardinality transform block.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalType, canonicalField, strideOf, type PayloadType, boolConst, withInstance, instanceRef, requireInst } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, SHAPE } from '../../core/canonical-types';
import { DOMAIN_CIRCLE } from '../../core/domain-registry';
import { defaultSourceConst, defaultSource } from '../../types';

registerBlock({
  type: 'Array',
  label: 'Array',
  category: 'instance',
  description: 'Creates multiple copies of an element (Signal<T> → Field<T>)',
  form: 'primitive',
  capability: 'identity',
  cardinality: {
    cardinalityMode: 'transform',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      element: ALL_CONCRETE_PAYLOADS,
      elements: ALL_CONCRETE_PAYLOADS,
    },
    combinations: ALL_CONCRETE_PAYLOADS.map(p => ({
      inputs: [p] as PayloadType[],
      output: p,
    })),
    semantics: 'typeSpecific',
  },
  inputs: {
    element: {
      label: 'Element',
      type: canonicalType(SHAPE),
      optional: true,
      defaultSource: defaultSource('Ellipse', 'shape'),
    },
    count: {
      label: 'Count',
      type: canonicalType(INT),
      value: 100,
      defaultSource: defaultSourceConst(100),
      exposedAsPort: true,
      uiHint: { kind: 'slider', min: 1, max: 10000, step: 1 },
    },
  },
  outputs: {
    elements: { label: 'Elements', type: canonicalField(SHAPE, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    index: { label: 'Index', type: canonicalField(INT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    t: { label: 'T (0-1)', type: canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    active: { label: 'Active', type: canonicalField(BOOL, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const count = (config?.count as number) ?? 100;
    const elementInput = inputsById.element;

    // Create instance (layout is now handled via field kernels, not instance metadata)
    const instanceId = ctx.b.createInstance(DOMAIN_CIRCLE, count);

    // Rewrite output types with actual instance ref (ctx.outTypes has placeholder 'default')
    const ref = instanceRef(DOMAIN_CIRCLE as string, instanceId as string);
    const outType0 = withInstance(ctx.outTypes[0], ref);
    const outType1 = withInstance(ctx.outTypes[1], ref);
    const outType2 = withInstance(ctx.outTypes[2], ref);
    const outType3 = withInstance(ctx.outTypes[3], ref);

    // Create field expressions
    if (!elementInput || !('type' in elementInput && requireInst(elementInput.type.extent.cardinality, 'cardinality').kind === 'one')) {
      throw new Error('Array block requires an element signal input');
    }
    const elementsField = ctx.b.broadcast(elementInput.id, outType0);

    // Intrinsic fields (index, t, active)
    const indexField = ctx.b.intrinsic('index', outType1);
    const tField = ctx.b.intrinsic('normalizedIndex', outType2);
    const activeSignal = ctx.b.constant(boolConst(true), canonicalType(BOOL));
    const activeField = ctx.b.broadcast(activeSignal, outType3);

    return {
      outputsById: {
        elements: { id: elementsField, slot: ctx.b.allocSlot(), type: outType0, stride: strideOf(outType0.payload) },
        index: { id: indexField, slot: ctx.b.allocSlot(), type: outType1, stride: strideOf(outType1.payload) },
        t: { id: tField, slot: ctx.b.allocSlot(), type: outType2, stride: strideOf(outType2.payload) },
        active: { id: activeField, slot: ctx.b.allocSlot(), type: outType3, stride: strideOf(outType3.payload) },
      },
      instanceContext: instanceId,
    };
  },
});
