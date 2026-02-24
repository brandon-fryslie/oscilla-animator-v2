import type { PayloadType } from '../core/canonical-types';
import { FLOAT } from '../core/canonical-types';

export interface ExpressionConstant {
  readonly name: string;
  readonly chipLabel: string;
  readonly value: number;
  readonly type: PayloadType;
  readonly description: string;
}

// [LAW:one-source-of-truth] Canonical catalog for Expression DSL named constants
// shared by typecheck, compile, suggestions, and editor chip rendering.
const EXPRESSION_CONSTANTS: readonly ExpressionConstant[] = [
  { name: 'pi', chipLabel: 'π', value: Math.PI, type: FLOAT, description: 'Circle ratio π' },
  { name: 'tau', chipLabel: 'τ', value: Math.PI * 2, type: FLOAT, description: 'Full turn constant (2π)' },
  { name: 'e', chipLabel: 'e', value: Math.E, type: FLOAT, description: "Euler's number" },
  { name: 'phi', chipLabel: 'φ', value: (1 + Math.sqrt(5)) / 2, type: FLOAT, description: 'Golden ratio' },
  { name: 'deg2rad', chipLabel: 'deg2rad', value: Math.PI / 180, type: FLOAT, description: 'Degrees to radians scale factor' },
  { name: 'rad2deg', chipLabel: 'rad2deg', value: 180 / Math.PI, type: FLOAT, description: 'Radians to degrees scale factor' },
] as const;

const CONSTANTS_BY_NAME = new Map(EXPRESSION_CONSTANTS.map((constant) => [constant.name, constant] as const));

export function getExpressionConstants(): readonly ExpressionConstant[] {
  return EXPRESSION_CONSTANTS;
}

export function resolveExpressionConstant(name: string): ExpressionConstant | undefined {
  return CONSTANTS_BY_NAME.get(name);
}

