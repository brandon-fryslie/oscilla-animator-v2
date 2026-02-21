/**
 * Arena Continuity Write-Through Tests (zdru.6)
 *
 * Verifies that after executeFrame, state.arena contains the continuity-processed
 * output values for every continuityApply outputSlot — matching state.values.objects.
 *
 * [LAW:one-source-of-truth] Arena is the canonical flat buffer. After zdru.6,
 * arena[arenaLayout[outputSlot]] must equal objects.get(outputSlot) every frame.
 * This is what unblocks zdru.3 (RenderAssembler arena reads).
 */
import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { computeStorageSizes } from '../../compiler/ir/program';
import { createRuntimeState } from '../RuntimeState';
import { executeFrame } from '../ScheduleExecutor';
import { arenaSlice } from '../ArenaValueStore';
import { getTestArena } from './test-arena-helper';
import type { Step } from '../../compiler/ir/types';
import '../../blocks/all';

// ── helpers ──────────────────────────────────────────────────────────────────

function compileOk(patch: ReturnType<typeof buildPatch>) {
  const result = compile(patch);
  if (result.kind === 'error') throw new Error(result.errors.map((e) => e.message).join('\n'));
  return result.program;
}

function stateFor(program: ReturnType<typeof compileOk>) {
  const schedule = program.schedule as ScheduleIR;
  const sizes = computeStorageSizes(program.slotMeta);
  return createRuntimeState(
    sizes.f64,
    schedule.stateSlotCount,
    schedule.eventSlotCount ?? 0,
    schedule.eventCount ?? 0,
    program.valueExprs.nodes.length,
    program.arenaTotalFloats,
  );
}

/** Collect { outputSlot, policyKind } from every continuityApply step in the schedule. */
function collectContinuityOutputs(
  program: ReturnType<typeof compileOk>,
): Array<{ outputSlot: number; policyKind: string }> {
  const schedule = program.schedule as ScheduleIR;
  const result: Array<{ outputSlot: number; policyKind: string }> = [];
  for (const step of schedule.steps as readonly Step[]) {
    if (step.kind === 'continuityApply') {
      result.push({
        outputSlot: step.outputSlot as number,
        policyKind: step.policy.kind,
      });
    }
  }
  return result;
}

/** Standard render patch: 4-instance grid layout with position + color continuity targets. */
function makeRenderPatch() {
  return buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');
    const ellipse = b.addBlock('Ellipse');
    b.setPortDefault(ellipse, 'rx', 0.03);
    b.setPortDefault(ellipse, 'ry', 0.03);
    const array = b.addBlock('Array');
    b.setPortDefault(array, 'count', 4);
    const layout = b.addBlock('GridLayoutUV');
    b.setPortDefault(layout, 'rows', 2);
    b.setPortDefault(layout, 'cols', 2);
    const colorSig = b.addBlock('Const');
    b.setConfig(colorSig, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
    const colorField = b.addBlock('Broadcast');
    b.wire(colorSig, 'out', colorField, 'signal');
    const render = b.addBlock('RenderInstances2D');
    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(layout, 'position', render, 'pos');
    b.wire(colorField, 'field', render, 'color');
  });
}

// ── assertion helper ──────────────────────────────────────────────────────────

/**
 * For each continuityApply outputSlot, assert arena matches objects map.
 * Returns number of slots actually verified (must be > 0).
 */
function assertContinuityOutputsInArena(
  program: ReturnType<typeof compileOk>,
  state: ReturnType<typeof stateFor>,
  outputs: Array<{ outputSlot: number; policyKind: string }>,
): number {
  let checked = 0;
  for (const { outputSlot, policyKind } of outputs) {
    const desc = program.arenaLayout[outputSlot];
    if (!desc || desc.offset < 0) continue; // non-arena slot — skip

    const arenaRegion = arenaSlice(state.arena, desc);
    const objectsBuf = state.values.objects.get(outputSlot as any) as Float32Array | undefined;
    if (!objectsBuf || objectsBuf.length === 0) continue;

    const compareLen = Math.min(objectsBuf.length, desc.length);
    for (let i = 0; i < compareLen; i++) {
      expect(arenaRegion[i], `policy=${policyKind} outputSlot=${outputSlot} i=${i}`).toBe(objectsBuf[i]);
    }
    checked++;
  }
  return checked;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('arena continuity write-through (zdru.6)', () => {
  it('frame 1: arena[outputSlot] matches objects map for all continuityApply targets', () => {
    const program = compileOk(makeRenderPatch());
    const state = stateFor(program);
    const outputs = collectContinuityOutputs(program);

    expect(outputs.length).toBeGreaterThan(0);

    executeFrame(program, state, getTestArena(), 0);

    const checked = assertContinuityOutputsInArena(program, state, outputs);
    expect(checked).toBeGreaterThan(0);
  });

  it('frame 2: arena[outputSlot] remains in sync with objects map after slew update', () => {
    const program = compileOk(makeRenderPatch());
    const state = stateFor(program);
    const outputs = collectContinuityOutputs(program);
    expect(outputs.length).toBeGreaterThan(0);

    executeFrame(program, state, getTestArena(), 0);    // frame 1
    executeFrame(program, state, getTestArena(), 100);  // frame 2 (dt=100ms, slew may move)

    const checked = assertContinuityOutputsInArena(program, state, outputs);
    expect(checked).toBeGreaterThan(0);
  });
});
