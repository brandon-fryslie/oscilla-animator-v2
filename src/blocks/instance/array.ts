/**
 * Array Block (Payload-Generic)
 *
 * Creates multiple copies of an element (Signal<T> → Field<T>).
 * Stage 2: Cardinality transform block.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalType, canonicalField, payloadStride, type PayloadType, boolConst, withInstance, instanceRef, requireInst, unitNone, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, INT, BOOL } from '../../core/canonical-types';
import { DOMAIN_CIRCLE } from '../../core/domain-registry';
import { defaultSourceConst, defaultSource } from '../../types';

registerBlock({
  type: 'Array',
  label: 'Array',
  category: 'instance',
  description: 'Creates multiple copies of an element (Signal<T> → Field<T>)',
  form: 'primitive',
  capability: 'identity',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'transform',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
    domainType: DOMAIN_CIRCLE,  // Array creates Circle domain instances
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
      type: canonicalType(FLOAT),
      optional: true,
      defaultSource: defaultSource('Ellipse', 'shape'),
    },
    count: {
      label: 'Count',
      type: canonicalType(INT),
      defaultSource: defaultSourceConst(500),
      exposedAsPort: true,
      uiHint: { kind: 'slider', min: 1, max: 10000, step: 1 },
      semantic: 'instanceCount',
    },
  },
  outputs: {
    elements: { label: 'Elements', type: canonicalField(FLOAT, { kind: 'none' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }, contractClamp01()) },
    index: { label: 'Index', type: canonicalField(INT, { kind: 'none' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }, contractClamp01()) },
    t: { label: 'T (0-1)', type: canonicalField(FLOAT, unitNone(), { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }, contractClamp01()) },
    active: { label: 'Active', type: canonicalField(BOOL, { kind: 'none' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }, contractClamp01()) },
  },
  lower: ({ ctx, inputsById, block }) => {
    // Read count from port defaultSource (not config — count is an exposed port)
    const port = block?.inputPorts.get('count');
    const count = (port?.defaultSource?.params?.value as number | undefined) ?? 500; // Registry default
    const elementInput = inputsById.element;

    // Validate element input
    if (!elementInput || !('type' in elementInput && requireInst(elementInput.type.extent.cardinality, 'cardinality').kind === 'one')) {
      throw new Error('Array block requires an element signal input');
    }

    /**
     * Create instance with shape field reference.
     *
     * The elementInput.id points to the shape signal (e.g., from Ellipse.shape).
     * This gets stored in InstanceDecl.shapeField, enabling RenderInstances2D
     * to automatically look up the shape without requiring separate wiring.
     *
     * Flow:
     *   Ellipse.shape (Signal<shape>) → Array.element → stored as instance.shapeField
     *   Array.elements (Field<shape>) → Layout → position → RenderInstances2D
     *   RenderInstances2D extracts instanceId from position → looks up shapeField
     */
    const instanceId = ctx.b.createInstance(DOMAIN_CIRCLE, count, elementInput.id);

    // Rewrite output types with actual instance ref (ctx.outTypes has placeholder 'default')
    const ref = instanceRef(DOMAIN_CIRCLE as string, instanceId as string);
    const outType0 = withInstance(ctx.outTypes[0], ref);
    const outType1 = withInstance(ctx.outTypes[1], ref);
    const outType2 = withInstance(ctx.outTypes[2], ref);
    const outType3 = withInstance(ctx.outTypes[3], ref);

    // Create field expressions
    const elementsField = ctx.b.broadcast(elementInput.id, outType0);

    // Intrinsic fields (index, t, active)
    const indexField = ctx.b.intrinsic('index', outType1);
    const tField = ctx.b.intrinsic('normalizedIndex', outType2);
    const activeSignal = ctx.b.constant(boolConst(true), canonicalType(BOOL));
    const activeField = ctx.b.broadcast(activeSignal, outType3);

    return {
      outputsById: {
        elements: { id: elementsField, slot: undefined, type: outType0, stride: payloadStride(outType0.payload) },
        index: { id: indexField, slot: undefined, type: outType1, stride: payloadStride(outType1.payload) },
        t: { id: tField, slot: undefined, type: outType2, stride: payloadStride(outType2.payload) },
        active: { id: activeField, slot: undefined, type: outType3, stride: payloadStride(outType3.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'elements', type: outType0 },
          { portId: 'index', type: outType1 },
          { portId: 't', type: outType2 },
          { portId: 'active', type: outType3 },
        ],
      },
      instanceContext: instanceId,
    };
  },
});
