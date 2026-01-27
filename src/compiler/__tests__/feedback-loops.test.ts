/**
 * Feedback Loop Tests
 *
 * Tests for cycles in the patch graph using stateful blocks (UnitDelay).
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../compile';
import type { Patch } from '../../graph/Patch';

describe('Feedback Loops with UnitDelay', () => {
  it('compiles simple self-feedback loop', () => {
    // Add block → UnitDelay → feeds back to Add
    const patch: Patch = {
      blocks: [
        {
          id: 'add1',
          type: 'Add',
          label: 'Adder',
          role: 'transform',
          inputPorts: new Map([
            ['a', { direction: 'in', role: 'data' }],
            ['b', { direction: 'in', role: 'data' }],
          ]),
          outputPorts: new Map([
            ['sum', { direction: 'out', role: 'data' }],
          ]),
          params: {},
          position: { x: 0, y: 0 },
        },
        {
          id: 'delay1',
          type: 'UnitDelay',
          label: 'Delay',
          role: 'transform',
          inputPorts: new Map([
            ['in', { direction: 'in', role: 'data' }],
          ]),
          outputPorts: new Map([
            ['out', { direction: 'out', role: 'data' }],
          ]),
          params: { initialValue: 0 },
          position: { x: 100, y: 0 },
        },
        {
          id: 'const1',
          type: 'Const',
          label: 'One',
          role: 'source',
          inputPorts: new Map(),
          outputPorts: new Map([
            ['out', { direction: 'out', role: 'data' }],
          ]),
          params: { value: 1 },
          position: { x: -100, y: 0 },
        },
      ],
      edges: [
        // Const → Add.a
        {
          id: 'e1',
          from: { blockId: 'const1', portId: 'out' },
          to: { blockId: 'add1', portId: 'a' },
          role: 'data',
        },
        // UnitDelay → Add.b (feedback)
        {
          id: 'e2',
          from: { blockId: 'delay1', portId: 'out' },
          to: { blockId: 'add1', portId: 'b' },
          role: 'data',
        },
        // Add → UnitDelay (completes cycle)
        {
          id: 'e3',
          from: { blockId: 'add1', portId: 'sum' },
          to: { blockId: 'delay1', portId: 'in' },
          role: 'data',
        },
      ],
      patchMeta: {
        topLevelRole: 'renderer',
      },
    };

    let result;
    try {
      result = compile(patch);
    } catch (error) {
      console.error('Compilation threw:', error);
      throw error;
    }

    // Should compile successfully
    expect(result).toBeDefined();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.error('Compilation errors:', result.error);
      return;
    }

    // Verify schedule was generated
    expect(result.value.schedule).toBeDefined();
    expect(result.value.schedule.steps.length).toBeGreaterThan(0);

    // Verify blocks were lowered
    const blockIds = new Set(patch.blocks.map(b => b.id));
    for (const blockId of blockIds) {
      expect(result.value.ir).toBeDefined();
      // All blocks should have been processed (no compilation errors)
    }
  });

  it('compiles multi-block feedback loop', () => {
    // A → B → C → UnitDelay → back to A
    const patch: Patch = {
      blocks: [
        {
          id: 'add1',
          type: 'Add',
          label: 'Add1',
          role: 'transform',
          inputPorts: new Map([
            ['a', { direction: 'in', role: 'data' }],
            ['b', { direction: 'in', role: 'data' }],
          ]),
          outputPorts: new Map([
            ['sum', { direction: 'out', role: 'data' }],
          ]),
          params: {},
          position: { x: 0, y: 0 },
        },
        {
          id: 'mul1',
          type: 'Mul',
          label: 'Multiply',
          role: 'transform',
          inputPorts: new Map([
            ['a', { direction: 'in', role: 'data' }],
            ['b', { direction: 'in', role: 'data' }],
          ]),
          outputPorts: new Map([
            ['product', { direction: 'out', role: 'data' }],
          ]),
          params: {},
          position: { x: 100, y: 0 },
        },
        {
          id: 'delay1',
          type: 'UnitDelay',
          label: 'Delay',
          role: 'transform',
          inputPorts: new Map([
            ['in', { direction: 'in', role: 'data' }],
          ]),
          outputPorts: new Map([
            ['out', { direction: 'out', role: 'data' }],
          ]),
          params: { initialValue: 1 },
          position: { x: 200, y: 0 },
        },
        {
          id: 'const1',
          type: 'Const',
          label: 'Two',
          role: 'source',
          inputPorts: new Map(),
          outputPorts: new Map([
            ['out', { direction: 'out', role: 'data' }],
          ]),
          params: { value: 2 },
          position: { x: -100, y: 0 },
        },
      ],
      edges: [
        // Const → Add.a
        {
          id: 'e1',
          from: { blockId: 'const1', portId: 'out' },
          to: { blockId: 'add1', portId: 'a' },
          role: 'data',
        },
        // Add → Mul.a
        {
          id: 'e2',
          from: { blockId: 'add1', portId: 'sum' },
          to: { blockId: 'mul1', portId: 'a' },
          role: 'data',
        },
        // Const → Mul.b
        {
          id: 'e3',
          from: { blockId: 'const1', portId: 'out' },
          to: { blockId: 'mul1', portId: 'b' },
          role: 'data',
        },
        // Mul → UnitDelay
        {
          id: 'e4',
          from: { blockId: 'mul1', portId: 'product' },
          to: { blockId: 'delay1', portId: 'in' },
          role: 'data',
        },
        // UnitDelay → Add.b (completes cycle)
        {
          id: 'e5',
          from: { blockId: 'delay1', portId: 'out' },
          to: { blockId: 'add1', portId: 'b' },
          role: 'data',
        },
      ],
      patchMeta: {
        topLevelRole: 'renderer',
      },
    };

    let result;
    try {
      result = compile(patch);
    } catch (error) {
      console.error('Compilation threw:', error);
      throw error;
    }

    // Should compile successfully
    expect(result).toBeDefined();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.error('Compilation errors:', result.error);
      return;
    }

    // Verify schedule was generated
    expect(result.value.schedule).toBeDefined();
    expect(result.value.schedule.steps.length).toBeGreaterThan(0);
  });

  it('rejects cycle without stateful block', () => {
    // Add → Mul → back to Add (no UnitDelay, illegal cycle)
    const patch: Patch = {
      blocks: [
        {
          id: 'add1',
          type: 'Add',
          label: 'Add',
          role: 'transform',
          inputPorts: new Map([
            ['a', { direction: 'in', role: 'data' }],
            ['b', { direction: 'in', role: 'data' }],
          ]),
          outputPorts: new Map([
            ['sum', { direction: 'out', role: 'data' }],
          ]),
          params: {},
          position: { x: 0, y: 0 },
        },
        {
          id: 'mul1',
          type: 'Mul',
          label: 'Multiply',
          role: 'transform',
          inputPorts: new Map([
            ['a', { direction: 'in', role: 'data' }],
            ['b', { direction: 'in', role: 'data' }],
          ]),
          outputPorts: new Map([
            ['product', { direction: 'out', role: 'data' }],
          ]),
          params: {},
          position: { x: 100, y: 0 },
        },
        {
          id: 'const1',
          type: 'Const',
          label: 'One',
          role: 'source',
          inputPorts: new Map(),
          outputPorts: new Map([
            ['out', { direction: 'out', role: 'data' }],
          ]),
          params: { value: 1 },
          position: { x: -100, y: 0 },
        },
      ],
      edges: [
        // Add → Mul.a
        {
          id: 'e1',
          from: { blockId: 'add1', portId: 'sum' },
          to: { blockId: 'mul1', portId: 'a' },
          role: 'data',
        },
        // Mul → Add.a (illegal cycle)
        {
          id: 'e2',
          from: { blockId: 'mul1', portId: 'product' },
          to: { blockId: 'add1', portId: 'a' },
          role: 'data',
        },
        // Const for Mul.b
        {
          id: 'e3',
          from: { blockId: 'const1', portId: 'out' },
          to: { blockId: 'mul1', portId: 'b' },
          role: 'data',
        },
        // Const for Add.b
        {
          id: 'e4',
          from: { blockId: 'const1', portId: 'out' },
          to: { blockId: 'add1', portId: 'b' },
          role: 'data',
        },
      ],
      patchMeta: {
        topLevelRole: 'renderer',
      },
    };

    let result;
    try {
      result = compile(patch);
    } catch (error) {
      console.error('Compilation threw:', error);
      throw error;
    }

    // Should fail with IllegalCycle error
    expect(result).toBeDefined();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.diagnostics.some(d =>
        d.message.includes('cycle') || d.message.includes('Cycle')
      )).toBe(true);
    }
  });
});
