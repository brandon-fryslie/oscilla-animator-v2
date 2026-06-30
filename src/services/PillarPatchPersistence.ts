/**
 * src/services/PillarPatchPersistence.ts
 *
 * The effectful shell around the pure pillar-patch wire format
 * (src/pillars/persistence.ts): it reads and writes the authored `PillarPatch`
 * to localStorage. This is the one place pillar-patch persistence touches the
 * world. [LAW:effects-at-boundaries]
 *
 * [LAW:single-enforcer] localStorage capability detection is delegated to
 *   `resolveLocalStorageCapability` (shared with V1 patch persistence), not
 *   re-implemented here.
 * [LAW:no-silent-failure] A read that finds a value it cannot parse is reported
 *   as `failed`, never silently collapsed into `empty` — the difference between
 *   "the user has no saved patch" and "the user's saved patch was lost" must
 *   reach the diagnostics boundary, not be swallowed.
 */

import {
  deserializePillarPatch,
  serializePillarPatch,
} from '../pillars/persistence';
import type { PillarPatch } from '../pillars/types';
import { resolveLocalStorageCapability } from './local-storage-capability';

/** Namespaced + version-suffixed so it never collides with the V1 patch key. */
export const PILLAR_PATCH_STORAGE_KEY = 'oscilla-pillar-patch-v1';

/**
 * The outcome of a load. `empty` (no capability, or nothing stored) is the
 * first-visit case the caller answers with the default starter patch; `failed`
 * is a stored-but-unrecoverable patch the caller must surface loudly before
 * falling back. [LAW:dataflow-not-control-flow]
 */
export type PillarPatchLoadResult =
  | { readonly kind: 'loaded'; readonly patch: PillarPatch }
  | { readonly kind: 'empty' }
  | { readonly kind: 'failed'; readonly error: string };

/** The outcome of a save: success, or a human-readable write failure. */
export type PillarPatchSaveResult =
  | { readonly kind: 'saved' }
  | { readonly kind: 'failed'; readonly error: string };

/**
 * Persist the authored patch. Absence of a storage capability (Node/SSR/test)
 * is not a failure — there is simply nothing to write — so it returns `saved`.
 * Only a real write rejection (e.g. quota exceeded) is a `failed`.
 */
export function savePillarPatchToStorage(patch: PillarPatch): PillarPatchSaveResult {
  const storage = resolveLocalStorageCapability();
  if (storage === null) return { kind: 'saved' };
  try {
    storage.setItem(PILLAR_PATCH_STORAGE_KEY, serializePillarPatch(patch));
    return { kind: 'saved' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { kind: 'failed', error: `failed to write authored patch to storage: ${detail}` };
  }
}

/** Read the authored patch back. See `PillarPatchLoadResult` for the cases. */
export function loadPillarPatchFromStorage(): PillarPatchLoadResult {
  const storage = resolveLocalStorageCapability();
  if (storage === null) return { kind: 'empty' };

  let stored: string | null;
  try {
    stored = storage.getItem(PILLAR_PATCH_STORAGE_KEY);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { kind: 'failed', error: `failed to read authored patch from storage: ${detail}` };
  }
  if (stored === null) return { kind: 'empty' };

  const result = deserializePillarPatch(stored);
  if (!result.ok) {
    return { kind: 'failed', error: `stored authored patch is unreadable: ${result.error}` };
  }
  return { kind: 'loaded', patch: result.patch };
}
