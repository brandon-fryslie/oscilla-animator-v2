/**
 * Feedback Loop Tests
 *
 * Tests for cycles in the patch graph using stateful blocks (UnitDelay).
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';

describe('Feedback Loops with UnitDelay', () => {
  it('compiles simple self-feedback loop', () => {
    // Const -> Add.a, UnitDelay -> Add.b (feedback), Add -> UnitDelay
    // This is a phase accumulator: each frame adds 1 to the previous value
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const constBlock = b.addBlock('Const');
      b.setConfig(constBlock, 'value', 1);
      const add = b.addBlock('Add');
      const delay = b.addBlock('UnitDelay');
      b.setConfig(delay, 'initialValue', 0);

      // Const -> Add.a
      b.wire(constBlock, 'out', add, 'a');
      // UnitDelay -> Add.b (feedback)
      b.wire(delay, 'out', add, 'b');
      // Add -> UnitDelay (completes cycle)
      b.wire(add, 'out', delay, 'in');
    });

    const result = compile(patch);

    if (result.kind === 'error') {
      console.error('Compilation errors:', result.errors);
    }

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      // Verify schedule was generated
      expect(result.program.schedule).toBeDefined();
      expect(result.program.schedule.steps.length).toBeGreaterThan(0);
    }
  });

  it('compiles multi-block feedback loop', () => {
    // A longer cycle: Add -> Multiply -> UnitDelay -> back to Add
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const constBlock = b.addBlock('Const');
      b.setConfig(constBlock, 'value', 2);
      const add = b.addBlock('Add');
      const mul = b.addBlock('Multiply');
      const delay = b.addBlock('UnitDelay');
      b.setConfig(delay, 'initialValue', 1);

      // Const -> Add.a
      b.wire(constBlock, 'out', add, 'a');
      // UnitDelay -> Add.b (feedback)
      b.wire(delay, 'out', add, 'b');
      // Add -> Multiply.a
      b.wire(add, 'out', mul, 'a');
      // Const -> Multiply.b
      b.wire(constBlock, 'out', mul, 'b');
      // Multiply -> UnitDelay (completes cycle)
      b.wire(mul, 'out', delay, 'in');
    });

    const result = compile(patch);

    if (result.kind === 'error') {
      console.error('Compilation errors:', result.errors);
    }

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      // Verify schedule was generated
      expect(result.program.schedule).toBeDefined();
      expect(result.program.schedule.steps.length).toBeGreaterThan(0);
    }
  });

  it('rejects cycle without stateful block', () => {
    // Add -> Multiply -> back to Add (no UnitDelay, illegal cycle)
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const constBlock = b.addBlock('Const');
      b.setConfig(constBlock, 'value', 1);
      const add = b.addBlock('Add');
      const mul = b.addBlock('Multiply');

      // Create an illegal cycle: Add -> Multiply -> Add
      b.wire(add, 'out', mul, 'a');
      b.wire(mul, 'out', add, 'a');

      // Wire constants to other inputs
      b.wire(constBlock, 'out', mul, 'b');
      b.wire(constBlock, 'out', add, 'b');
    });

    const result = compile(patch);

    // Should fail with IllegalCycle error
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      const hasCycleError = result.errors.some(e =>
        e.message?.includes('cycle') ||
        e.message?.includes('Cycle') ||
        e.kind === 'IllegalCycle'
      );
      expect(hasCycleError).toBe(true);
    }
  });
});
