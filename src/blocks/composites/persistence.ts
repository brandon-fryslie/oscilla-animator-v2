/**
 * Composite Library Persistence
 *
 * LocalStorage-based persistence for user-created composite blocks.
 * Handles CRUD operations, import/export, and graceful error handling.
 */

import type { CompositeDefJSON } from './schema';

// =============================================================================
// Storage Schema
// =============================================================================

const STORAGE_KEY = 'oscilla-user-composites-v1';

/**
 * Storage schema for localStorage.
 * Wraps composite definitions with metadata.
 */
interface StorageSchema {
  version: 1;
  composites: Record<string, StoredComposite>;
}

/**
 * A single stored composite with metadata.
 */
export interface StoredComposite {
  json: CompositeDefJSON;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// =============================================================================
// CompositeStorage Class
// =============================================================================

/**
 * Persistence layer for user-created composite blocks.
 *
 * Uses localStorage to persist composite definitions. All operations are
 * synchronous and handle errors gracefully (no exceptions thrown).
 */
export class CompositeStorage {
  /**
   * Load all stored composites from localStorage.
   *
   * @returns Map of type name to stored composite. Empty map if storage is empty or corrupted.
   */
  load(): Map<string, StoredComposite> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return new Map();
    }

    try {
      const data = JSON.parse(raw) as StorageSchema;

      // Check version compatibility
      if (data.version !== 1) {
        console.warn(`Unknown storage version ${data.version}, starting fresh`);
        return new Map();
      }

      return new Map(Object.entries(data.composites));
    } catch (e) {
      console.warn('Failed to load user composites from localStorage:', e);
      return new Map();
    }
  }

  /**
   * Save all composites to localStorage.
   *
   * @param composites - Map of composites to save
   * @returns true if save succeeded, false if quota exceeded or other error
   */
  save(composites: Map<string, StoredComposite>): boolean {
    const data: StorageSchema = {
      version: 1,
      composites: Object.fromEntries(composites),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      // Most likely quota exceeded
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.error('localStorage quota exceeded. Cannot save composites.');
        console.error('Consider exporting composites to a file as backup.');
      } else {
        console.error('Failed to save composites to localStorage:', e);
      }
      return false;
    }
  }

  /**
   * Add or update a single composite.
   *
   * If the composite already exists, updates it and preserves createdAt timestamp.
   * Otherwise, creates a new entry.
   *
   * @param json - Composite definition to add/update
   * @returns true if save succeeded, false otherwise
   */
  add(json: CompositeDefJSON): boolean {
    const composites = this.load();
    const now = new Date().toISOString();
    const existing = composites.get(json.type);

    composites.set(json.type, {
      json,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    return this.save(composites);
  }

  /**
   * Remove a composite by type name.
   *
   * @param type - Type name of composite to remove
   * @returns true if save succeeded (or composite didn't exist), false otherwise
   */
  remove(type: string): boolean {
    const composites = this.load();

    // If not found, consider it a success (idempotent delete)
    if (!composites.has(type)) {
      return true;
    }

    composites.delete(type);
    return this.save(composites);
  }

  /**
   * Export a single composite as a JSON string.
   *
   * @param type - Type name of composite to export
   * @returns JSON string or null if composite not found
   */
  exportSingle(type: string): string | null {
    const composites = this.load();
    const stored = composites.get(type);

    if (!stored) {
      return null;
    }

    return JSON.stringify(stored.json, null, 2);
  }

  /**
   * Export all composites as a JSON bundle.
   *
   * The bundle includes all composites and metadata about the export.
   *
   * @returns JSON string containing all composites
   */
  exportAll(): string {
    const composites = this.load();

    const bundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      composites: Object.fromEntries(
        Array.from(composites.entries()).map(([key, value]) => [key, value.json])
      ),
    };

    return JSON.stringify(bundle, null, 2);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Singleton instance for app-wide use.
 * Use this instead of creating new CompositeStorage instances.
 */
export const compositeStorage = new CompositeStorage();
