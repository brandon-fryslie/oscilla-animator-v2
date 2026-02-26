/**
 * Array Block (Payload-Generic)
 *
 * Creates multiple copies of an element (one<T> → many<T>).
 * Stage 2: Cardinality transform block.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, type PayloadType, boolConst, withInstance, instanceRef, requireInst, unitNone, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, SHAPE, INT, BOOL } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { DOMAIN_CIRCLE } from '../../core/domain-registry';
import { defaultSourceConst, defaultSource } from '../../types';
import { resolveInputConstant } from '../lower-utils';

// [LAW:one-source-of-truth] Array output cardinality behavior is declared on CT/ICT.
const ARRAY_OUTPUT_CARD = cardinalityVar(cardinalityVarId('array_outputs'), {
  relation: 'uniform',
  acceptance: 'manyOnly',
  instanceBinding: { kind: 'create', domainType: DOMAIN_CIRCLE },
});

export function register(): void {
  registerBlock({
    type: 'Array',
    label: 'Array',
    category: 'instance',
    description: 'Creates multiple copies of an element (one<T> → many<T>)',
    form: 'primitive',
    capability: 'identity',
    loweringPurity: 'pure',
    payload: {
      allowedPayloads: {
        element: [SHAPE],
        elements: [SHAPE],
      },
      combinations: [SHAPE].map(p => ({
        inputs: [p] as PayloadType[],
        output: p,
      })),
      semantics: 'typeSpecific',
    },
    inputs: {
      element: {
        label: 'Element',
        type: canonicalType(SHAPE),
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
      elements: {
        label: 'Elements',
        type: canonicalType(SHAPE, { kind: 'none' }, { cardinality: ARRAY_OUTPUT_CARD }, contractClamp01()),
      },
      index: {
        label: 'Index',
        type: canonicalType(INT, { kind: 'none' }, { cardinality: ARRAY_OUTPUT_CARD }, contractClamp01()),
      },
      t: {
        label: 'T (0-1)',
        type: canonicalType(FLOAT, unitNone(), { cardinality: ARRAY_OUTPUT_CARD }, contractClamp01()),
      },
      active: {
        label: 'Active',
        type: canonicalType(BOOL, { kind: 'none' }, { cardinality: ARRAY_OUTPUT_CARD }, contractClamp01()),
      },
    },
    lower: ({ ctx, inputsById }) => {
      const countInput = inputsById.count;
      if (!countInput) throw new Error('Array: count input not wired — normalization bug');
      const count = resolveInputConstant(ctx, countInput, 'count', { min: 1, max: 100000 });
      const elementInput = inputsById.element;
  
      // Validate element input
      if (!elementInput || !('type' in elementInput && requireInst(elementInput.type.extent.cardinality, 'cardinality').kind === 'one')) {
        throw new Error('Array block requires an element with one-cardinality');
      }
  
      /**
       * Create instance with shape field reference.
       *
       * The elementInput.id points to the shape value (e.g., from Ellipse.shape).
       * This gets stored in InstanceDecl.shapeField, enabling RenderInstances2D
       * to automatically look up the shape without requiring separate wiring.
       *
       * Flow:
       *   Ellipse.shape (one<shape>) → Array.element → stored as instance.shapeField
       *   Array.elements (Field<shape>) → Layout.controlPoints → RenderInstances2D.controlPoints
       *   RenderInstances2D extracts instanceId from controlPoints → looks up shapeField
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
      const activeOne = ctx.b.constant(boolConst(true), canonicalType(BOOL));
      const activeField = ctx.b.broadcast(activeOne, outType3);
  
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
}
