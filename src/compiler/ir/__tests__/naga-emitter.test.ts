import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalScalar, FLOAT } from '../../../core/canonical-types';
import { OpCode } from '../types';
import {
  NagaBuilder,
  NagaValidationError,
  WgslNagaCompiler,
  validateNagaBuilder,
} from '../naga-emitter';

describe('Naga one-true-emitter', () => {
  it('AC1: appends exactly one arena expression for add()', () => {
    const builder = new NagaBuilder();
    const left = builder.literalFloat(1, { visualBlockId: 'left' });
    const right = builder.literalFloat(2, { visualBlockId: 'right' });
    const before = builder.expressions.length();
    builder.add(left, right, { visualBlockId: 'add_node' });
    const after = builder.expressions.length();
    expect(after).toBe(before + 1);
  });

  it('AC2: validator trap resolves expression handle back to visualBlockId', () => {
    const builder = new NagaBuilder();
    const mat4 = builder.literalMatrix4({ visualBlockId: 'matrix_node' });
    const scalar = builder.literalFloat(1, { visualBlockId: 'scalar_node' });
    const add = builder.add(mat4, scalar, { visualBlockId: 'node_accumulator_7' });

    let thrown: unknown;
    try {
      validateNagaBuilder(builder);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(NagaValidationError);
    const validationError = thrown as NagaValidationError;
    expect(validationError.handle).toBe(add.nagaHandle);
    expect(validationError.visualBlockId).toBe('node_accumulator_7');
    expect(validationError.message).toContain('Expression [' + String(add.nagaHandle) + ']');
  });

  it('compiles opcode instructions through the constrained builder API', () => {
    const compiler = new WgslNagaCompiler();
    compiler.compileTopologicalGraph([
      {
        op: 'constFloat',
        outputId: 'a',
        visualBlockId: 'const_a',
        value: 1,
      },
      {
        op: 'constFloat',
        outputId: 'b',
        visualBlockId: 'const_b',
        value: 2,
      },
      {
        op: OpCode.Add,
        outputId: 'sum',
        visualBlockId: 'sum_block',
        inputs: ['a', 'b'],
      },
      {
        op: 'cast',
        outputId: 'sum_cast',
        visualBlockId: 'cast_block',
        input: 'sum',
        targetType: canonicalScalar(FLOAT),
      },
    ]);

    const builder = compiler.getBuilder();
    expect(builder.expressions.length()).toBeGreaterThan(0);
    const lastHandle = builder.expressions.length() - 1;
    expect(builder.getExpressionContext(lastHandle)?.visualBlockId).toBe('cast_block');
  });

  it('AC3: string exclusion zone forbids interpolation in emitter implementation', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const emitterDir = path.resolve(here, '../naga-emitter');
    const files = ['NagaBuilder.ts', 'NagaValidator.ts', 'WgslNagaCompiler.ts'];
    for (const name of files) {
      const content = fs.readFileSync(path.join(emitterDir, name), 'utf8');
      expect(content.includes('${')).toBe(false);
    }
  });
});
