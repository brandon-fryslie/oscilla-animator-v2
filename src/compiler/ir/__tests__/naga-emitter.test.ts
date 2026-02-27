import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalScalar, FLOAT, INT } from '../../../core/canonical-types';
import { OpCode } from '../types';
import {
  NagaBinaryOp,
  NagaBuilder,
  NagaMathFunction,
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
    const invalidHandle = builder.expressions.append({
      type: 'Binary',
      op: NagaBinaryOp.Add,
      left: mat4.nagaHandle,
      right: scalar.nagaHandle,
    });
    builder.sourceMap.set(invalidHandle, { visualBlockId: 'node_accumulator_7' });
    const matrixType = builder.getExpressionType(mat4.nagaHandle);
    expect(matrixType).toBeDefined();
    (
      builder as unknown as {
        expressionTypeByHandle: Map<number, number>;
      }
    ).expressionTypeByHandle.set(invalidHandle, matrixType as number);

    let thrown: unknown;
    try {
      validateNagaBuilder(builder);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(NagaValidationError);
    const validationError = thrown as NagaValidationError;
    expect(validationError.handle).toBe(invalidHandle);
    expect(validationError.visualBlockId).toBe('node_accumulator_7');
    expect(validationError.message).toContain('Expression [' + String(invalidHandle) + ']');
  });

  it('enforces select and lerp operand compatibility in builder', () => {
    const builder = new NagaBuilder();
    const boolCond = builder.literalBool(true, { visualBlockId: 'cond_bool' });
    const floatCond = builder.literalFloat(1, { visualBlockId: 'cond_float' });
    const a = builder.literalFloat(1, { visualBlockId: 'a' });
    const b = builder.literalFloat(2, { visualBlockId: 'b' });
    const t = builder.literalFloat(0.5, { visualBlockId: 't' });
    const i = builder.literalInt(7, { visualBlockId: 'i' });

    expect(() =>
      builder.select(boolCond, a, b, { visualBlockId: 'select_ok' }),
    ).not.toThrow();
    expect(() =>
      builder.select(floatCond, a, b, { visualBlockId: 'select_bad_cond' }),
    ).toThrow('NagaBuilder.select: cond must be bool scalar or bool vector.');
    expect(() =>
      builder.select(boolCond, a, i, { visualBlockId: 'select_bad_branches' }),
    ).toThrow('NagaBuilder.select: type mismatch between trueVal and falseVal.');

    expect(() => builder.lerp(a, b, t, { visualBlockId: 'lerp_ok' })).not.toThrow();
    expect(() => builder.lerp(a, i, t, { visualBlockId: 'lerp_bad_ab' })).toThrow(
      'NagaBuilder.lerp: type mismatch between a and b.',
    );
  });

  it('enforces consistent state slot typing on read', () => {
    const builder = new NagaBuilder();
    const floatType = canonicalScalar(FLOAT);
    const intType = canonicalScalar(INT);
    expect(() =>
      builder.readState('accum', floatType, { visualBlockId: 'read_float' }),
    ).not.toThrow();
    expect(() =>
      builder.readState('accum', intType, { visualBlockId: 'read_int' }),
    ).toThrow('NagaBuilder.readState: type mismatch for state key accum');
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

  it('enforces lexical scope boundaries across recursive blocks', () => {
    const compiler = new WgslNagaCompiler();

    expect(() =>
      compiler.compileRootGraph([
        {
          op: 'constFloat',
          outputId: 'outer',
          visualBlockId: 'const_outer',
          value: 1,
        },
        {
          op: 'loop',
          visualBlockId: 'loop_1',
          body: [
            {
              op: 'constFloat',
              outputId: 'inner',
              visualBlockId: 'const_inner',
              value: 2,
            },
          ],
        },
        {
          op: OpCode.Add,
          outputId: 'sum',
          visualBlockId: 'sum_after_loop',
          inputs: ['outer', 'inner'],
        },
      ]),
    ).toThrow('variable scope leak');
  });

  it('injects dynamic-read bounds clamping before buffer read', () => {
    const compiler = new WgslNagaCompiler();
    compiler.compileRootGraph([
      {
        op: 'constInt',
        outputId: 'idx',
        visualBlockId: 'idx_block',
        value: 8,
      },
      {
        op: 'bufferReadDynamic',
        outputId: 'read_out',
        visualBlockId: 'read_block',
        bufferKey: 'positions',
        indexId: 'idx',
        targetType: canonicalScalar(FLOAT),
      },
    ]);

    const exprKinds = compiler.getBuilder().expressions.toArray().map((expr) => expr.type);
    expect(exprKinds.includes('ArrayLength')).toBe(true);
    expect(
      compiler.getBuilder().expressions.toArray().some(
        (expr) => expr.type === 'Binary' && expr.op === NagaBinaryOp.Subtract,
      ),
    ).toBe(true);
    expect(
      compiler.getBuilder().expressions.toArray().some(
        (expr) => expr.type === 'Math' && expr.fun === NagaMathFunction.Min,
      ),
    ).toBe(true);
    expect(exprKinds.includes('Access')).toBe(true);
    expect(exprKinds.includes('Load')).toBe(true);
  });

  it('emits recursive loop and if statements without strings', () => {
    const compiler = new WgslNagaCompiler();
    compiler.compileRootGraph([
      {
        op: 'constBool',
        outputId: 'cond',
        visualBlockId: 'cond_block',
        value: true,
      },
      {
        op: 'loop',
        visualBlockId: 'loop_block',
        body: [
          {
            op: 'if',
            visualBlockId: 'if_block',
            condition: 'cond',
            acceptBody: [
              {
                op: 'continue',
                visualBlockId: 'continue_block',
              },
            ],
            rejectBody: [
              {
                op: 'break',
                visualBlockId: 'break_block',
              },
            ],
          },
        ],
      },
    ]);

    const builder = compiler.getBuilder();
    const root = builder.getRootBlock();
    expect(root).not.toBeNull();
    const rootStatements = root as readonly number[];
    expect(rootStatements.length).toBe(1);
    const loopStmt = builder.statements.get(rootStatements[0]);
    expect(loopStmt.type).toBe('Loop');
  });

  it('rejects atomicAdd when value operand is non-integer', () => {
    const compiler = new WgslNagaCompiler();
    expect(() =>
      compiler.compileRootGraph([
        {
          op: 'constInt',
          outputId: 'idx',
          visualBlockId: 'idx_block',
          value: 0,
        },
        {
          op: 'constFloat',
          outputId: 'delta',
          visualBlockId: 'delta_block',
          value: 1.25,
        },
        {
          op: 'atomicAdd',
          outputId: 'old',
          visualBlockId: 'atomic_block',
          bufferKey: 'forces',
          indexId: 'idx',
          valueId: 'delta',
        },
      ]),
    ).toThrow('NagaBuilder.atomicAdd: value must be int scalar.');
  });

  it('reports statement-scoped validation errors for invalid if conditions', () => {
    const builder = new NagaBuilder();
    const cond = builder.literalFloat(1, { visualBlockId: 'cond_float' });
    const accept: readonly number[] = [];
    const reject: readonly number[] = [];
    builder.statements.append({
      type: 'If',
      condition: cond.nagaHandle,
      accept,
      reject,
    });

    let thrown: unknown;
    try {
      validateNagaBuilder(builder);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(NagaValidationError);
    const validationError = thrown as NagaValidationError;
    expect(validationError.message).toContain('Statement [');
    expect(validationError.message).toContain('boolean scalar');
  });

  it('AC3: string exclusion zone forbids interpolation in emitter implementation', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const emitterDir = path.resolve(here, '../naga-emitter');
    const files = ['NagaBuilder.ts', 'NagaValidator.ts', 'WgslNagaCompiler.ts', 'ScopeEnvironment.ts'];
    for (const name of files) {
      const content = fs.readFileSync(path.join(emitterDir, name), 'utf8');
      expect(content.includes('${')).toBe(false);
    }
  });
});
