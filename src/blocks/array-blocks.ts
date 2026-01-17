/**
 * Array Blocks
 *
 * Array blocks transform Signal<T> → Field<T> (Stage 2 of three-stage architecture).
 * They create instances and provide cardinality transform.
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField } from '../core/canonical-types';
import { DOMAIN_CIRCLE } from '../core/domain-registry';
import { defaultSourceConstant, defaultSourceNone } from '../types';

// =============================================================================
// Array Block
// =============================================================================

/**
 * Array - Creates multiple copies of an element (Signal<T> → Field<T>)
 *
 * Stage 2: Cardinality transform block.
 * Takes a Signal<T> and produces Field<T> with N elements.
 *
 * Example:
 * CirclePrimitive (Signal<float>) → Array → Field<float> (100 copies)
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
  inputs: [
    { id: 'element', label: 'Element', type: signalType('???'), optional: true, defaultSource: defaultSourceNone() },
    { id: 'count', label: 'Count', type: signalType('int'), defaultValue: 100, defaultSource: defaultSourceConstant(100) },
  ],
  outputs: [
    { id: 'elements', label: 'Elements', type: signalTypeField('???', 'default') },
    { id: 'index', label: 'Index', type: signalTypeField('int', 'default') },
    { id: 't', label: 'T (0-1)', type: signalTypeField('float', 'default') },
    { id: 'active', label: 'Active', type: signalTypeField('bool', 'default') },
  ],
  params: {
    count: 100,
  },
  lower: ({ ctx, inputsById, config }) => {
    const count = (config?.count as number) ?? 100;
    const elementInput = inputsById.element;

    // Create instance with unordered layout (layout will be provided by layout blocks)
    const instanceId = ctx.b.createInstance(DOMAIN_CIRCLE, count, { kind: 'unordered' });

    // Create field expressions
    // 1. Elements field - broadcasts the input signal across the array
    let elementsField;
    if (elementInput && elementInput.k === 'sig') {
      // Broadcast the signal to a field
      elementsField = ctx.b.fieldBroadcast(elementInput.id, signalTypeField('float', 'default'));
    } else {
      // No input - use array field (identity)
      elementsField = ctx.b.fieldArray(instanceId, signalTypeField('float', 'default'));
    }

    // 2. Intrinsic fields (index, t, active)
    const indexField = ctx.b.fieldIntrinsic(instanceId, 'index', signalTypeField('int', 'default'));
    const tField = ctx.b.fieldIntrinsic(instanceId, 'normalizedIndex', signalTypeField('float', 'default'));
    // For static arrays, active is always true - we can use a constant broadcast
    const activeSignal = ctx.b.sigConst(true, signalType('bool'));
    const activeField = ctx.b.fieldBroadcast(activeSignal, signalTypeField('bool', 'default'));

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
