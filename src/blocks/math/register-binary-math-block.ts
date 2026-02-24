import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';
import { canonicalType, cardinalityVar, FLOAT, payloadStride } from '../../core/canonical-types';
import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from '../registry';

type BinaryMathUnitBehavior = 'preserve' | 'requireUnitless';

interface BinaryMathBlockSpec {
  readonly type: string;
  readonly label: string;
  readonly description: string;
  readonly opcode: OpCode;
  readonly cardinalityVarName: string;
  readonly unitBehavior: BinaryMathUnitBehavior;
}

export function registerBinaryMathBlock(spec: BinaryMathBlockSpec): void {
  // [LAW:one-type-per-behavior] Binary numeric math primitives share one lowering
  // behavior; per-block variability is declarative config only.
  const card = cardinalityVar(cardinalityVarId(spec.cardinalityVarName), {
    relation: 'promoteToMany',
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
        a: STANDARD_NUMERIC_PAYLOADS,
        b: STANDARD_NUMERIC_PAYLOADS,
        out: STANDARD_NUMERIC_PAYLOADS,
      },
      semantics: 'componentwise',
      unitBehavior: spec.unitBehavior,
    },
    inputs: {
      a: { label: 'A', type: canonicalType(FLOAT, undefined, { cardinality: card }) },
      b: { label: 'B', type: canonicalType(FLOAT, undefined, { cardinality: card }) },
    },
    outputs: {
      out: { label: 'Output', type: canonicalType(FLOAT, undefined, { cardinality: card }) },
    },
    lower: ({ ctx, inputsById }) => {
      const a = inputsById.a;
      const b = inputsById.b;
      if (!a || !b) throw new Error(`${spec.type} requires both inputs`);

      const outType = ctx.outTypes[0];
      const resultId = ctx.b.zipAuto([a.id, b.id], ctx.b.opcode(spec.opcode), outType);
      return {
        outputsById: {
          out: { id: resultId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [{ portId: 'out', type: outType }],
        },
      };
    },
  });
}
