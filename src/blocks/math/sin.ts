/**
 * Sin Block
 *
 * Per-element sine (works with both single-instance and per-instance fields).
 */

import { OpCode } from '../../compiler/ir/types';
import { registerUnaryMathBlock } from './register-unary-math-block';

export function register(): void {
  registerUnaryMathBlock({
    type: 'Sin',
    label: 'Sin',
    description: 'Per-element sine (works with both single-instance and per-instance fields)',
    opcode: OpCode.Sin,
    cardinalityVarName: 'sin_cardinality',
    unitBehavior: 'requireUnitless',
  });
}
