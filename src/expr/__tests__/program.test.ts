import { describe, it, expect } from 'vitest';
import {
  extractExpressionProgram,
  lowerExpressionProgram,
  ExpressionProgramError,
} from '../program';

describe('expression program preprocessing', () => {
  it('extracts assignments and output from multiline program', () => {
    const parsed = extractExpressionProgram([
      '// heading',
      'a = points.t * 2',
      'b = a + 1',
      'sin(b)',
    ].join('\n'));

    expect(parsed.assignments).toHaveLength(2);
    expect(parsed.output).toBe('sin(b)');
    expect(parsed.warnings).toHaveLength(0);
  });

  it('emits warning when a variable is reassigned', () => {
    const parsed = extractExpressionProgram([
      'x = 1',
      'x = x + 1',
      'x',
    ].join('\n'));

    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0].code).toBe('W_EXPR_VAR_REASSIGNED');
    expect(parsed.warnings[0].line).toBe(2);
  });

  it('lowers assignments by inlining aliases into final expression', () => {
    const lowered = lowerExpressionProgram([
      'a = points.t * 2',
      'b = a + 1',
      'sin(b)',
    ].join('\n'));

    expect(lowered.expression).toContain('sin');
    expect(lowered.expression).toContain('points.t');
    expect(lowered.expression).not.toContain('a');
    expect(lowered.expression).not.toContain('b');
  });

  it('throws when non-final line is not an assignment', () => {
    expect(() => lowerExpressionProgram([
      'sin(x)',
      'x + 1',
    ].join('\n'))).toThrow(ExpressionProgramError);
  });
});
