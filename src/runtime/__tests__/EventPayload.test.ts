/**
 * EventPayload Tests
 *
 * Verifies the EventPayload infrastructure for data-carrying events.
 * Tests the new Map-based event storage alongside legacy boolean flags.
 */

import { describe, it, expect } from 'vitest';
import { createRuntimeState } from '../RuntimeState';
import type { EventPayload } from '../RuntimeState';

describe('EventPayload Infrastructure', () => {
  it('events Map initializes empty', () => {
    const state = createRuntimeState(10, 0, 5, 0);
    expect(state.events).toBeInstanceOf(Map);
    expect(state.events.size).toBe(0);
  });

  it('can push EventPayload to event slot', () => {
    const state = createRuntimeState(10, 0, 5, 0);
    
    // Simulate event firing with payload
    const eventSlot = 2;
    const payload: EventPayload = {
      key: 'test_event',
      value: 42.5,
    };
    
    // Initialize slot array if needed
    if (!state.events.has(eventSlot)) {
      state.events.set(eventSlot, []);
    }
    
    // Push payload (monotone OR: only append, never remove mid-frame)
    state.events.get(eventSlot)!.push(payload);
    
    // Verify payload stored
    const payloads = state.events.get(eventSlot);
    expect(payloads).toBeDefined();
    expect(payloads!.length).toBe(1);
    expect(payloads![0].key).toBe('test_event');
    expect(payloads![0].value).toBe(42.5);
  });

  it('multiple events can fire in same slot (same tick)', () => {
    const state = createRuntimeState(10, 0, 5, 0);
    
    const eventSlot = 1;
    state.events.set(eventSlot, []);
    
    // Fire multiple events in same tick
    state.events.get(eventSlot)!.push({ key: 'evt1', value: 10 });
    state.events.get(eventSlot)!.push({ key: 'evt2', value: 20 });
    state.events.get(eventSlot)!.push({ key: 'evt3', value: 30 });
    
    const payloads = state.events.get(eventSlot)!;
    expect(payloads.length).toBe(3);
    expect(payloads[0].value).toBe(10);
    expect(payloads[1].value).toBe(20);
    expect(payloads[2].value).toBe(30);
  });

  it('clearing events Map reuses allocations', () => {
    const state = createRuntimeState(10, 0, 5, 0);
    
    // Set up some event slots with payloads
    state.events.set(0, [{ key: 'a', value: 1 }]);
    state.events.set(1, [{ key: 'b', value: 2 }]);
    
    // Capture array references before clear
    const array0 = state.events.get(0)!;
    const array1 = state.events.get(1)!;
    
    // Clear like ScheduleExecutor does
    state.events.forEach((payloads) => {
      payloads.length = 0; // Clear array but reuse allocation
    });
    
    // Arrays should be cleared but still exist
    expect(state.events.get(0)).toBe(array0); // Same reference
    expect(state.events.get(1)).toBe(array1);
    expect(array0.length).toBe(0);
    expect(array1.length).toBe(0);
  });

  it('eventScalars and events Map coexist (backward compatibility)', () => {
    const state = createRuntimeState(10, 0, 5, 0);
    
    // Boolean event fires (legacy path)
    state.eventScalars[2] = 1;
    
    // Payload event fires (new path)
    state.events.set(2, [{ key: 'test', value: 100 }]);
    
    // Both should work simultaneously
    expect(state.eventScalars[2]).toBe(1);
    expect(state.events.get(2)![0].value).toBe(100);
    
    // Clear both
    state.eventScalars.fill(0);
    state.events.get(2)!.length = 0;
    
    expect(state.eventScalars[2]).toBe(0);
    expect(state.events.get(2)!.length).toBe(0);
  });

  it('events carry numeric values (float and int)', () => {
    const state = createRuntimeState(10, 0, 5, 0);
    
    state.events.set(0, []);
    
    // Float values
    state.events.get(0)!.push({ key: 'temperature', value: 98.6 });
    state.events.get(0)!.push({ key: 'ratio', value: 0.333 });
    
    // Int values
    state.events.get(0)!.push({ key: 'count', value: 42 });
    state.events.get(0)!.push({ key: 'index', value: -7 });
    
    const payloads = state.events.get(0)!;
    expect(payloads[0].value).toBeCloseTo(98.6, 5);
    expect(payloads[1].value).toBeCloseTo(0.333, 5);
    expect(payloads[2].value).toBe(42);
    expect(payloads[3].value).toBe(-7);
  });

  it('event keys are strings (semantic identifiers)', () => {
    const state = createRuntimeState(10, 0, 5, 0);
    
    state.events.set(0, []);
    
    // Various semantic keys
    state.events.get(0)!.push({ key: 'pulse', value: 1 });
    state.events.get(0)!.push({ key: 'predicate_rising', value: 0 });
    state.events.get(0)!.push({ key: 'combine_any_0', value: 1 });
    
    const payloads = state.events.get(0)!;
    expect(payloads[0].key).toBe('pulse');
    expect(payloads[1].key).toBe('predicate_rising');
    expect(payloads[2].key).toBe('combine_any_0');
  });
});
