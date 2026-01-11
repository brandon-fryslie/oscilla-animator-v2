import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventHub } from '../EventHub';
import type { EditorEvent, GraphCommittedEvent, CompileEndEvent, CompileBeginEvent, ProgramSwappedEvent, RuntimeHealthSnapshotEvent } from '../types';

// Helper functions to create valid test events
function createGraphCommittedEvent(overrides?: Partial<GraphCommittedEvent>): GraphCommittedEvent {
  return {
    type: 'GraphCommitted',
    patchId: 'p0',
    patchRevision: 1,
    reason: 'userEdit',
    diffSummary: {
      blocksAdded: 1,
      blocksRemoved: 0,
      edgesChanged: 0,
    },
    ...overrides,
  };
}

function createCompileEndEvent(overrides?: Partial<CompileEndEvent>): CompileEndEvent {
  return {
    type: 'CompileEnd',
    compileId: 'c1',
    patchId: 'p0',
    patchRevision: 1,
    status: 'success',
    durationMs: 42,
    diagnostics: [],
    ...overrides,
  };
}

function createCompileBeginEvent(overrides?: Partial<CompileBeginEvent>): CompileBeginEvent {
  return {
    type: 'CompileBegin',
    compileId: 'c1',
    patchId: 'p0',
    patchRevision: 1,
    trigger: 'manual',
    ...overrides,
  };
}

function createProgramSwappedEvent(overrides?: Partial<ProgramSwappedEvent>): ProgramSwappedEvent {
  return {
    type: 'ProgramSwapped',
    patchId: 'p0',
    patchRevision: 1,
    compileId: 'c1',
    swapMode: 'soft',
    ...overrides,
  };
}

function createRuntimeHealthSnapshotEvent(overrides?: Partial<RuntimeHealthSnapshotEvent>): RuntimeHealthSnapshotEvent {
  return {
    type: 'RuntimeHealthSnapshot',
    patchId: 'p0',
    activePatchRevision: 1,
    tMs: Date.now(),
    frameBudget: {
      fpsEstimate: 60,
      avgFrameMs: 16.7,
    },
    evalStats: {
      fieldMaterializations: 100,
      nanCount: 0,
      infCount: 0,
    },
    ...overrides,
  };
}

