/**
 * Array Blocks
 *
 * Array blocks transform Signal<T> → Field<T> (Stage 2 of three-stage architecture).
 * They create instances and provide cardinality transform.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from './registry';
import { signalType, signalTypeField, type PayloadType } from '../core/canonical-types';
import { DOMAIN_CIRCLE } from '../core/domain-registry';
import { defaultSourceConst, defaultSource } from '../types';

// =============================================================================
// Array Block (Payload-Generic)
// =============================================================================

/**
 * Array - Creates multiple copies of an element (Signal<T> → Field<T>)
 *
 * Stage 2: Cardinality transform block.
 * Takes a Signal<T> and produces Field<T> with N elements.
 *
 * Payload-Generic: Accepts any concrete payload type for element input.
 *
 * Example:
 * Circle (Signal<float>) → Array → Field<float> (100 copies)
 *
 * Outputs:
 * - elements: Field<T> - The array elements (input broadcast to field)
 * - index: Field<int> - Index of each element (0, 1, 2, ...)
 * - t: Field<float> - Normalized index (0.0 to 1.0)
 * - active: Field<bool> - Whether element is active (all true for static arrays)
 */
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
      type: signalType('shape'),  // Default type for typical usage
      optional: true,
      defaultSource: defaultSource('Ellipse', 'shape'),
    },
    count: {
      label: 'Count',
      type: signalType('int'),
      value: 100,
      defaultSource: defaultSourceConst(100),
      uiHint: { kind: 'slider', min: 1, max: 10000, step: 1 },
      exposedAsPort: false,  // Config-only, not wirable
    },
  },
  outputs: {
    elements: { label: 'Elements', type: signalTypeField('shape', 'default') },
    index: { label: 'Index', type: signalTypeField('int', 'default') },
    t: { label: 'T (0-1)', type: signalTypeField('float', 'default') },
    active: { label: 'Active', type: signalTypeField('bool', 'default') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const count = (config?.count as number) ?? 100;
    const elementInput = inputsById.element;

    // Create instance (layout is now handled via field kernels, not instance metadata)
    const instanceId = ctx.b.createInstance(DOMAIN_CIRCLE, count);

    // Create field expressions
    // 1. Elements field - broadcasts the input signal across the array
    let elementsField;
    if (elementInput && elementInput.k === 'sig') {
      // Broadcast the signal to a field
      elementsField = ctx.b.Broadcast(elementInput.id, signalTypeField('shape', 'default'));
    } else {
      // No input - use array field (identity)
      elementsField = ctx.b.fieldArray(instanceId, signalTypeField('shape', 'default'));
    }

    // 2. Intrinsic fields (index, t, active)
    const indexField = ctx.b.fieldIntrinsic(instanceId, 'index', signalTypeField('int', 'default'));
    const tField = ctx.b.fieldIntrinsic(instanceId, 'normalizedIndex', signalTypeField('float', 'default'));
    // For static arrays, active is always true - we can use a constant broadcast
    const activeSignal = ctx.b.sigConst(true, signalType('bool'));
    const activeField = ctx.b.Broadcast(activeSignal, signalTypeField('bool', 'default'));

    return {
      outputsById: {
        elements: { k: 'field', id: elementsField, slot: ctx.b.allocSlot() },
        index: { k: 'field', id: indexField, slot: ctx.b.allocSlot() },
        t: { k: 'field', id: tField, slot: ctx.b.allocSlot() },
        active: { k: 'field', id: activeField, slot: ctx.b.allocSlot() },
      },
      // Set instance context for downstream blocks
      instanceContext: instanceId,
    };
  },
});
