/**
 * HistoryService - Temporal history ring buffer for debug probes.
 *
 * Maintains per-key ring buffers of scalar signal values over time.
 * Values are pushed from DebugService via onSlotWrite callback.
 *
 * Design constraints:
 * - Only tracks cardinality:one, temporality:continuous, sampleable payloads
 * - Stride is always 1 in v1 (scalar signals only)
 * - MAX_TRACKED_KEYS=32, eviction from hoverProbes (never pinned)
 * - TrackedEntry IS the HistoryView (object-stable, no allocation on read)
 * - writeIndex is monotonically increasing (never resets)
 */

import type { ValueSlot } from '../../types';
import type { PayloadType } from '../../core/canonical-types';
import type { DebugTargetKey, HistoryView, Stride } from './types';
import { serializeKey, getSampleEncoding } from './types';

// =============================================================================
// Constants
// =============================================================================

/** Default ring buffer capacity (number of samples) */
const DEFAULT_CAPACITY = 128;

/** Maximum number of concurrently tracked keys */
const MAX_TRACKED_KEYS = 32;

// =============================================================================
// Resolver Interface
// =============================================================================

/**
 * Metadata needed by HistoryService to validate and bind a tracked key.
 * Provided by a resolver function to avoid circular dependency with DebugService.
 */
export interface ResolvedKeyMetadata {
  /** The runtime slot this key maps to (null if unmapped) */
  slotId: ValueSlot | null;
  /** Cardinality of this edge/port */
  cardinality: 'signal' | 'field';
  /** Payload type for stride computation */
  payloadType: PayloadType;
}

/**
 * Resolver function type.
 * Given a DebugTargetKey, returns its metadata or undefined if not found.
 */
export type KeyResolver = (key: DebugTargetKey) => ResolvedKeyMetadata | undefined;

// =============================================================================
// TrackedEntry - The HistoryView implementation
// =============================================================================

/**
 * A tracked history entry. This IS the HistoryView — same object reference
 * returned from getHistory(). No allocation on read.
 */
export class TrackedEntry implements HistoryView {
  readonly key: DebugTargetKey;
  readonly serializedKey: string;
  slotId: ValueSlot | null;
  readonly stride: Stride;
  buffer: Float32Array;
  writeIndex: number = 0;
  readonly capacity: number;
  filled: boolean = false;

  constructor(key: DebugTargetKey, slotId: ValueSlot | null, stride: Stride, capacity: number) {
    this.key = key;
    this.serializedKey = serializeKey(key);
    this.slotId = slotId;
    this.stride = stride;
    this.capacity = capacity;
    this.buffer = new Float32Array(capacity * stride);
  }
}

// =============================================================================
// HistoryService
// =============================================================================

export class HistoryService {
  /** All tracked entries by serialized key */
  private entries = new Map<string, TrackedEntry>();

  /** Reverse map: slot -> set of serialized keys observing that slot */
  private slotToEntryIds = new Map<ValueSlot, Set<string>>();

  /** Insertion-ordered set of hover probe keys (candidates for eviction) */
  private hoverProbes = new Set<string>();

  /** Insertion-ordered set of pinned probe keys (never evicted) */
  private pinnedProbes = new Set<string>();

  /** Resolver function for key metadata */
  private resolver: KeyResolver;

