/**
 * Math Utility Blocks Test
 *
 * Tests for Noise, Length, and Normalize blocks (U-8).
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import { createRuntimeState } from '../../runtime/RuntimeState';
import { BufferPool } from '../../runtime/BufferPool';
import { getBlockDefinition } from '../registry';

describe('Noise Block', () => {
  it('is registered and discoverable', () => {
    const def = getBlockDefinition('Noise');
    expect(def).toBeDefined();
    if (!def) return;
    expect(def.type).toBe('Noise');
    expect(def.category).toBe('math');
    expect(def.capability).toBe('pure');
  });

  it('compiles successfully', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 42 });
      const noiseBlock = b.addBlock('Noise', {});
      const testSignal = b.addBlock('TestSignal', {});
      b.wire(constBlock, 'out', noiseBlock, 'x');
      b.wire(noiseBlock, 'out', testSignal, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
  });

  it('produces deterministic output for same input', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 123.456 });
      const noiseBlock = b.addBlock('Noise', {});
      const testSignal = b.addBlock('TestSignal', {});
      b.wire(constBlock, 'out', noiseBlock, 'x');
      b.wire(noiseBlock, 'out', testSignal, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount || 0);
    const pool = new BufferPool();

    // Find the slot where TestSignal stores the noise output
    const evalSigStep = schedule.steps.filter((s: any) => s.kind === 'evalSig').slice(-1)[0];
    const slot = evalSigStep.target;

    // Run multiple frames - output should be identical
    executeFrame(program, state, pool, 0);
    const output1 = state.values.f64[slot];

    executeFrame(program, state, pool, 16);
    const output2 = state.values.f64[slot];

    executeFrame(program, state, pool, 32);
    const output3 = state.values.f64[slot];

    // Same input should produce same output every time
    expect(output1).toBe(output2);
    expect(output2).toBe(output3);
  });

  it('produces output in range [0, 1)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 999.888 });
      const noiseBlock = b.addBlock('Noise', {});
      const testSignal = b.addBlock('TestSignal', {});
      b.wire(constBlock, 'out', noiseBlock, 'x');
      b.wire(noiseBlock, 'out', testSignal, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount || 0);
    const pool = new BufferPool();

    const evalSigStep = schedule.steps.filter((s: any) => s.kind === 'evalSig').slice(-1)[0];
    const slot = evalSigStep.target;

    executeFrame(program, state, pool, 0);
    const output = state.values.f64[slot];

    // Output should be in [0, 1)
    expect(output).toBeGreaterThanOrEqual(0);
    expect(output).toBeLessThan(1);
  });

  it('produces different outputs for different inputs', () => {
    // Build two separate patches with different constants
    const patch1 = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 10 });
      const noiseBlock = b.addBlock('Noise', {});
      const testSignal = b.addBlock('TestSignal', {});
      b.wire(constBlock, 'out', noiseBlock, 'x');
      b.wire(noiseBlock, 'out', testSignal, 'value');
    });

    const patch2 = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 20 });
      const noiseBlock = b.addBlock('Noise', {});
      const testSignal = b.addBlock('TestSignal', {});
      b.wire(constBlock, 'out', noiseBlock, 'x');
      b.wire(noiseBlock, 'out', testSignal, 'value');
    });

    const result1 = compile(patch1);
    const result2 = compile(patch2);
    expect(result1.kind).toBe('ok');
    expect(result2.kind).toBe('ok');
    if (result1.kind !== 'ok' || result2.kind !== 'ok') return;

    const program1 = result1.program;
    const program2 = result2.program;
    const schedule1 = program1.schedule;
    const schedule2 = program2.schedule;

    const state1 = createRuntimeState(program1.slotMeta.length, schedule1.stateSlotCount || 0);
    const state2 = createRuntimeState(program2.slotMeta.length, schedule2.stateSlotCount || 0);
    const pool = new BufferPool();

    const slot1 = schedule1.steps.find((s: any) => s.kind === 'evalSig').target;
    const slot2 = schedule2.steps.find((s: any) => s.kind === 'evalSig').target;

    executeFrame(program1, state1, pool, 0);
    executeFrame(program2, state2, pool, 0);

    const output1 = state1.values.f64[slot1];
    const output2 = state2.values.f64[slot2];

    // Different inputs should (very likely) produce different outputs
    expect(output1).not.toBe(output2);
  });
});

describe('Length Block', () => {
  it('is registered and discoverable', () => {
    const def = getBlockDefinition('Length');
    expect(def).toBeDefined();
    if (!def) return;
    expect(def.type).toBe('Length');
    expect(def.category).toBe('math');
    expect(def.capability).toBe('pure');
  });

  it('compiles successfully with x and y inputs', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constX = b.addBlock('Const', { value: 3 });
      const constY = b.addBlock('Const', { value: 4 });
      const lengthBlock = b.addBlock('Length', {});
      const testSignal = b.addBlock('TestSignal', {});
      b.wire(constX, 'out', lengthBlock, 'x');
      b.wire(constY, 'out', lengthBlock, 'y');
      b.wire(lengthBlock, 'out', testSignal, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
  });

  it('compiles successfully with x, y, and z inputs', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constX = b.addBlock('Const', { value: 1 });
      const constY = b.addBlock('Const', { value: 2 });
      const constZ = b.addBlock('Const', { value: 2 });
      const lengthBlock = b.addBlock('Length', {});
      const testSignal = b.addBlock('TestSignal', {});
      b.wire(constX, 'out', lengthBlock, 'x');
      b.wire(constY, 'out', lengthBlock, 'y');
      b.wire(constZ, 'out', lengthBlock, 'z');
      b.wire(lengthBlock, 'out', testSignal, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
  });

  it('computes correct magnitude for vec2(3, 4)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constX = b.addBlock('Const', { value: 3 });
      const constY = b.addBlock('Const', { value: 4 });
      const lengthBlock = b.addBlock('Length', {});
      const testSignal = b.addBlock('TestSignal', {});
      b.wire(constX, 'out', lengthBlock, 'x');
      b.wire(constY, 'out', lengthBlock, 'y');
      b.wire(lengthBlock, 'out', testSignal, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount || 0);
    const pool = new BufferPool();

    const evalSigStep = schedule.steps.filter((s: any) => s.kind === 'evalSig').slice(-1)[0];
    const slot = evalSigStep.target;

    executeFrame(program, state, pool, 0);
    const length = state.values.f64[slot];

    // sqrt(3² + 4²) = sqrt(9 + 16) = sqrt(25) = 5
    expect(length).toBeCloseTo(5.0, 5);
  });

  it('computes correct magnitude for vec3(1, 2, 2)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constX = b.addBlock('Const', { value: 1 });
      const constY = b.addBlock('Const', { value: 2 });
      const constZ = b.addBlock('Const', { value: 2 });
      const lengthBlock = b.addBlock('Length', {});
      const testSignal = b.addBlock('TestSignal', {});
      b.wire(constX, 'out', lengthBlock, 'x');
      b.wire(constY, 'out', lengthBlock, 'y');
      b.wire(constZ, 'out', lengthBlock, 'z');
      b.wire(lengthBlock, 'out', testSignal, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount || 0);
    const pool = new BufferPool();

    const evalSigStep = schedule.steps.filter((s: any) => s.kind === 'evalSig').slice(-1)[0];
    const slot = evalSigStep.target;

    executeFrame(program, state, pool, 0);
    const length = state.values.f64[slot];

    // sqrt(1² + 2² + 2²) = sqrt(1 + 4 + 4) = sqrt(9) = 3
    expect(length).toBeCloseTo(3.0, 5);
  });

  it('returns 0 for zero vector', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constX = b.addBlock('Const', { value: 0 });
      const constY = b.addBlock('Const', { value: 0 });
      const lengthBlock = b.addBlock('Length', {});
      const testSignal = b.addBlock('TestSignal', {});
      b.wire(constX, 'out', lengthBlock, 'x');
      b.wire(constY, 'out', lengthBlock, 'y');
      b.wire(lengthBlock, 'out', testSignal, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount || 0);
    const pool = new BufferPool();

    const evalSigStep = schedule.steps.filter((s: any) => s.kind === 'evalSig').slice(-1)[0];
    const slot = evalSigStep.target;

    executeFrame(program, state, pool, 0);
    const length = state.values.f64[slot];

    expect(length).toBe(0);
  });
});

describe('Normalize Block', () => {
  it('is registered and discoverable', () => {
    const def = getBlockDefinition('Normalize');
    expect(def).toBeDefined();
    if (!def) return;
    expect(def.type).toBe('Normalize');
    expect(def.category).toBe('math');
    expect(def.capability).toBe('pure');
  });

  it('compiles successfully', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constX = b.addBlock('Const', { value: 3 });
      const constY = b.addBlock('Const', { value: 4 });
      const normalizeBlock = b.addBlock('Normalize', {});
      const testX = b.addBlock('TestSignal', {});
      const testY = b.addBlock('TestSignal', {});
      const testZ = b.addBlock('TestSignal', {});
      b.wire(constX, 'out', normalizeBlock, 'x');
      b.wire(constY, 'out', normalizeBlock, 'y');
      b.wire(normalizeBlock, 'outX', testX, 'value');
      b.wire(normalizeBlock, 'outY', testY, 'value');
      b.wire(normalizeBlock, 'outZ', testZ, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
  });

  it('produces unit vector for vec2(3, 4)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constX = b.addBlock('Const', { value: 3 });
      const constY = b.addBlock('Const', { value: 4 });
      const normalizeBlock = b.addBlock('Normalize', {});
      const testX = b.addBlock('TestSignal', {});
      const testY = b.addBlock('TestSignal', {});
      const testZ = b.addBlock('TestSignal', {});
      b.wire(constX, 'out', normalizeBlock, 'x');
      b.wire(constY, 'out', normalizeBlock, 'y');
      b.wire(normalizeBlock, 'outX', testX, 'value');
      b.wire(normalizeBlock, 'outY', testY, 'value');
      b.wire(normalizeBlock, 'outZ', testZ, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount || 0);
    const pool = new BufferPool();

    // Find all evalSig steps (3 TestSignal blocks)
    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig').slice(-3);
    expect(evalSigSteps.length).toBe(3);
    const slots = evalSigSteps.map((s: any) => s.target);

    executeFrame(program, state, pool, 0);

    // Get the three output values
    const values = slots.map((slot: number) => state.values.f64[slot]);

    // Find which values correspond to x, y, z (normalized (3, 4) = (0.6, 0.8, 0))
    // We expect to find approximately 0.6, 0.8, and 0
    const hasX = values.some((v: number) => Math.abs(v - 0.6) < 0.0001);
    const hasY = values.some((v: number) => Math.abs(v - 0.8) < 0.0001);
    const hasZ = values.some((v: number) => v === 0);

    expect(hasX).toBe(true);
    expect(hasY).toBe(true);
    expect(hasZ).toBe(true);
  });

  it('produces unit vector for vec3(1, 2, 2)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constX = b.addBlock('Const', { value: 1 });
      const constY = b.addBlock('Const', { value: 2 });
      const constZ = b.addBlock('Const', { value: 2 });
      const normalizeBlock = b.addBlock('Normalize', {});
      const testX = b.addBlock('TestSignal', {});
      const testY = b.addBlock('TestSignal', {});
      const testZ = b.addBlock('TestSignal', {});
      b.wire(constX, 'out', normalizeBlock, 'x');
      b.wire(constY, 'out', normalizeBlock, 'y');
      b.wire(constZ, 'out', normalizeBlock, 'z');
      b.wire(normalizeBlock, 'outX', testX, 'value');
      b.wire(normalizeBlock, 'outY', testY, 'value');
      b.wire(normalizeBlock, 'outZ', testZ, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount || 0);
    const pool = new BufferPool();

    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig').slice(-3);
    const slots = evalSigSteps.map((s: any) => s.target);

    executeFrame(program, state, pool, 0);

    const values = slots.map((slot: number) => state.values.f64[slot]);

    // Normalized (1, 2, 2) = (1/3, 2/3, 2/3)
    const has1over3 = values.some((v: number) => Math.abs(v - 1/3) < 0.0001);
    const has2over3Count = values.filter((v: number) => Math.abs(v - 2/3) < 0.0001).length;

    expect(has1over3).toBe(true);
    expect(has2over3Count).toBe(2);  // Should have two values that are 2/3
  });

  it('handles zero vector without NaN or Inf', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constX = b.addBlock('Const', { value: 0 });
      const constY = b.addBlock('Const', { value: 0 });
      const normalizeBlock = b.addBlock('Normalize', {});
      const testX = b.addBlock('TestSignal', {});
      const testY = b.addBlock('TestSignal', {});
      const testZ = b.addBlock('TestSignal', {});
      b.wire(constX, 'out', normalizeBlock, 'x');
      b.wire(constY, 'out', normalizeBlock, 'y');
      b.wire(normalizeBlock, 'outX', testX, 'value');
      b.wire(normalizeBlock, 'outY', testY, 'value');
      b.wire(normalizeBlock, 'outZ', testZ, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount || 0);
    const pool = new BufferPool();

    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig').slice(-3);
    const slots = evalSigSteps.map((s: any) => s.target);

    executeFrame(program, state, pool, 0);

    const values = slots.map((slot: number) => state.values.f64[slot]);

    // Zero vector normalized should produce (0, 0, 0) not NaN
    // Due to epsilon guard, we divide by epsilon instead of zero
    // So we get 0/epsilon = 0
    for (const value of values) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThan(0.0001); // Close to zero
    }
  });

  it('output has magnitude approximately 1.0 for non-zero input', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constX = b.addBlock('Const', { value: 7 });
      const constY = b.addBlock('Const', { value: 9 });
      const normalizeBlock = b.addBlock('Normalize', {});
      const testX = b.addBlock('TestSignal', {});
      const testY = b.addBlock('TestSignal', {});
      const testZ = b.addBlock('TestSignal', {});
      b.wire(constX, 'out', normalizeBlock, 'x');
      b.wire(constY, 'out', normalizeBlock, 'y');
      b.wire(normalizeBlock, 'outX', testX, 'value');
      b.wire(normalizeBlock, 'outY', testY, 'value');
      b.wire(normalizeBlock, 'outZ', testZ, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount || 0);
    const pool = new BufferPool();

    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig').slice(-3);
    const slots = evalSigSteps.map((s: any) => s.target);

    executeFrame(program, state, pool, 0);

    const values = slots.map((slot: number) => state.values.f64[slot]);

    // Find the three values that should be the normalized components
    // We expect 3 values from Normalize (x, y, z)
    // For vec2 input (7, 9, 0), magnitude should be ~1.0
    const x = values[0];
    const y = values[1];
    const z = values[2];

    // Compute magnitude: sqrt(x² + y² + z²)
    const magnitude = Math.sqrt(x * x + y * y + z * z);

    // Should be approximately 1.0 (unit vector)
    expect(magnitude).toBeCloseTo(1.0, 5);
  });
});
