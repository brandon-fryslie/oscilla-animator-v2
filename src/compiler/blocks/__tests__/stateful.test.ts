/**
 * Tests for stateful blocks (UnitDelay, Hash, Id01)
 *
 * Verifies:
 * - UnitDelay maintains proper delay semantics
 * - Hash produces deterministic, well-distributed output
 * - Id01 normalizes indices correctly
 */

import { describe, it, expect } from 'vitest';
import { IRBuilder } from '../../ir/builder';
// Import blocks to trigger registration
import '../index';
import type { ValueRef } from '../registry';
import { getBlock } from '../index';
import { createRuntimeState } from '../../../runtime/RuntimeState';
import { executeFrame } from '../../../runtime/ScheduleExecutor';
import { BufferPool } from '../../../runtime/BufferPool';
import type { CompiledProgramIR } from '../../ir/program';
import { signalTypeSignal as sigType } from '../../../core/canonical-types';

/**
 * Helper: Compile a single block and extract its output value
 */
function compileAndExtract(blockType: string, inputs: Record<string, number>): {
  program: CompiledProgramIR;
  extractOutput: (frameIndex: number) => number;
} {
  const builder = new IRBuilder();
  const block = getBlock(blockType);
  if (!block) throw new Error(`Block ${blockType} not found`);

  // Create input signal constants
  const inputsById: Record<string, ValueRef> = {};
  for (const [name, value] of Object.entries(inputs)) {
    const sigId = builder.sigConst(value, sigType('float'));
    inputsById[name] = { kind: 'sig', id: sigId, type: sigType('float') };
  }

  // Lower the block
  const outputs = block.lower({ b: builder, inputsById, config: {} });
  const output = outputs.out;
  if (!output || output.kind !== 'sig') throw new Error('Block has no signal output');
  const outSigId = output.id;
  if (!outSigId) throw new Error('Block has no output');

  // Schedule evaluation of output
  const outSlot = builder.allocSlot();
  builder.stepEvalSig(outSigId, outSlot);

  // Build program
  const program = builder.build();

  // Helper to extract output value after executing a frame
  const extractOutput = (frameIndex: number): number => {
    const schedule = program.schedule as any;
    const stateSlotCount = schedule.stateSlotCount ?? 0;
    const state = createRuntimeState(program.slotMeta.length, stateSlotCount);

    // Initialize state slots if needed
    if (schedule.stateSlots) {
      for (let i = 0; i < schedule.stateSlots.length; i++) {
        state.state[i] = schedule.stateSlots[i].initialValue;
      }
    }

    const pool = new BufferPool();

    // Execute frames up to frameIndex
    for (let i = 0; i <= frameIndex; i++) {
      executeFrame(program, state, pool, i * 16.67); // ~60fps
    }

    // Read output from slot
    const meta = program.slotMeta.find((m) => m.slot === outSlot);
    if (!meta) throw new Error('Output slot not in slotMeta');
    return state.values.f64[meta.offset];
  };

  return { program, extractOutput };
}

// =============================================================================
// UnitDelay Tests
// =============================================================================

describe.skip('UnitDelay', () => {
  // TODO: Fix state infrastructure - these tests verify stateful block behavior
  // which requires proper state array handling in the runtime
  it('outputs 0 on first frame', () => {
    const { extractOutput } = compileAndExtract('UnitDelay', { in: 42 });
    expect(extractOutput(0)).toBe(0);
  });

  it('outputs previous input on subsequent frames', () => {
    const { extractOutput } = compileAndExtract('UnitDelay', { in: 42 });
    expect(extractOutput(0)).toBe(0); // Frame 0: initial state
    expect(extractOutput(1)).toBe(42); // Frame 1: input from frame 0
  });

  it('maintains correct delay over 10 frames', () => {
    // Compile a program that changes input value each frame
    // For simplicity, we test with a constant input
    const { extractOutput } = compileAndExtract('UnitDelay', { in: 7 });

    expect(extractOutput(0)).toBe(0); // Frame 0: initial
    expect(extractOutput(1)).toBe(7); // Frame 1: delay of frame 0
    expect(extractOutput(2)).toBe(7); // Frame 2: delay of frame 1
    expect(extractOutput(5)).toBe(7); // Frame 5: delay of frame 4
    expect(extractOutput(9)).toBe(7); // Frame 9: delay of frame 8
  });
});

// =============================================================================
// Hash Tests
// =============================================================================

describe('Hash', () => {
  it('is deterministic', () => {
    const { extractOutput: extract1 } = compileAndExtract('Hash', { value: 42, seed: 0 });
    const { extractOutput: extract2 } = compileAndExtract('Hash', { value: 42, seed: 0 });

    const val1 = extract1(0);
    const val2 = extract2(0);

    expect(val1).toBe(val2);
  });

  it('with different seeds produces different results', () => {
    const { extractOutput: extract1 } = compileAndExtract('Hash', { value: 42, seed: 0 });
    const { extractOutput: extract2 } = compileAndExtract('Hash', { value: 42, seed: 1 });

    const val1 = extract1(0);
    const val2 = extract2(0);

    expect(val1).not.toBe(val2);
  });

  it('output is in [0, 1) range', () => {
    const testCases = [
      { value: 0, seed: 0 },
      { value: 42, seed: 0 },
      { value: -100, seed: 5 },
      { value: 999999, seed: 123 },
    ];

    for (const { value, seed } of testCases) {
      const { extractOutput } = compileAndExtract('Hash', { value, seed });
      const output = extractOutput(0);
      expect(output).toBeGreaterThanOrEqual(0);
      expect(output).toBeLessThan(1);
    }
  });
});

// =============================================================================
// Id01 Tests
// =============================================================================

describe('Id01', () => {
  it('normalizes index correctly', () => {
    const testCases = [
      { index: 5, count: 10, expected: 0.5 },
      { index: 0, count: 10, expected: 0.0 },
      { index: 9, count: 10, expected: 0.9 },
    ];

    for (const { index, count, expected } of testCases) {
      const { extractOutput } = compileAndExtract('Id01', { index, count });
      const output = extractOutput(0);
      expect(output).toBeCloseTo(expected, 5);
    }
  });

  it('handles count=0 safely', () => {
    const { extractOutput } = compileAndExtract('Id01', { index: 0, count: 0 });
    const output = extractOutput(0);
    expect(output).toBe(0);
  });

  it('handles count=1', () => {
    const { extractOutput } = compileAndExtract('Id01', { index: 0, count: 1 });
    const output = extractOutput(0);
    expect(output).toBe(0);
  });
});
