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
