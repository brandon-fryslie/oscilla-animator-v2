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
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 1 });
      const add = b.addBlock('Add', {});
      const delay = b.addBlock('UnitDelay', { initialValue: 0 });

      // Const -> Add.a
      b.wire(constBlock, 'out', add, 'a');
      // UnitDelay -> Add.b (feedback)
      b.wire(delay, 'out', add, 'b');
      // Add -> UnitDelay (completes cycle)
      b.wire(add, 'sum', delay, 'in');
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
    // A longer cycle: Add -> Mul -> UnitDelay -> back to Add
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 2 });
      const add = b.addBlock('Add', {});
      const mul = b.addBlock('Mul', {});
      const delay = b.addBlock('UnitDelay', { initialValue: 1 });

      // Const -> Add.a
      b.wire(constBlock, 'out', add, 'a');
      // UnitDelay -> Add.b (feedback)
      b.wire(delay, 'out', add, 'b');
      // Add -> Mul.a
      b.wire(add, 'sum', mul, 'a');
      // Const -> Mul.b
      b.wire(constBlock, 'out', mul, 'b');
      // Mul -> UnitDelay (completes cycle)
      b.wire(mul, 'product', delay, 'in');
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
    // Add -> Mul -> back to Add (no UnitDelay, illegal cycle)
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 1 });
      const add = b.addBlock('Add', {});
      const mul = b.addBlock('Mul', {});

      // Create an illegal cycle: Add -> Mul -> Add
      b.wire(add, 'sum', mul, 'a');
      b.wire(mul, 'product', add, 'a');

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