  constructor(resolver: KeyResolver) {
    this.resolver = resolver;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Start tracking a key. Resolves metadata, validates, and allocates buffer.
   *
   * Guards (silently rejects, no throw):
   * - Key must resolve to metadata
   * - Cardinality must be 'signal' (not 'field')
   * - Payload must be sampleable
   * - Stride must be 1 (scalar signals only in v1)
   *
   * If MAX_TRACKED_KEYS is reached, evicts the oldest hover probe.
   */
  track(key: DebugTargetKey): void {
    const serialized = serializeKey(key);

    // Already tracked — no-op
    if (this.entries.has(serialized)) return;

    // Resolve metadata
    const meta = this.resolver(key);
    if (!meta) return;

    // Guard: cardinality must be signal (one)
    if (meta.cardinality !== 'signal') return;

    // Guard: must be sampleable with stride=1
    const encoding = getSampleEncoding(meta.payloadType);
    if (!encoding.sampleable) return;
    if (encoding.stride !== 1) return;

    // Evict if at capacity
    if (this.entries.size >= MAX_TRACKED_KEYS) {
      this.evictOldestHoverProbe();
      // If still at capacity (all are pinned), silently reject
      if (this.entries.size >= MAX_TRACKED_KEYS) return;
    }

    // Allocate entry
    const entry = new TrackedEntry(key, meta.slotId, 1, DEFAULT_CAPACITY);
    this.entries.set(serialized, entry);
    this.hoverProbes.add(serialized);

    // Update reverse map
    if (meta.slotId !== null) {
      this.addToReverseMap(meta.slotId, serialized);
    }
  }

  /**
   * Stop tracking a key. Removes entry and cleans up reverse map.
   */
  untrack(key: DebugTargetKey): void {
    const serialized = serializeKey(key);
    const entry = this.entries.get(serialized);
    if (!entry) return;

    // Remove from reverse map
    if (entry.slotId !== null) {
      this.removeFromReverseMap(entry.slotId, serialized);
    }

    // Remove from probe sets
    this.hoverProbes.delete(serialized);
    this.pinnedProbes.delete(serialized);

    // Remove entry
    this.entries.delete(serialized);
  }

  /**
   * Check if a key is currently tracked.
   */
  isTracked(key: DebugTargetKey): boolean {
    return this.entries.has(serializeKey(key));
  }

  /**
   * Get the history for a tracked key.
   * Returns the TrackedEntry directly (object-stable, no allocation).
   * Returns undefined if not tracked.
   */
  getHistory(key: DebugTargetKey): TrackedEntry | undefined {
    return this.entries.get(serializeKey(key));
  }

  /**
   * Push a value into all entries observing the given slot.
   * Called by DebugService after each signal slot write.
   *
   * Uses safe JS modulo: ((writeIndex % capacity) + capacity) % capacity
   */
  onSlotWrite(slotId: ValueSlot, value: number): void {
    const entryIds = this.slotToEntryIds.get(slotId);
    if (!entryIds) return;

    for (const id of entryIds) {
      const entry = this.entries.get(id);
      if (!entry) continue;

      const pos = ((entry.writeIndex % entry.capacity) + entry.capacity) % entry.capacity;
      entry.buffer[pos] = value;
      entry.writeIndex++;
      if (!entry.filled && entry.writeIndex >= entry.capacity) {
        entry.filled = true;
      }
    }
  }

  /**
   * Re-resolve all tracked keys after mapping changes.
   * Called when DebugService updates its edge/port mappings.
   *
   * For each entry:
   * - If key no longer resolves: set slotId=null (paused)
   * - If slot changed: update reverse map
   * - If stride changed: discard and reallocate buffer
   */
  onMappingChanged(): void {
    for (const [serialized, entry] of this.entries) {
      const meta = this.resolver(entry.key);

      if (!meta || meta.cardinality !== 'signal') {
        // Key no longer valid — pause (set slot to null)
        if (entry.slotId !== null) {
          this.removeFromReverseMap(entry.slotId, serialized);
          entry.slotId = null;
        }
        continue;
      }

      const encoding = getSampleEncoding(meta.payloadType);
      if (!encoding.sampleable || encoding.stride !== 1) {
        // Stride incompatible — pause
        if (entry.slotId !== null) {
          this.removeFromReverseMap(entry.slotId, serialized);
          entry.slotId = null;
        }
        continue;
      }

      const newSlotId = meta.slotId;

      // Check if stride changed (shouldn't in v1 but handle it)
      if (encoding.stride !== entry.stride) {
        // Discard and reallocate buffer
        if (entry.slotId !== null) {
          this.removeFromReverseMap(entry.slotId, serialized);
        }
        entry.buffer = new Float32Array(entry.capacity * encoding.stride);
        entry.writeIndex = 0;
        entry.filled = false;
        // Note: stride is readonly on TrackedEntry, but in v1 it's always 1
        // so this branch is effectively unreachable
      }

      // Update slot binding
      if (newSlotId !== entry.slotId) {
        // Remove old
        if (entry.slotId !== null) {
          this.removeFromReverseMap(entry.slotId, serialized);
        }
        // Set new
        entry.slotId = newSlotId;
        if (newSlotId !== null) {
          this.addToReverseMap(newSlotId, serialized);
        }
      }
    }
  }

  /**
   * Drop all entries and reverse maps.
   */
  clear(): void {
    this.entries.clear();
    this.slotToEntryIds.clear();
    this.hoverProbes.clear();
    this.pinnedProbes.clear();
  }

  // ===========================================================================
  // Internals (exposed for testing)
  // ===========================================================================

  /** @internal Number of currently tracked entries */
  get trackedCount(): number {
    return this.entries.size;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private addToReverseMap(slotId: ValueSlot, serialized: string): void {
    let set = this.slotToEntryIds.get(slotId);
    if (!set) {
      set = new Set();
      this.slotToEntryIds.set(slotId, set);
    }
    set.add(serialized);
  }

  private removeFromReverseMap(slotId: ValueSlot, serialized: string): void {
    const set = this.slotToEntryIds.get(slotId);
    if (set) {
      set.delete(serialized);
      if (set.size === 0) {
        this.slotToEntryIds.delete(slotId);
      }
    }
  }

  private evictOldestHoverProbe(): void {
    // Set iteration order is insertion order — first element is oldest
    for (const key of this.hoverProbes) {
      this.hoverProbes.delete(key);
      const entry = this.entries.get(key);
      if (entry) {
        if (entry.slotId !== null) {
          this.removeFromReverseMap(entry.slotId, key);
        }
        this.entries.delete(key);
      }
      return; // Only evict one
    }
  }
}
