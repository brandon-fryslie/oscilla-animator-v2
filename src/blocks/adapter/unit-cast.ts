/**
 * UnitCast Adapter — Identity transform with unit re-interpretation
 *
 * Converts `(any_payload, none) → (any_payload, any_unit)` with no value transformation.
 * Used when unit-polymorphic blocks (e.g., Add with unitBehavior:'preserve') receive
 * unitless sources that need to be re-typed to match a target unit, without unwanted
 * value transformations (e.g., Wrap01 from ScalarToPhase01).
 *
 * Priority 1 (fallback): specific adapters like ScalarToPhase01 (priority 0) take
 * precedence when they match. UnitCast only matches when no specific adapter does.
 * This means ScalarToPhase01 still handles scalar→phase01(wrap01) conversions,
 * but none→turns (without contract) gets UnitCast's identity transform.
 *
 * // [LAW:one-type-per-behavior] Single adapter type handles all identity unit re-typing.
 */

import { registerBlock } from '../registry';
import { payloadStride, unitNone } from '../../core/canonical-types';
import { inferType, payloadVar, unitVar } from '../../core/inference-types';

registerBlock({
  type: 'Adapter_UnitCast',
  label: 'Unit Cast',
  category: 'adapter',
  description: 'Identity transform with unit type change (unitless → any unit)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    // [LAW:dataflow-not-control-flow] Both 'any' payloads trigger the existing
    // payload-equality check in findAdapter — no special-case needed.
    from: { payload: 'any', unit: { kind: 'none' }, extent: 'any' },
    to: { payload: 'any', unit: 'any', extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Cast unitless value to any unit (identity transform)',
    purity: 'pure',
    stability: 'stable',
    priority: 1, // Fallback — specific adapters (ScalarToPhase01, ScalarToDeg) win at priority 0
  },
  inputs: {
    in: { label: 'In', type: inferType(payloadVar('unit_cast_payload'), unitNone()) },
  },
  outputs: {
    out: { label: 'Out', type: inferType(payloadVar('unit_cast_payload'), unitVar('unit_cast_unit')) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('UnitCast input required');

    const outType = ctx.outTypes[0];
    // Pure identity — no value transformation, just re-type
    return {
      outputsById: {
        out: { id: input.id, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [{ portId: 'out', type: outType }],
      },
    };
  },
});
