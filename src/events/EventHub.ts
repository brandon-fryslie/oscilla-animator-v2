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
 * - once() for single-fire listeners
 *
 * Spec Reference: design-docs/_new/01-Event-System.md
 */

import type { EditorEvent } from './types';

export interface EventHubListenerError {
  scope: 'typed' | 'global';
  eventType: EditorEvent['type'];
  error: unknown;
}

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
  private static readonly MAX_LISTENER_ERRORS = 100;

  // Type-specific listeners (keyed by event type)
  private listeners = new Map<string, Set<(event: EditorEvent) => void>>();

  // Global listeners (receive all events)
  private globalListeners = new Set<(event: EditorEvent) => void>();
  private errorReporter: ((payload: EventHubListenerError) => void) | null = null;
  private listenerErrors: EventHubListenerError[] = [];

  /**
   * Configure an optional error reporter for listener failures.
   */
  setErrorReporter(reporter: ((payload: EventHubListenerError) => void) | null): void {
    this.errorReporter = reporter;
  }

  /**
   * Returns a snapshot of recent listener failures captured by EventHub.
   * Useful for diagnostics in runtimes without an external error reporter.
   */
  getListenerErrors(): readonly EventHubListenerError[] {
    return this.listenerErrors;
  }

  /**
   * Clears the captured listener failure history.
   */
  clearListenerErrors(): void {
    this.listenerErrors = [];
  }

  private recordListenerError(payload: EventHubListenerError): void {
    this.listenerErrors.push(payload);
    if (this.listenerErrors.length > EventHub.MAX_LISTENER_ERRORS) {
      this.listenerErrors.shift();
    }
  }

  private reportListenerError(payload: EventHubListenerError): void {
    this.recordListenerError(payload);
    try {
      // [LAW:single-enforcer] EventHub is the sole boundary that classifies
      // listener exceptions and forwards them to the configured reporter.
      if (this.errorReporter) {
        this.errorReporter(payload);
      }
    } catch (reportError) {
      this.recordListenerError({
        scope: payload.scope,
        eventType: payload.eventType,
        error: reportError,
      });
    }
  }

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
          this.reportListenerError({ scope: 'typed', eventType: event.type, error: err });
          // Continue executing other listeners
        }
      }
    }

    // Call global listeners
    for (const listener of this.globalListeners) {
      try {
        listener(event);
      } catch (err) {
        this.reportListenerError({ scope: 'global', eventType: event.type, error: err });
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
   * Subscribes to a specific event type, firing only once.
   *
   * The handler auto-unsubscribes after the first matching event.
   * Returns an unsubscribe function for manual early cleanup.
   *
   * @param type The event type to listen for
   * @param handler The handler function (receives narrowed event type)
   * @returns Unsubscribe function (for early cleanup before event fires)
   *
   * Example:
   * ```typescript
   * hub.once('CompileEnd', (event) => {
   *   console.log('First compile complete!');
   *   // Handler auto-removed, won't fire again
   * });
   * ```
   */
  once<T extends EditorEvent['type']>(
    type: T,
    handler: (event: Extract<EditorEvent, { type: T }>) => void
  ): () => void {
    let unsubscribe: (() => void) | null = null;

    // Wrap handler to auto-unsubscribe after first call
    const wrappedHandler = (event: Extract<EditorEvent, { type: T }>) => {
      // Unsubscribe first (in case handler throws)
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      handler(event);
    };

    // Subscribe with wrapped handler
    unsubscribe = this.on(type, wrappedHandler);

    // Return unsubscribe for early cleanup
    return () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
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
    this.clearListenerErrors();
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
