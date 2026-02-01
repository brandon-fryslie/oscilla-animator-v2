/**
 * Arithmetic Kernel Enforcement Test
 *
 * Ensures that no block lower() functions emit kernel names for pure arithmetic operations.
 * All arithmetic should use opcodes (ctx.b.opcode(...)) instead of named kernels (ctx.b.kernel(...)).
 *
 * This test prevents regression of the bug where math blocks emitted dead kernel names
 * like 'fieldAdd', 'fieldSubtract', etc. that no longer exist in FieldKernels.ts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';

describe('Block Lowering - No Arithmetic Kernel Names', () => {
  // Denylist of arithmetic kernel names that should NEVER appear in block lower() functions
  const DENIED_KERNEL_NAMES = [
    'fieldAdd',
    'fieldSubtract',
    'fieldMultiply',
    'fieldDivide',
    'fieldModulo',
    'fieldSin',
    'fieldCos',
    'fieldTan',
    'fieldAbs',
    'fieldNeg',
    'fieldFloor',
    'fieldCeil',
    'fieldRound',
    'fieldFract',
    'fieldSqrt',
    'fieldExp',
    'fieldLog',
    'fieldSign',
    'fieldWrap01',
    'fieldClamp',
    'fieldLerp',
    'fieldPow',
    'fieldMin',
    'fieldMax',
    'simplexNoise1D',
    'select',
    // Decomposed geometry kernels (now use opcode sequences)
    'polygonVertex',
    'starVertex',
    // Decomposed layout kernels (now use opcode sequences)
    'circleLayoutUV',
    'lineLayoutUV',
    'gridLayoutUV',
  ];

  it('block files do not emit denied arithmetic kernel names (regex)', () => {
    const blockFiles = [
      'math-blocks.ts',
      'field-operations-blocks.ts',
      'math-utility-blocks.ts',
      'signal-blocks.ts',
      'path-blocks.ts',
      'instance-blocks.ts',
    ];

    const violations: string[] = [];

    for (const file of blockFiles) {
      const filePath = join(__dirname, '..', file);
      let content: string;
      try {
        content = readFileSync(filePath, 'utf8');
      } catch {
        // File doesn't exist, skip
        continue;
      }

      for (const kernelName of DENIED_KERNEL_NAMES) {
        // Task 3.1: Loosen regex to catch extra args after kernel name
        const pattern = new RegExp(`ctx\\.b\\.kernel\\s*\\(\\s*['"\`]${kernelName}['"\`]`, 'g');
        if (pattern.test(content)) {
          violations.push(`${file}: Found ctx.b.kernel('${kernelName}')`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Arithmetic kernel names found in block files (should use opcodes instead):\n${violations.join('\n')}`
      );
    }
  });

  it('compiled arithmetic blocks only use opcodes, not kernel names', () => {
    // Task 3.2: Create a minimal compilable patch with Add block and verify
    // that the lowered IR only uses 'opcode' kernel functions, not 'kernel' names

    const patch = buildPatch((b) => {
      // Need TimeRoot for compilation to succeed
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);
      b.setPortDefault(time, 'periodBMs', 2000);

      // Create an Add block (represents all binary math blocks)
      const add = b.addBlock('Add');

      // Wire phase to both inputs (signal+signal → signal)
      b.wire(time, 'phaseA', add, 'a');
      b.wire(time, 'phaseB', add, 'b');
    });

    const result = compile(patch);

    if (result.kind === 'error') {
      throw new Error(`Compilation failed: ${JSON.stringify(result.errors, null, 2)}`);
    }

    // Inspect the compiled IR and verify all kernel expressions use opcodes
    const { program } = result;

    // Check all value expressions in the unified ValueExprTable
    for (const expr of program.valueExprs.nodes) {
      // Filter to kernel expressions (kind === 'kernel')
      if (expr.kind === 'kernel') {
        // Only map, zip, and zipSig kernel kinds have an 'fn' field
        // (broadcast, reduce, pathDerivative do not)
        if (
          expr.kernelKind === 'map' ||
          expr.kernelKind === 'zip' ||
          expr.kernelKind === 'zipSig'
        ) {
          // Kernel expressions with fn have a 'fn' field that can be either { kind: 'opcode', opcode: ... }
          // or { kind: 'kernel', name: ... }
          if (expr.fn.kind === 'kernel') {
            // Check if this is a denied arithmetic kernel
            const kernelName = expr.fn.name;
            if (DENIED_KERNEL_NAMES.includes(kernelName)) {
              throw new Error(
                `Found arithmetic kernel '${kernelName}' in compiled IR (should use opcode instead)`
              );
            }
          }
        }
      }
    }

    // If we got here, no arithmetic kernel names were found (success)
    expect(result.kind).toBe('ok');
  });

  it('denylist is comprehensive (documents all removed arithmetic kernels)', () => {
    // This test exists to ensure the denylist is maintained
    expect(DENIED_KERNEL_NAMES.length).toBeGreaterThan(10);
    expect(DENIED_KERNEL_NAMES).toContain('fieldAdd');
    expect(DENIED_KERNEL_NAMES).toContain('fieldSubtract');
    expect(DENIED_KERNEL_NAMES).toContain('fieldMultiply');
    expect(DENIED_KERNEL_NAMES).toContain('fieldDivide');
    expect(DENIED_KERNEL_NAMES).toContain('fieldModulo');
    expect(DENIED_KERNEL_NAMES).toContain('fieldSin');
    expect(DENIED_KERNEL_NAMES).toContain('fieldCos');
    expect(DENIED_KERNEL_NAMES).toContain('simplexNoise1D');
    expect(DENIED_KERNEL_NAMES).toContain('select');
    expect(DENIED_KERNEL_NAMES).toContain('polygonVertex');
    expect(DENIED_KERNEL_NAMES).toContain('starVertex');
    expect(DENIED_KERNEL_NAMES).toContain('circleLayoutUV');
    expect(DENIED_KERNEL_NAMES).toContain('lineLayoutUV');
    expect(DENIED_KERNEL_NAMES).toContain('gridLayoutUV');
  });
});
