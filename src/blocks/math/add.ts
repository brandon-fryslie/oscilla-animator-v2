/**
 * Add Block
 *
 * Adds two numbers (single-instance or per-instance fields).
 */

import { OpCode } from '../../compiler/ir/types';
import { registerBinaryMathBlock } from './register-binary-math-block';

export function register(): void {
  // [LAW:one-type-per-behavior] Add/Subtract/Multiply/Divide share one canonical
  // binary numeric lowering shape; block-specific config lives at callsites.
  registerBinaryMathBlock({
    type: 'Add',
    label: 'Add',
    description: 'Adds two numbers (single-instance or per-instance fields)',
    opcode: OpCode.Add,
    cardinalityVarName: 'add_cardinality',
    unitBehavior: 'preserve',
  });
}
