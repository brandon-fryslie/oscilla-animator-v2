import type { SerializedDockview } from 'dockview';
import { resolveLocalStorageCapability } from '../../services/local-storage-capability';

export const DOCKVIEW_LAYOUT_STORAGE_KEY = 'oscilla.dockview.layout.v1';

export function loadDockviewLayout(): SerializedDockview | null {
  // [LAW:single-enforcer] localStorage capability detection is centralized in resolveLocalStorageCapability.
  const storage = resolveLocalStorageCapability();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(DOCKVIEW_LAYOUT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SerializedDockview;
  } catch {
    return null;
  }
}

export function saveDockviewLayout(layout: SerializedDockview): void {
  // [LAW:single-enforcer] localStorage capability detection is centralized in resolveLocalStorageCapability.
  const storage = resolveLocalStorageCapability();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(DOCKVIEW_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Intentionally non-fatal (storage quota/restrictions).
  }
}

export function clearStoredDockviewLayout(): void {
  // [LAW:single-enforcer] localStorage capability detection is centralized in resolveLocalStorageCapability.
  const storage = resolveLocalStorageCapability();
  storage?.removeItem?.(DOCKVIEW_LAYOUT_STORAGE_KEY);
}
