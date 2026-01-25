/**
 * Patch Persistence Service
 *
 * Handles serialization, deserialization, and localStorage persistence of patches.
 * Includes patch migration support for handling removed/renamed blocks.
 */

import { migratePatch } from '../graph/patchMigrations';
import type { Patch } from '../graph';
import type { BlockId } from '../types';

export const STORAGE_KEY = 'oscilla-v2-patch-v10'; // Bumped to invalidate stale patches after block genericization (FieldSin->Sin, etc.)

export interface SerializedPatch {
  blocks: Array<{
    id: string;
    type: string;
    params: Record<string, unknown>;
    label?: string;
    displayName: string | null;
    domainId: string | null;
    role: { kind: string; meta: Record<string, unknown> };
    inputPorts: Array<{ id: string; defaultSource?: unknown }>;
    outputPorts: Array<{ id: string }>;
  }>;
  edges: Array<{
    id: string;
    from: { kind: 'port'; blockId: string; slotId: string };
    to: { kind: 'port'; blockId: string; slotId: string };
    enabled?: boolean;
    sortKey?: number;
  }>;
  presetIndex: number;
}

/**
 * Serialize a patch to JSON string for storage.
 */
export function serializePatch(patch: Patch, presetIndex: number): string {
  const serialized: SerializedPatch = {
    blocks: Array.from(patch.blocks.entries()).map(([, block]) => ({
      id: block.id,
      type: block.type,
      params: { ...block.params },
      ...(block.label && { label: block.label }),
      displayName: block.displayName,
      domainId: block.domainId,
      role: block.role as { kind: string; meta: Record<string, unknown> },
      inputPorts: Array.from(block.inputPorts.values()),
      outputPorts: Array.from(block.outputPorts.values()),
    })),
    edges: patch.edges.map(e => ({ ...e })),
    presetIndex,
  };
  return JSON.stringify(serialized);
}

/**
 * Deserialize a JSON string to a patch, applying migrations if needed.
 * Returns null if deserialization fails.
 */
export function deserializePatch(json: string): { patch: Patch; presetIndex: number } | null {
  try {
    const data: SerializedPatch = JSON.parse(json);
    const blocks = new Map<BlockId, any>();
    for (const b of data.blocks) {
      blocks.set(b.id as BlockId, {
        ...b,
        inputPorts: new Map(b.inputPorts.map(p => [p.id, p])),
        outputPorts: new Map(b.outputPorts.map(p => [p.id, p])),
      });
    }
    const rawPatch = { blocks, edges: data.edges };

    // Apply patch migrations for removed/renamed blocks
    const { patch: migratedPatch, migrations } = migratePatch(rawPatch);

    // Log migrations to console for debugging
    if (migrations.length > 0) {
      console.warn(
        `[PatchMigration] Applied ${migrations.length} migrations to patch:`,
        migrations.map(m => `  - ${m.kind}: ${m.reason}`).join('\n'),
      );
    }

    return {
      patch: migratedPatch,
      presetIndex: data.presetIndex,
    };
  } catch {
    return null;
  }
}

/**
 * Save a patch to localStorage.
 * Silently ignores failures (e.g., quota exceeded).
 */
export function savePatchToStorage(patch: Patch, presetIndex: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializePatch(patch, presetIndex));
  } catch {
    // Storage full or unavailable - silently ignore
  }
}

/**
 * Load a patch from localStorage.
 * Returns null if no patch is stored or deserialization fails.
 */
export function loadPatchFromStorage(): { patch: Patch; presetIndex: number } | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;
    return deserializePatch(json);
  } catch {
    return null;
  }
}

/**
 * Clear the stored patch from localStorage and reload the page.
 * Exposed globally for UI.
 */
export function clearStorageAndReload(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}