describe('EventHub', () => {
  let hub: EventHub;

  beforeEach(() => {
    hub = new EventHub();
  });

  describe('Type-safe subscriptions', () => {
    it('should call listener when matching event is emitted', () => {
      const handler = vi.fn();
      hub.on('CompileEnd', handler);

      const event = createCompileEndEvent();
      hub.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should not call listener for different event types', () => {
      const compileHandler = vi.fn();
      const graphHandler = vi.fn();

      hub.on('CompileEnd', compileHandler);
      hub.on('GraphCommitted', graphHandler);

      const event = createGraphCommittedEvent();
      hub.emit(event);

      expect(graphHandler).toHaveBeenCalledTimes(1);
      expect(compileHandler).not.toHaveBeenCalled();
    });

    it('should call multiple listeners for same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      hub.on('CompileBegin', handler1);
      hub.on('CompileBegin', handler2);
      hub.on('CompileBegin', handler3);

      const event = createCompileBeginEvent();
      hub.emit(event);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should allow unsubscribing', () => {
      const handler = vi.fn();
      const unsubscribe = hub.on('CompileEnd', handler);

      hub.emit(createCompileEndEvent({ compileId: 'c1' }));
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      hub.emit(createCompileEndEvent({ compileId: 'c2' }));
      expect(handler).toHaveBeenCalledTimes(1); // Still only 1 call
    });
  });

  describe('Global listeners', () => {
    it('should call global listener for all event types', () => {
      const globalHandler = vi.fn();
      hub.subscribe(globalHandler);

      hub.emit(createGraphCommittedEvent());
      hub.emit(createCompileBeginEvent());
      hub.emit(createCompileEndEvent());

      expect(globalHandler).toHaveBeenCalledTimes(3);
    });

    it('should allow unsubscribing global listener', () => {
      const globalHandler = vi.fn();
      const unsubscribe = hub.subscribe(globalHandler);

      hub.emit(createGraphCommittedEvent());
      expect(globalHandler).toHaveBeenCalledTimes(1);

      unsubscribe();

      hub.emit(createGraphCommittedEvent());
      expect(globalHandler).toHaveBeenCalledTimes(1); // Still only 1
    });

    it('should call type-specific listeners before global listeners', () => {
      const callOrder: string[] = [];

      hub.on('CompileEnd', () => {
        callOrder.push('type-specific');
      });

      hub.subscribe(() => {
        callOrder.push('global');
      });

      hub.emit(createCompileEndEvent());

      expect(callOrder).toEqual(['type-specific', 'global']);
    });
  });

  describe('Synchronous execution', () => {
    it('should execute all listeners before emit() returns', () => {
      let executed = false;

      hub.on('GraphCommitted', () => {
        executed = true;
      });

      hub.emit(createGraphCommittedEvent());

      expect(executed).toBe(true);
    });

    it('should execute listeners in registration order', () => {
      const order: number[] = [];

      hub.on('CompileBegin', () => order.push(1));
      hub.on('CompileBegin', () => order.push(2));
      hub.on('CompileBegin', () => order.push(3));

      hub.emit(createCompileBeginEvent());

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('Exception isolation', () => {
    it('should continue executing listeners after one throws', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn(() => {
        throw new Error('Handler 2 failed');
      });
      const handler3 = vi.fn();

      hub.on('CompileEnd', handler1);
      hub.on('CompileEnd', handler2);
      hub.on('CompileEnd', handler3);

      const originalError = console.error;
      console.error = vi.fn();

      hub.emit(createCompileEndEvent());

      console.error = originalError;

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should log error when listener throws', () => {
      const mockError = vi.fn();
      const originalError = console.error;
      console.error = mockError;

      hub.on('GraphCommitted', () => {
        throw new Error('Test error');
      });

      hub.emit(createGraphCommittedEvent());

      console.error = originalError;

      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('[EventHub] Listener failed for GraphCommitted:'),
        expect.any(Error)
      );
    });

    it('should continue executing global listeners after one throws', () => {
      const global1 = vi.fn();
      const global2 = vi.fn(() => {
        throw new Error('Global 2 failed');
      });
      const global3 = vi.fn();

      hub.subscribe(global1);
      hub.subscribe(global2);
      hub.subscribe(global3);

      const originalError = console.error;
      console.error = vi.fn();

      hub.emit(createGraphCommittedEvent());

      console.error = originalError;

      expect(global1).toHaveBeenCalledTimes(1);
      expect(global2).toHaveBeenCalledTimes(1);
      expect(global3).toHaveBeenCalledTimes(1);
    });
  });

  describe('Listener management', () => {
    it('should return correct listener count for specific type', () => {
      expect(hub.listenerCount('CompileEnd')).toBe(0);

      hub.on('CompileEnd', () => {});
      expect(hub.listenerCount('CompileEnd')).toBe(1);

      hub.on('CompileEnd', () => {});
      expect(hub.listenerCount('CompileEnd')).toBe(2);

      hub.on('GraphCommitted', () => {});
      expect(hub.listenerCount('CompileEnd')).toBe(2);
    });

    it('should return total listener count when type not specified', () => {
      hub.on('CompileEnd', () => {});
      hub.on('CompileEnd', () => {});
      hub.on('GraphCommitted', () => {});
      hub.subscribe(() => {});
      hub.subscribe(() => {});

      expect(hub.listenerCount()).toBe(5);
    });

    it('should clear all listeners', () => {
      hub.on('CompileEnd', () => {});
      hub.on('GraphCommitted', () => {});
      hub.subscribe(() => {});

      expect(hub.listenerCount()).toBeGreaterThan(0);

      hub.clear();

      expect(hub.listenerCount()).toBe(0);
      expect(hub.listenerCount('CompileEnd')).toBe(0);
      expect(hub.listenerCount('GraphCommitted')).toBe(0);
    });

    it('should handle unsubscribing multiple times safely', () => {
      const handler = vi.fn();
      const unsubscribe = hub.on('CompileEnd', handler);

      unsubscribe();
      unsubscribe();

      expect(hub.listenerCount('CompileEnd')).toBe(0);
    });

    it('should handle emitting when no listeners are registered', () => {
      expect(() => {
        hub.emit(createGraphCommittedEvent());
      }).not.toThrow();
    });
  });

  describe('All event types', () => {
    it('should handle ProgramSwapped event', () => {
      const handler = vi.fn();
      hub.on('ProgramSwapped', handler);

      const event = createProgramSwappedEvent();
      hub.emit(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should handle RuntimeHealthSnapshot event', () => {
      const handler = vi.fn();
      hub.on('RuntimeHealthSnapshot', handler);

      const event = createRuntimeHealthSnapshotEvent();
      hub.emit(event);

      expect(handler).toHaveBeenCalledWith(event);
    });
  });
});
