/**
 * FloatRangeField Block
 *
 * Generate a many-cardinality float field with configurable min/max/step.
 * The output cardinality inherits instance context from surrounding topology.
 */

import { registerBlock, requireConfig } from '../registry';
import { canonicalType, payloadStride, floatConst, FLOAT } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';

// [LAW:one-source-of-truth] Field output cardinality behavior is declared on CT/ICT.
const FLOAT_RANGE_FIELD_OUT_CARD = cardinalityVar(cardinalityVarId('float_range_field_out'), {
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'FloatRangeField',
    label: 'Float Range (Field)',
    category: 'field',
    description: 'Generate a field float sequence using min/max/step over instance index',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      min: {
        label: 'Min',
        type: canonicalType(FLOAT),
        defaultValue: 0,
        exposedAsPort: false,
        uiHint: { kind: 'slider', min: -10, max: 10, step: 0.01 },
      },
      max: {
        label: 'Max',
        type: canonicalType(FLOAT),
        defaultValue: 1,
        exposedAsPort: false,
        uiHint: { kind: 'slider', min: -10, max: 10, step: 0.01 },
      },
      step: {
        label: 'Step',
        type: canonicalType(FLOAT),
        defaultValue: 0.1,
        exposedAsPort: false,
        uiHint: { kind: 'slider', min: 0.001, max: 2, step: 0.001 },
      },
    },
    outputs: {
      out: {
        label: 'Out',
        type: inferType(FLOAT, { kind: 'none' }, { cardinality: FLOAT_RANGE_FIELD_OUT_CARD }),
      },
    },
    lower: ({ ctx, config }) => {
      const min = requireConfig<number>(config, 'min', 'number');
      const max = requireConfig<number>(config, 'max', 'number');
      const step = requireConfig<number>(config, 'step', 'number');
      if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step)) {
        throw new Error('FloatRangeField min/max/step must be finite numbers');
      }
      if (step <= 0) {
        throw new Error(`FloatRangeField step must be > 0, got ${step}`);
      }
  
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...canonicalType(FLOAT, outType.unit), extent: outType.extent };
  
      const t = ctx.b.intrinsic('normalizedIndex', floatFieldType);
  
      const subFn = ctx.b.opcode(OpCode.Sub);
      const addFn = ctx.b.opcode(OpCode.Add);
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const divFn = ctx.b.opcode(OpCode.Div);
      const floorFn = ctx.b.opcode(OpCode.Floor);
  
      const minConst = ctx.b.constant(floatConst(min), canonicalType(FLOAT, outType.unit));
      const maxConst = ctx.b.constant(floatConst(max), canonicalType(FLOAT, outType.unit));
      const stepConst = ctx.b.constant(floatConst(step), canonicalType(FLOAT, outType.unit));
  
      const minField = ctx.b.broadcast(minConst, floatFieldType);
      const maxField = ctx.b.broadcast(maxConst, floatFieldType);
      const stepField = ctx.b.broadcast(stepConst, floatFieldType);
  
      const range = ctx.b.zipAuto([maxField, minField], subFn, floatFieldType);
      const scaled = ctx.b.zipAuto([t, range], mulFn, floatFieldType);
      const raw = ctx.b.zipAuto([minField, scaled], addFn, outType);
  
      // Quantize to requested step in [min, max] space.
      const offset = ctx.b.zipAuto([raw, minField], subFn, outType);
      const stepUnits = ctx.b.zipAuto([offset, stepField], divFn, outType);
      const snappedUnits = ctx.b.mapAuto(stepUnits, floorFn, outType);
      const snappedOffset = ctx.b.zipAuto([snappedUnits, stepField], mulFn, outType);
      const snapped = ctx.b.zipAuto([minField, snappedOffset], addFn, outType);
  
      return {
        outputsById: {
          out: { id: snapped, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'out', type: outType },
          ],
        },
        instanceContext: ctx.inferredInstance,
      };
    },
  });
}
