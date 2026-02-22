/**
 * Patch Persistence Service
 *
 * Handles serialization, deserialization, and localStorage persistence of patches.
 */

import type { Patch } from '../graph';
import type { BlockId, EdgeRole } from '../types';
import { serializePatchToHCL, deserializePatchFromHCL, type PatchDslError } from '../patch-dsl';
import { resolveLocalStorageCapability } from './local-storage-capability';

export const STORAGE_KEY = 'oscilla-v2-patch-v10'; // Bumped to invalidate stale patches after block genericization (FieldSin->Sin, etc.)
const MAX_PERSISTENCE_ISSUES = 128;

export type PatchPersistenceIssueLevel = 'warn' | 'error';

export interface PatchPersistenceIssue {
  readonly level: PatchPersistenceIssueLevel;
  readonly op: 'deserialize' | 'save' | 'load' | 'clear';
  readonly message: string;
  readonly detail?: unknown;
}

let issueReporter: ((issue: PatchPersistenceIssue) => void) | null = null;
const persistenceIssues: PatchPersistenceIssue[] = [];

function recordIssue(issue: PatchPersistenceIssue): void {
  persistenceIssues.push(issue);
  if (persistenceIssues.length > MAX_PERSISTENCE_ISSUES) {
    persistenceIssues.splice(0, persistenceIssues.length - MAX_PERSISTENCE_ISSUES);
  }
  issueReporter?.(issue);
}

export function setPatchPersistenceIssueReporter(
  reporter: ((issue: PatchPersistenceIssue) => void) | null
): void {
  issueReporter = reporter;
}

export function getPatchPersistenceIssues(): readonly PatchPersistenceIssue[] {
  return persistenceIssues;
}

export function clearPatchPersistenceIssues(): void {
  persistenceIssues.length = 0;
}

export interface SerializedPatch {
  blocks: Array<{
    id: string;
    type: string;
    params: Record<string, unknown>;
    label?: string;
    displayName: string | null;
    domainId: string | null;
    role: { kind: string; meta: Record<string, unknown> };
    inputPorts: Array<{ id: string; defaultSource?: unknown; combineMode?: string }>;
    outputPorts: Array<{ id: string }>;
  }>;
  edges: Array<{
    id: string;
    from: { kind: 'port'; blockId: string; slotId: string };
    to: { kind: 'port'; blockId: string; slotId: string };
    enabled?: boolean;
    sortKey?: number;
    role?: { kind: string; meta: Record<string, unknown> };
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
 * Deserialize a JSON string to a patch.
 * Returns null if deserialization fails.
 */
export function deserializePatch(json: string): { patch: Patch; presetIndex: number } | null {
  try {
    const data: SerializedPatch = JSON.parse(json);
    const blocks = new Map<BlockId, any>();
    for (const b of data.blocks) {
      // Ensure inputPorts have required combineMode field
      const normalizedInputPorts = b.inputPorts.map(p => ({
        ...p,
        combineMode: p.combineMode ?? 'last',
      }));
      blocks.set(b.id as BlockId, {
        ...b,
        inputPorts: new Map(normalizedInputPorts.map(p => [p.id, p])),
        outputPorts: new Map(b.outputPorts.map(p => [p.id, p])),
      });
    }
    // Ensure edges have required fields (for backwards compatibility with old patches)
    const normalizedEdges = data.edges.map((e, i) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      enabled: e.enabled ?? true,
      sortKey: e.sortKey ?? i,
      role: (e.role ?? { kind: 'user' as const, meta: {} as Record<string, never> }) as EdgeRole,
    }));
    const patch: Patch = { blocks, edges: normalizedEdges };

    return {
      patch,
      presetIndex: data.presetIndex,
    };
  } catch (error) {
    // [LAW:no-silent-fallbacks] Persisted patch decode failures must be visible.
    recordIssue({
      level: 'warn',
      op: 'deserialize',
      message: 'Failed to deserialize persisted patch JSON',
      detail: error,
    });
    return null;
  }
}

/**
 * Export patch as HCL text.
 *
 * @param patch - The patch to serialize
 * @param name - Optional patch name (defaults to "Untitled")
 * @returns HCL text representation
 */
export function exportPatchAsHCL(patch: Patch, name?: string): string {
  return serializePatchToHCL(patch, { name });
}

/**
 * Import patch from HCL text.
 *
 * Returns null if total failure (no blocks and errors exist).
 * Returns partial patch + errors otherwise.
 *
 * @param hcl - HCL text to deserialize
 * @returns Patch and errors, or null if total failure
 */
export function importPatchFromHCL(hcl: string): { patch: Patch; errors: PatchDslError[] } | null {
  const result = deserializePatchFromHCL(hcl);

  // Total failure: no blocks and errors exist
  if (result.patch.blocks.size === 0 && result.errors.length > 0) {
    return null;
  }

  return { patch: result.patch, errors: result.errors };
}

/**
 * Save a patch to localStorage.
 */
export function savePatchToStorage(patch: Patch, presetIndex: number): void {
  try {
    // [LAW:single-enforcer] localStorage capability detection is centralized.
    const storage = resolveLocalStorageCapability();
    if (!storage) return;
    storage.setItem(STORAGE_KEY, serializePatch(patch, presetIndex));
  } catch (error) {
    // [LAW:no-silent-fallbacks] Storage write failures must be surfaced.
    recordIssue({
      level: 'warn',
      op: 'save',
      message: 'Failed to persist patch to local storage',
      detail: error,
    });
  }
}

/**
 * Load a patch from localStorage.
 * Returns null if no patch is stored or deserialization fails.
 */
export function loadPatchFromStorage(): { patch: Patch; presetIndex: number } | null {
  try {
    // [LAW:single-enforcer] localStorage capability detection is centralized.
    const storage = resolveLocalStorageCapability();
    if (!storage) return null;
    const json = storage.getItem(STORAGE_KEY);
    if (!json) return null;
    return deserializePatch(json);
  } catch (error) {
    // [LAW:no-silent-fallbacks] Storage read failures must be surfaced.
    recordIssue({
      level: 'warn',
      op: 'load',
      message: 'Failed to load patch from local storage',
      detail: error,
    });
    return null;
  }
}

/**
 * Clear the stored patch from localStorage and reload the page.
 * Exposed globally for UI.
 */
export function clearStorageAndReload(): void {
  try {
    // [LAW:single-enforcer] localStorage capability detection is centralized.
    const storage = resolveLocalStorageCapability();
    storage?.removeItem?.(STORAGE_KEY);
  } catch (error) {
    // [LAW:no-silent-fallbacks] Clear failures should be visible as operational warnings.
    recordIssue({
      level: 'warn',
      op: 'clear',
      message: 'Failed to clear stored patch',
      detail: error,
    });
  }
  if (typeof window !== 'undefined' && window.location) {
    window.location.reload();
  }
}
