import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAllBlocks } from '../../blocks/all';
import { RootStore } from '../../stores/RootStore';
import { createLiveRecompileController } from '../LiveRecompile';

registerAllBlocks();

describe('LiveRecompile', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules a recompile on value edits', async () => {
    vi.useFakeTimers();
    const store = new RootStore();
    const controller = createLiveRecompileController(5);
    const onRecompile = vi.fn<() => Promise<void>>(async () => {});
    const onError = vi.fn<(error: unknown) => void>();

    const ellipseId = store.patch.addBlock('Ellipse');
    controller.setup(store, onRecompile, onError);

    store.patch.updateBlockParams(ellipseId, { rx: 0.15 });
    await Promise.resolve();

    vi.advanceTimersByTime(5);
    await Promise.resolve();

    expect(onRecompile).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    controller.cleanup();
    store.dispose();
  });
});
