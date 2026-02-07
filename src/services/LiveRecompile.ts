/**
 * Live Recompile Service
 *
 * Watches patch changes via MobX reactions and triggers debounced recompilation.
 * Integrates with CompileOrchestrator for the actual compilation.
 */

import { reaction, untracked } from 'mobx';
import type { RootStore } from '../stores';

let recompileTimeout: ReturnType<typeof setTimeout> | null = null;
const RECOMPILE_DEBOUNCE_MS = 16; // ~1 frame at 60fps for responsive parameter control

// Track state to skip unnecessary reaction fires
let reactionDisposer: (() => void) | null = null;
let lastBlockParamsHash: string | null = null;
let lastBlockCount: number = 0;
let lastEdgeCount: number = 0;
let reactionSetup = false;

/**
 * Create a hash of block params and inputPorts for change detection.
 * We need deep change detection since MobX only tracks shallow changes.
 * Including inputPorts ensures defaultSource changes trigger recompilation.
 */
function hashBlockParams(blocks: ReadonlyMap<string, any>): string {
  const parts: string[] = [];
  for (const [id, block] of blocks) {
    // Hash both params and inputPorts (for defaultSource changes)
    const inputPortsData: Record<string, any> = {};
    if (block.inputPorts) {
      for (const [portId, port] of block.inputPorts) {
        inputPortsData[portId] = port;
      }
    }
    parts.push(`${id}:${JSON.stringify(block.params)}:${JSON.stringify(inputPortsData)}`);
  }
  return parts.join('|');
}

/**
 * Debounced recompile - waits for changes to settle before recompiling.
 */
export function scheduleRecompile(onRecompile: () => Promise<void>): void {
  if (recompileTimeout) {
    clearTimeout(recompileTimeout);
  }
  recompileTimeout = setTimeout(async () => {
    try {
      await onRecompile();
    } catch (err) {
      console.error('Recompile error:', err);
    }
  }, RECOMPILE_DEBOUNCE_MS);
}

/**
 * Set up MobX reaction to watch for patch changes.
 */
export function setupLiveRecompileReaction(
  store: RootStore,
  onRecompile: () => Promise<void>,
  onValuePatch?: (changes: ReadonlyMap<string, unknown>) => boolean,
): void {
  if (reactionSetup) return;
  reactionSetup = true;

  // Initialize tracking state from current store (untracked: imperative read, not reactive)
  const initialPatch = untracked(() => store.patch.patch);
  lastBlockParamsHash = hashBlockParams(initialPatch.blocks);
  lastBlockCount = initialPatch.blocks.size;
  lastEdgeCount = initialPatch.edges.length;

  // Watch for block AND edge changes (additions, removals, param changes)
  reactionDisposer = reaction(
    () => {
      // Track structure (blocks + edges) and params
      // IMPORTANT: Use store.patch.patch (ImmutablePatch) instead of store.patch.blocks
      // because .patch reads _dataVersion which is observable, while .blocks does not.
      const immutablePatch = store.patch.patch;
      const blocks = immutablePatch.blocks;
      const edgeCount = immutablePatch.edges.length;
      const hash = hashBlockParams(blocks);
      return { blockCount: blocks.size, edgeCount, hash };
    },
    ({ blockCount, edgeCount, hash }) => {
      // Skip if nothing meaningful changed
      if (hash === lastBlockParamsHash && blockCount === lastBlockCount && edgeCount === lastEdgeCount) {
        return;
      }
      lastBlockParamsHash = hash;
      lastBlockCount = blockCount;
      lastEdgeCount = edgeCount;

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
      // Use structural comparison for the tracked values
      equals: (a, b) => a.blockCount === b.blockCount && a.edgeCount === b.edgeCount && a.hash === b.hash,
    }
  );
}

/**
 * Cleanup function for testing/hot reload.
 * Disposes the live recompile reaction.
 */
export function cleanupReaction(): void {
  reactionDisposer?.();
  reactionDisposer = null;
  reactionSetup = false;
}
