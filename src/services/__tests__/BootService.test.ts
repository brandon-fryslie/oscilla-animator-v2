import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  bootMock: vi.fn(),
  compileIrMock: vi.fn(),
}));

vi.mock('../../compiler/naga-bridge', () => ({
  NagaService: {
    boot: hoisted.bootMock,
  },
}));

vi.mock('../../compiler/wasm/oscilla_naga_shim', () => ({
  compile_ir: hoisted.compileIrMock,
}));

import { BootService } from '../BootService';

describe('BootService', () => {
  beforeEach(() => {
    hoisted.bootMock.mockReset();
    hoisted.compileIrMock.mockReset();
    hoisted.compileIrMock.mockReturnValue({
      wgsl: '',
      is_valid: false,
      errors: [],
    });
  });

  it('transitions to ready after wasm boot and smoke check', async () => {
    hoisted.bootMock.mockImplementation(async (options?: { onStage?: (stage: string) => void }) => {
      options?.onStage?.('fetching');
      options?.onStage?.('compiling');
      options?.onStage?.('binding');
    });

    const service = new BootService();
    const states: string[] = [];
    service.subscribe((snapshot) => {
      states.push(snapshot.state);
    });

    const snapshot = await service.start();
    expect(snapshot.state).toBe('ready');
    expect(snapshot.error).toBeNull();
    expect(hoisted.bootMock).toHaveBeenCalledTimes(1);
    expect(hoisted.compileIrMock).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['initial', 'fetching', 'compiling', 'ready']);
  });

  it('enters error state when boot fails', async () => {
    hoisted.bootMock.mockRejectedValue(new Error('network down'));

    const service = new BootService();
    const snapshot = await service.start();

    expect(snapshot.state).toBe('error');
    expect(snapshot.error).toContain('network down');
    expect(hoisted.compileIrMock).not.toHaveBeenCalled();
  });

  it('does not retry boot after terminal error state', async () => {
    hoisted.bootMock.mockRejectedValue(new Error('network down'));
    const service = new BootService();

    const first = await service.start();
    const second = await service.start();

    expect(first.state).toBe('error');
    expect(second.state).toBe('error');
    expect(hoisted.bootMock).toHaveBeenCalledTimes(1);
  });

  it('enters error state when smoke result is malformed', async () => {
    hoisted.bootMock.mockResolvedValue(undefined);
    hoisted.compileIrMock.mockReturnValue(null);

    const service = new BootService();
    const snapshot = await service.start();

    expect(snapshot.state).toBe('error');
    expect(snapshot.error).toContain('WASM integrity check failed');
  });

  it('deduplicates concurrent start calls to one boot operation', async () => {
    let unblock: (() => void) | null = null;
    hoisted.bootMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          unblock = resolve;
        }),
    );

    const service = new BootService();
    const first = service.start();
    const second = service.start();
    if (!unblock) {
      throw new Error('test setup failed: unblock callback was not captured');
    }
    const release = unblock as () => void;
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(a.state).toBe('ready');
    expect(b.state).toBe('ready');
    expect(hoisted.bootMock).toHaveBeenCalledTimes(1);
  });
});
