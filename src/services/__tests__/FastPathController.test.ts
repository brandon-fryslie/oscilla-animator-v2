import { describe, it, expect } from 'vitest';
import { EventHub } from '../../events/EventHub';
import { FastPathController } from '../FastPathController';
import type { CompiledProgramIR } from '../../compiler/ir/program';

function makeProgram(offsets: Record<string, number>): CompiledProgramIR {
  return { fastPathOffsets: offsets } as unknown as CompiledProgramIR;
}

describe('FastPathController', () => {
  it('resolves O(1) offset on ParamChanged', () => {
    const hub = new EventHub();
    const program = makeProgram({ 'block1:freq': 42 });
    const ctrl = new FastPathController({
      eventHub: hub,
      getProgram: () => program,
    });
    ctrl.start();

    // Emitting should not throw — Phase 1 is a no-op write
    hub.emit({
      type: 'ParamChanged',
      patchId: 'p0',
      patchRevision: 1,
      blockId: 'block1',
      blockType: 'Oscillator',
      paramKey: 'freq',
      oldValue: 1,
      newValue: 2,
    });

    ctrl.stop();
  });

  it('is a no-op when no program is loaded', () => {
    const hub = new EventHub();
    const ctrl = new FastPathController({
      eventHub: hub,
      getProgram: () => null,
    });
    ctrl.start();

    // Should not throw
    hub.emit({
      type: 'ParamChanged',
      patchId: 'p0',
      patchRevision: 1,
      blockId: 'block1',
      blockType: 'Oscillator',
      paramKey: 'freq',
      oldValue: 1,
      newValue: 2,
    });

    ctrl.stop();
  });

  it('is a no-op when key has no fast-path offset', () => {
    const hub = new EventHub();
    const program = makeProgram({ 'block1:freq': 42 });
    const ctrl = new FastPathController({
      eventHub: hub,
      getProgram: () => program,
    });
    ctrl.start();

    // Different key — no match
    hub.emit({
      type: 'ParamChanged',
      patchId: 'p0',
      patchRevision: 1,
      blockId: 'block1',
      blockType: 'Oscillator',
      paramKey: 'amplitude',
      oldValue: 1,
      newValue: 2,
    });

    ctrl.stop();
  });

  it('stop() unsubscribes from events', () => {
    const hub = new EventHub();
    let callCount = 0;
    const program = makeProgram({ 'b:p': 0 });

    // Spy: wrap getProgram to count calls
    const ctrl = new FastPathController({
      eventHub: hub,
      getProgram: () => { callCount++; return program; },
    });
    ctrl.start();
    hub.emit({
      type: 'ParamChanged',
      patchId: 'p0',
      patchRevision: 1,
      blockId: 'b',
      blockType: 'T',
      paramKey: 'p',
      oldValue: 0,
      newValue: 1,
    });
    expect(callCount).toBe(1);

    ctrl.stop();
    hub.emit({
      type: 'ParamChanged',
      patchId: 'p0',
      patchRevision: 1,
      blockId: 'b',
      blockType: 'T',
      paramKey: 'p',
      oldValue: 1,
      newValue: 2,
    });
    // Should not have been called again
    expect(callCount).toBe(1);
  });

  it('start() is idempotent', () => {
    const hub = new EventHub();
    let callCount = 0;
    const program = makeProgram({ 'b:p': 0 });
    const ctrl = new FastPathController({
      eventHub: hub,
      getProgram: () => { callCount++; return program; },
    });

    ctrl.start();
    ctrl.start(); // second call should be no-op

    hub.emit({
      type: 'ParamChanged',
      patchId: 'p0',
      patchRevision: 1,
      blockId: 'b',
      blockType: 'T',
      paramKey: 'p',
      oldValue: 0,
      newValue: 1,
    });

    // Only one subscription, so only one call
    expect(callCount).toBe(1);
    ctrl.stop();
  });
});
