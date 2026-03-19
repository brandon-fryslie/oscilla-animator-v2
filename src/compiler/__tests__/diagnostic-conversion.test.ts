import { describe, expect, it } from 'vitest';
import { convertCompileErrorToDiagnostic } from '../diagnosticConversion';

describe('convertCompileErrorToDiagnostic', () => {
  it('preserves port-targeted AxisInvalid errors', () => {
    const diagnostic = convertCompileErrorToDiagnostic(
      {
        code: 'AxisInvalid',
        message: 'Expected instantiated cardinality, got var',
        where: {
          blockId: 'osc1',
          port: 'out',
        },
      },
      7,
      'compile-7',
    );

    expect(diagnostic.code).toBe('E_AXIS_INVALID');
    expect(diagnostic.primaryTarget).toEqual({
      kind: 'port',
      blockId: 'osc1',
      portId: 'out',
    });
  });
});
