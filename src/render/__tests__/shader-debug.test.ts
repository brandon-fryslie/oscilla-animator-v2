import { describe, expect, it, vi } from 'vitest';
import { dumpShaderWithLineNumbers, formatWgslWithLineNumbers, type ShaderDebugLogger } from '../shader-debug';

describe('shader-debug utilities', () => {
  it('formats WGSL with stable 1-based line numbers', () => {
    const formatted = formatWgslWithLineNumbers('@compute\nfn main() {}');
    expect(formatted).toBe('   1 | @compute\n   2 | fn main() {}');
  });

  it('logs numbered WGSL only when enabled', () => {
    const logger: ShaderDebugLogger = {
      groupCollapsed: vi.fn(),
      info: vi.fn(),
      groupEnd: vi.fn(),
    };
    const wgsl = '@compute\nfn compute_main() {}';

    dumpShaderWithLineNumbers('simulation', wgsl, false, logger);
    expect(logger.groupCollapsed).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.groupEnd).not.toHaveBeenCalled();

    dumpShaderWithLineNumbers('simulation', wgsl, true, logger);
    expect(logger.groupCollapsed).toHaveBeenCalledTimes(1);
    expect(logger.groupCollapsed).toHaveBeenCalledWith('[runtimeConsole] Generated WGSL: simulation');
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('   1 | @compute\n   2 | fn compute_main() {}');
    expect(logger.groupEnd).toHaveBeenCalledTimes(1);
  });
});
