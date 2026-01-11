/**
 * Pass 7: Schedule Construction
 *
 * Builds execution schedule with explicit phase ordering:
 * 1. Update rails/time inputs
 * 2. Execute continuous scalars (evalSig)
 * 3. Execute continuous fields (materialize)
 * 4. Apply discrete ops (events)
 * 5. Sinks (render)
 * 6. State writes (stateWrite)
 *
 * The schedule respects data dependencies within each phase and provides
 * deterministic execution order.
 */

import type { Step, TimeModel, DomainId, DomainDef } from '../ir/types';
import type { UnlinkedIRFragments } from './pass6-block-lowering';
import type { AcyclicOrLegalGraph } from '../ir/patches';
import type { TimeModelIR } from '../ir/schedule';

// =============================================================================
// Schedule IR Types
// =============================================================================

/**
 * ScheduleIR - Complete execution schedule
 *
 * Contains everything the runtime needs to execute a frame:
 * - timeModel: Time configuration
 * - domains: Domain definitions (count, etc)
 * - steps: Ordered execution steps
 * - stateSlotCount: Number of persistent state slots
 * - stateSlots: Initial values for state slots
 */
export interface ScheduleIR {
  /** Time model configuration */
  readonly timeModel: TimeModel;

  /** Domain definitions (domain ID → DomainDef) */
  readonly domains: ReadonlyMap<DomainId, DomainDef>;

  /** Ordered execution steps */
  readonly steps: readonly Step[];

  /** Number of persistent state slots */
  readonly stateSlotCount: number;

  /** Initial values for state slots */
  readonly stateSlots: readonly StateSlotDef[];
}

/**
 * State slot definition
 */
export interface StateSlotDef {
  readonly initialValue: number;
}

/**
 * Pass 7: Schedule Construction
 *
 * Builds topologically-ordered execution schedule from unlinked IR fragments.
 *
 * @param unlinkedIR - Block IR fragments from Pass 6
 * @param validated - Validated graph with SCC information
 * @returns Execution schedule with phase ordering
 */
export function pass7Schedule(
  unlinkedIR: UnlinkedIRFragments,
  validated: AcyclicOrLegalGraph
): ScheduleIR {
  // Stub implementation - TODO: Implement full schedule construction
  // For now, return a minimal schedule

  // Convert TimeModelIR to TimeModel
  const timeModel: TimeModel = convertTimeModel(validated.timeModel);

  // TODO: Build domain map from validated.blocks
  const domains = new Map<DomainId, DomainDef>();

  // TODO: Build execution steps from topological order of SCCs
  const steps: Step[] = [];

  // TODO: Count state slots from unlinkedIR
  const stateSlotCount = 0;

  const stateSlots: StateSlotDef[] = [];

  return {
    timeModel,
    domains,
    steps,
    stateSlotCount,
    stateSlots,
  };
}

/**
 * Convert TimeModelIR to TimeModel for schedule.
 */
function convertTimeModel(timeModelIR: TimeModelIR): TimeModel {
  if (timeModelIR.kind === 'finite') {
    return {
      kind: 'finite',
      durationMs: timeModelIR.durationMs,
    };
  }
  return { kind: 'infinite' };
}
