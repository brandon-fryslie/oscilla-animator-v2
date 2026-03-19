import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAllBlocks } from '../../blocks/all';
import { RootStore } from '../../stores/RootStore';
import { createLiveRecompileController } from '../LiveRecompile';

registerAllBlocks();

describe('LiveRecompile', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules a real recompile for value-only edits when no fast patch handler is installed', async () => {
    vi.useFakeTimers();
    const store = new RootStore();
    const controller = createLiveRecompileController(5);
    const onRecompile = vi.fn<() => Promise<void>>(async () => {});
    const onError = vi.fn<(error: unknown) => void>();

    const ellipseId = store.patch.addBlock('Ellipse');
    store.patch.consumePendingChanges();
    controller.setup(store, onRecompile, undefined, onError);

    store.patch.updateBlockParams(ellipseId, { rx: 0.15 });
    await Promise.resolve();

    vi.advanceTimersByTime(5);
    await Promise.resolve();

    expect(onRecompile).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    controller.cleanup();
    store.dispose();
  });

  it('skips recompilation when a fast patch handler claims the value-only edit', async () => {
    vi.useFakeTimers();
    const store = new RootStore();
    const controller = createLiveRecompileController(5);
    const onRecompile = vi.fn<() => Promise<void>>(async () => {});
    const onValuePatch = vi.fn<(changes: ReadonlyMap<string, unknown>) => boolean>(() => true);
    const onError = vi.fn<(error: unknown) => void>();

    const ellipseId = store.patch.addBlock('Ellipse');
    store.patch.consumePendingChanges();
    controller.setup(store, onRecompile, onValuePatch, onError);

    store.patch.updateBlockParams(ellipseId, { rx: 0.15 });
    await Promise.resolve();

    vi.advanceTimersByTime(5);
    await Promise.resolve();

    expect(onValuePatch).toHaveBeenCalledTimes(1);
    expect(onRecompile).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    controller.cleanup();
    store.dispose();
  });
});
