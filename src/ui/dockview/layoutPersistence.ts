import type { SerializedDockview } from 'dockview';
import { resolveLocalStorageCapability } from '../../services/local-storage-capability';

/**
 * Per-era localStorage keys for the dockview panel arrangement. Each era's
 * layout references its OWN panel set, so restoring one era's serialized layout
 * into the other would name components that era never registers. Two distinct
 * layouts are two distinct authoritative slots. [LAW:one-source-of-truth]
 */
export const DOCKVIEW_LAYOUT_STORAGE_KEY = 'oscilla.dockview.layout.v1';
export const SCENE_DOCKVIEW_LAYOUT_STORAGE_KEY = 'oscilla.dockview.layout.scene';

export function loadDockviewLayout(storageKey: string): SerializedDockview | null {
  // [LAW:single-enforcer] localStorage capability detection is centralized in resolveLocalStorageCapability.
  const storage = resolveLocalStorageCapability();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SerializedDockview;
  } catch (err) {
    // [LAW:no-silent-failure] A corrupt entry would otherwise be re-parsed and
    // re-rejected on every load, silently forcing the default layout forever.
    // Surface it and clear it so the next save writes a clean value — the same
    // self-repair the DockviewProvider applies when `fromJSON` rejects a layout.
    console.warn(`[dockview] discarding corrupt saved layout (${storageKey}):`, err);
    clearStoredDockviewLayout(storageKey);
    return null;
  }
}

export function saveDockviewLayout(storageKey: string, layout: SerializedDockview): void {
  // [LAW:single-enforcer] localStorage capability detection is centralized in resolveLocalStorageCapability.
  const storage = resolveLocalStorageCapability();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(storageKey, JSON.stringify(layout));
  } catch (err) {
    // [LAW:no-silent-failure] Non-fatal (storage quota/restrictions), but the
    // user's layout silently failing to persist deserves a signal rather than
    // a discovery on the next reload.
    console.warn(`[dockview] failed to persist layout (${storageKey}):`, err);
  }
}

export function clearStoredDockviewLayout(storageKey: string): void {
  // [LAW:single-enforcer] localStorage capability detection is centralized in resolveLocalStorageCapability.
  const storage = resolveLocalStorageCapability();
  storage?.removeItem?.(storageKey);
}
