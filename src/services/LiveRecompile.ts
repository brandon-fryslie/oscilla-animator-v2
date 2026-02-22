/**
 * Live Recompile Service
 *
 * Watches patch changes via MobX reactions and triggers debounced recompilation.
 * Integrates with CompileOrchestrator for the actual compilation.
 */

import { reaction } from 'mobx';
import type { RootStore } from '../stores';

const RECOMPILE_DEBOUNCE_MS = 16; // ~1 frame at 60fps for responsive parameter control

export interface LiveRecompileController {
  setup(
    store: RootStore,
    onRecompile: () => Promise<void>,
    onValuePatch?: (changes: ReadonlyMap<string, unknown>) => boolean,
  ): void;
  cleanup(): void;
}

export function createLiveRecompileController(
  debounceMs: number = RECOMPILE_DEBOUNCE_MS,
): LiveRecompileController {
  let recompileTimeout: ReturnType<typeof setTimeout> | null = null;
  let reactionDisposer: (() => void) | null = null;
  let reactionSetup = false;

  const scheduleRecompile = (onRecompile: () => Promise<void>): void => {
    if (recompileTimeout) {
      clearTimeout(recompileTimeout);
    }
    recompileTimeout = setTimeout(async () => {
      try {
        await onRecompile();
      } catch (err) {
        console.error('Recompile error:', err);
      }
    }, debounceMs);
  };

  return {
    setup(
      store: RootStore,
      onRecompile: () => Promise<void>,
      onValuePatch?: (changes: ReadonlyMap<string, unknown>) => boolean,
    ): void {
      if (reactionSetup) return;
      reactionSetup = true;

      reactionDisposer = reaction(
        () => {
          // [LAW:one-source-of-truth] PatchStore.patch snapshot identity is the canonical
          // mutation signal; avoid duplicating graph state via local hashes.
          return store.patch.patch;
        },
        () => {
          // Fast-path: if only constant values changed, try patching without full recompile
          const pending = store.patch.consumePendingChanges();
          if (pending.kind === 'valueOnly' && onValuePatch) {
            const handled = onValuePatch(pending.changes);
            if (handled) return; // Fast path succeeded, skip full recompile
          }
          scheduleRecompile(onRecompile);
        },
        {
          fireImmediately: false,
          // [LAW:single-enforcer] PatchStore snapshot identity governs graph-change detection.
          equals: (a, b) => a === b,
        },
      );
    },

    cleanup(): void {
      if (recompileTimeout) {
        clearTimeout(recompileTimeout);
        recompileTimeout = null;
      }
      reactionDisposer?.();
      reactionDisposer = null;
      reactionSetup = false;
    },
  };
}
