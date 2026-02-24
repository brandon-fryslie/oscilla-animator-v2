import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';
import { canonicalType, cardinalityVar, FLOAT, payloadStride } from '../../core/canonical-types';
import { mapAuto } from '../lower-utils';
import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from '../registry';

type UnaryMathUnitBehavior = 'preserve' | 'requireUnitless';

interface UnaryMathBlockSpec {
  readonly type: string;
  readonly label: string;
  readonly description: string;
  readonly opcode: OpCode;
  readonly cardinalityVarName: string;
  readonly unitBehavior: UnaryMathUnitBehavior;
}

export function registerUnaryMathBlock(spec: UnaryMathBlockSpec): void {
  // [LAW:one-type-per-behavior] Sin/Cos share one canonical unary numeric lowering
  // behavior; block-specific variability is declarative config only.
  const card = cardinalityVar(cardinalityVarId(spec.cardinalityVarName), {
    relation: 'uniform',
    acceptance: 'oneOrMany',
    instanceBinding: 'inherit',
  });

  registerBlock({
    type: spec.type,
    label: spec.label,
    category: 'math',
    description: spec.description,
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    payload: {
      allowedPayloads: {
        input: STANDARD_NUMERIC_PAYLOADS,
        result: STANDARD_NUMERIC_PAYLOADS,
      },
      semantics: 'componentwise',
      unitBehavior: spec.unitBehavior,
    },
    inputs: {
      input: { label: 'Input', type: canonicalType(FLOAT, undefined, { cardinality: card }) },
    },
    outputs: {
      result: { label: 'Result', type: canonicalType(FLOAT, undefined, { cardinality: card }) },
    },
    lower: ({ ctx, inputsById }) => {
      const input = inputsById.input;
      if (!input) throw new Error(`${spec.type} input required`);

      const outType = ctx.outTypes[0];
      const result = mapAuto(input.id, ctx.b.opcode(spec.opcode), outType, ctx.b);
      return {
        outputsById: {
          result: { id: result, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [{ portId: 'result', type: outType }],
        },
      };
    },
  });
}
