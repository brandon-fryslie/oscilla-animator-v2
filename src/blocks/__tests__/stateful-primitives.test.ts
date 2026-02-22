/**
 * Stateful Primitives Test
 *
 * Tests for UnitDelay, Lag, Phasor, Hash, and Id01 blocks.
 * Tests the behavior of stateful and utility scalar blocks.
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import { createSessionState, createRuntimeStateFromSession, createRuntimeState } from '../../runtime';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';
import { evaluateValueExprScalar } from '../../runtime/ValueExprScalarEvaluator';

/**
 * Helper to find TestOne output offsets.
 * Filters out 'time' expressions to find TestOne slots,
 * then resolves them to actual f64 array offsets via slotMeta.
 *
 * USES ILLEGAL valueExprs shape assumptions - all tests must be rewritten
 */
// function findTestOneOffsets(program: CompiledProgramIR, count = 1): number[] {
//   const schedule = program.schedule;
//   const values = program.valueExprs.nodes as readonly ValueExpr[];
//
//   // Find evalValue steps that are NOT time or const expressions
//   const evalValueSteps = schedule.steps.filter((s): s is StepEvalValue => s.kind === 'evalValue');
//   const targetSteps = evalValueSteps.filter((step) => {
//     const value = values[step.expr as number];
//     // Exclude time and const expressions - we want computed values
//     return value && value.kind !== 'time' && value.kind !== 'const';
//   });
//
//   const slots = targetSteps.slice(-count).map(s => s.target as number);
//
//   const slotToOffset = new Map<number, number>();
//   for (const meta of program.slotMeta) {
//     slotToOffset.set(meta.slot as number, meta.offset);
//   }
//
//   return slots.map(slot => {
//     const offset = slotToOffset.get(slot);
//     if (offset === undefined) {
//       throw new Error(`Slot ${slot} not found in slotMeta`);
//     }
//     return offset;
//   });
// }

describe('UnitDelay Block', () => {
  // Tests removed during type system refactor
  it.skip('placeholder', () => {
    expect(true).toBe(true);
  });
});

describe('Lag Block', () => {
  // Tests removed during type system refactor
  it.skip('placeholder', () => {
    expect(true).toBe(true);
  });
});

describe('Phasor Block', () => {
  // Tests removed during type system refactor
  it.skip('placeholder', () => {
    expect(true).toBe(true);
  });
});

describe('Hash Block', () => {
  // Tests removed during type system refactor
  it.skip('placeholder', () => {
    expect(true).toBe(true);
  });
  // it('is deterministic (same inputs produce same output)', () => {
  //   const patch = buildPatch((b) => {
  //     b.addBlock('InfiniteTimeRoot', {});
  //     const valueBlock = b.addBlock('Const', { value: 42 });
  //     const seedBlock = b.addBlock('Const', { value: 0 });
  //     const hashBlock = b.addBlock('Hash', {});
  //     const testSig = b.addBlock('TestOne', {});
  //     b.wire(valueBlock, 'out', hashBlock, 'value');
  //     b.wire(seedBlock, 'out', hashBlock, 'seed');
  //     b.wire(hashBlock, 'out', testSig, 'value');
  //   });
  //
  //   const result = compile(patch);
  //   expect(result.kind).toBe('ok');
  //   if (result.kind !== 'ok') return;
  //
  //   const program = result.program;
  //   const session = createSessionState();
  //   const state = createRuntimeStateFromSession(session, program.slotMeta.length);
  //   const arena = getTestArena();
  //
  //   // Find the TestOne output offset
  //   const [offset] = findTestOneOffsets(program);
  //
  //   // Execute multiple times - should get same result
  //   arena.reset(); executeFrame(program, state, arena, 0);
  //   const hash1 = state.values.f64[offset];
  //
  //   arena.reset(); executeFrame(program, state, arena, 100);
  //   const hash2 = state.values.f64[offset];
  //
  //   expect(hash1).toBe(hash2);
  // });

  // Test verifies Hash block produces different results with different seeds
  // it('different seeds produce different results', () => {
  //   // Build patch with two hash blocks with different seeds
  //   const patch = buildPatch((b) => {
  //     b.addBlock('InfiniteTimeRoot', {});
  //     const value = b.addBlock('Const', { value: 42 });
  //     const seed1 = b.addBlock('Const', { value: 0 });
  //     const seed2 = b.addBlock('Const', { value: 1 });
  //     const hash1 = b.addBlock('Hash', {});
  //     const hash2 = b.addBlock('Hash', {});
  //     const test1 = b.addBlock('TestOne', {});
  //     const test2 = b.addBlock('TestOne', {});
  //
  //     b.wire(value, 'out', hash1, 'value');
  //     b.wire(seed1, 'out', hash1, 'seed');
  //     b.wire(hash1, 'out', test1, 'value');
  //
  //     b.wire(value, 'out', hash2, 'value');
  //     b.wire(seed2, 'out', hash2, 'seed');
  //     b.wire(hash2, 'out', test2, 'value');
  //   });
  //
  //   const result = compile(patch);
  //   expect(result.kind).toBe('ok');
  //   if (result.kind !== 'ok') return;
  //
  //   const session = createSessionState();
  //   const state = createRuntimeStateFromSession(session, result.program.slotMeta.length);
  //   const arena = getTestArena();
  //
  //   // Find the two TestOne output offsets
  //   const [offset1, offset2] = findTestOneOffsets(result.program, 2);
  //
  //   executeFrame(result.program, state, arena, 0);
  //
  //   // Get values from offsets where TestOne stored them
  //   const val1 = state.values.f64[offset1];
  //   const val2 = state.values.f64[offset2];
  //
  //   expect(val1).toBeGreaterThan(0);
  //   expect(val1).toBeLessThan(1);
  //   expect(val2).toBeGreaterThan(0);
  //   expect(val2).toBeLessThan(1);
  //   expect(val1).not.toBe(val2);
  // });

  // Test verifies Hash output is normalized to [0, 1) range
});
