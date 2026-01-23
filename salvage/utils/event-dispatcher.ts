/**
 * Type-Safe Event Dispatcher
 *
 * Synchronous, error-isolated, deterministic event dispatch.
 * - Handlers called in registration order
 * - One bad handler can't break others
 * - Type-specific and global subscription
 */

export type EventHandler<T> = (event: T) => void;

export interface TypedEvent {
  readonly type: string;
}

/**
 * Extract event type from a union by its 'type' discriminant.
 */
export type EventOfType<E extends TypedEvent, T extends E['type']> =
  E extends { type: T } ? E : never;

export class EventDispatcher<E extends TypedEvent> {
  private handlers = new Map<string, Set<EventHandler<E>>>();
  private globalHandlers = new Set<EventHandler<E>>();

  /**
   * Emit an event. Handlers are called synchronously.
   * Errors are caught and logged but don't break the emit flow.
   */
  emit(event: E): void {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`Event handler error [${event.type}]:`, error);
        }
      }
    }

    for (const handler of this.globalHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Global event handler error:', error);
      }
    }
  }

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function.
   */
  on<T extends E['type']>(
    type: T,
    handler: EventHandler<EventOfType<E, T>>
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    const handlers = this.handlers.get(type)!;
    handlers.add(handler as EventHandler<E>);
    return () => handlers.delete(handler as EventHandler<E>);
  }

  /**
   * Subscribe to all events.
   */
  subscribe(handler: EventHandler<E>): () => void {
    this.globalHandlers.add(handler);
    return () => this.globalHandlers.delete(handler);
  }

  /**
   * Clear all handlers.
   */
  clear(): void {
    this.handlers.clear();
    this.globalHandlers.clear();
  }
}
