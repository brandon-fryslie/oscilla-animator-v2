import type { ScheduleIR } from '../compiler/backend/schedule-program';
import type { Step } from '../compiler/ir/types';
import type { CompiledProgramIR } from '../compiler/ir/program';

const PHASE1_GENERATION = 1;
const PHASE2_GENERATION = 2;

function stepGeneration(step: Step): 1 | 2 {
  return step.kind === 'stateWrite' || step.kind === 'fieldStateWrite'
    ? PHASE2_GENERATION
    : PHASE1_GENERATION;
}

/**
 * Validate that a compiled schedule preserves the two-phase ordering contract.
 *
 * This is intentionally called at compile boundary, not per-frame, to keep
 * `executeFrame` free of assertion overhead in the hot path.
 */
export function assertSchedulePhaseBoundaryStateReads(program: CompiledProgramIR): void {
  const schedule = program.schedule as ScheduleIR;
  const steps = schedule.steps;
  let currentGeneration: 1 | 2 = PHASE1_GENERATION;

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    const generation = stepGeneration(step);
    // [LAW:single-enforcer] The compile-boundary validator is the single boundary
    // that enforces phase ordering invariants for schedule step topology.
    if (generation < currentGeneration) {
      throw new Error(
        'Phase-boundary assertion failed: non-state step at index ' +
          stepIndex +
          ' appears after state-write step. Schedule must keep all phase-1 steps before phase-2 writes.',
      );
    }
    currentGeneration = generation;
  }
}
