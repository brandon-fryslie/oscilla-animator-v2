/**
 * Event System - EventHub
 *
 * Type-safe event bus for editor-wide coordination.
 *
 * Features:
 * - Discriminated union for type-safe event handling
 * - Synchronous emission (listeners run before emit() returns)
 * - Exception isolation (one listener's error doesn't break others)
 * - Type-safe subscriptions (TypeScript narrows event type)
 *
 * Spec Reference: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/12-event-hub.md
 */

import type { EditorEvent } from './types';

// =============================================================================
// EventHub Class
// =============================================================================

/**
 * EventHub is the central event bus for editor-wide coordination.
 *
 * Usage:
 * ```typescript
 * const hub = new EventHub();
 *
 * // Type-safe subscription
 * const unsubscribe = hub.on('CompileEnd', (event) => {
 *   console.log(`Compiled in ${event.durationMs}ms`);
 * });
 *
 * // Emit event
 * hub.emit({
 *   type: 'CompileEnd',
 *   compileId: 'c1',
 *   patchId: 'p0',
 *   patchRevision: 5,
 *   status: 'success',
 *   durationMs: 42,
 *   diagnostics: [],
 * });
 *
 * // Cleanup
 * unsubscribe();
 * ```
 */
export class EventHub {
  // Type-specific listeners (keyed by event type)
  private listeners = new Map<string, Set<(event: EditorEvent) => void>>();

  // Global listeners (receive all events)
  private globalListeners = new Set<(event: EditorEvent) => void>();

  // =============================================================================
  // Public API
  // =============================================================================

  /**
   * Emits an event to all registered listeners.
   *
   * Execution:
   * - Synchronous: All listeners execute before emit() returns
   * - Exception isolation: One listener's error doesn't prevent others
   * - Order: Type-specific listeners first, then global listeners
   *
   * @param event The event to emit
   */
  emit(event: EditorEvent): void {
    // Call type-specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(event);
        } catch (err) {
          console.error(`[EventHub] Listener failed for ${event.type}:`, err);
          // Continue executing other listeners
        }
      }
    }

    // Call global listeners
    for (const listener of this.globalListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[EventHub] Global listener failed:', err);
        // Continue executing other listeners
      }
    }
  }

  /**
   * Subscribes to a specific event type with type-safe narrowing.
   *
   * TypeScript will infer the correct event shape based on the type parameter.
   *
   * @param type The event type to listen for
   * @param handler The handler function (receives narrowed event type)
   * @returns Unsubscribe function
   *
   * Example:
   * ```typescript
   * hub.on('CompileEnd', (event) => {
   *   // TypeScript knows event has status, durationMs, diagnostics, etc.
   *   console.log(event.status);
   * });
   * ```
   */
  on<T extends EditorEvent['type']>(
    type: T,
    handler: (event: Extract<EditorEvent, { type: T }>) => void
  ): () => void {
    // Ensure listener set exists for this type
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    // Cast handler to generic listener (safe because we filter by type)
    const typedHandler = handler as (event: EditorEvent) => void;
    this.listeners.get(type)!.add(typedHandler);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(typedHandler);
    };
  }

  /**
   * Subscribes to all events (global listener).
   *
   * Useful for logging, diagnostics, debugging.
   *
   * @param handler The handler function (receives all events)
   * @returns Unsubscribe function
   */
  subscribe(handler: (event: EditorEvent) => void): () => void {
    this.globalListeners.add(handler);

    // Return unsubscribe function
    return () => {
      this.globalListeners.delete(handler);
    };
  }

  /**
   * Clears all listeners (useful for testing/cleanup).
   */
  clear(): void {
    this.listeners.clear();
    this.globalListeners.clear();
  }

  /**
   * Returns the number of listeners for a specific event type.
   * Useful for debugging and testing.
   *
   * @param type The event type to check (optional - returns total if omitted)
   * @returns Number of listeners
   */
  listenerCount(type?: EditorEvent['type']): number {
    if (type === undefined) {
      // Return total listener count across all types + global
      let total = this.globalListeners.size;
      for (const listeners of this.listeners.values()) {
        total += listeners.size;
      }
      return total;
    }

    const typeListeners = this.listeners.get(type);
    return typeListeners ? typeListeners.size : 0;
  }
}
