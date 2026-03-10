import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OpCode } from '../ir/types';

describe('emitPureFnF32 opcode coverage', () => {
  it('handles every canonical OpCode in lowering switch', () => {
    const sourcePath = join(process.cwd(), 'src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts');
    const source = readFileSync(sourcePath, 'utf8');

    const missingKeys = Object.keys(OpCode).filter((enumKey) => {
      return !source.includes(`case OpCode.${enumKey}:`);
    });

    expect(missingKeys).toEqual([]);
  });
});
