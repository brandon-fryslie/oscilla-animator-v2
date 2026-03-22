/**
 * FastPathController — O(1) decoupled control parameter updates.
 *
 * Subscribes to ParamChanged events from EventHub and performs O(1) lookup
 * into the compiled program's fastPathOffsets table. When a match is found,
 * the physical f32 offset is known immediately — no debug index search needed.
 *
 * [LAW:single-enforcer] This is the single boundary for fast-path control writes.
 * PatchStore emits ParamChanged; this controller resolves them to physical offsets.
 *
 * Phase 1: Logs the resolved offset. Phase 2+ will call wasm.update_control().
 */

import type { EventHub } from '../events/EventHub';
import type { ParamChangedEvent } from '../events/types';
import type { CompiledProgramIR } from '../compiler/ir/program';

export interface FastPathControllerDeps {
  readonly eventHub: EventHub;
  readonly getProgram: () => CompiledProgramIR | null;
}

export class FastPathController {
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: FastPathControllerDeps) {}

  /**
   * Start listening for ParamChanged events.
   * Idempotent — calling start() when already started is a no-op.
   */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.deps.eventHub.on('ParamChanged', (event) => {
      this.handleParamChanged(event);
    });
  }

  /**
   * Stop listening. Idempotent.
   */
  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  // [LAW:dataflow-not-control-flow] The lookup always runs; the offset may be
  // undefined (no match), which is the "no-op" data path.
  private handleParamChanged(event: ParamChangedEvent): void {
    const program = this.deps.getProgram();
    if (!program) return;

    const key = `${event.blockId}:${event.paramKey}`;
    const offset = program.fastPathOffsets[key];

    // Phase 1: offset is resolved but no WASM write target exists yet.
    // Phase 2+ will call: wasm.update_control(offset, value)
    if (offset !== undefined) {
      // TODO(phase-2): wasm.update_control(offset, event.newValue)
      void offset;
    }
  }
}
