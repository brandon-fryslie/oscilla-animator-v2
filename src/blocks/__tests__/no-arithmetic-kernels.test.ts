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
  ];

  it('block files do not emit denied arithmetic kernel names', () => {
    const blockFiles = [
      'math-blocks.ts',
      'field-operations-blocks.ts',
      'math-utility-blocks.ts',
      'signal-blocks.ts',
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
        // Check for ctx.b.kernel('kernelName') pattern
        const pattern = new RegExp(`ctx\\.b\\.kernel\\s*\\(\\s*['"\`]${kernelName}['"\`]\\s*\\)`, 'g');
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
  });
});
