/**
 * Legacy Adapter - CompiledProgramIR → IRProgram
 *
 * Provides a compatibility layer that exposes CompiledProgramIR
 * with the legacy IRProgram interface for gradual runtime migration.
 *
 * This adapter will be removed once runtime is fully migrated.
 */

import type { CompiledProgramIR } from './program';
import type {
  IRProgram,
  SigExpr,
  FieldExpr,
  EventExpr,
  DomainDef,
  Step,
  TimeModel,
  SigExprId,
  FieldExprId,
  EventExprId,
  DomainId,
} from './types';
import { sigExprId, fieldExprId, eventExprId } from './Indices';

/**
 * LegacyIRProgram - Adapter that implements IRProgram interface
 *
 * Wraps CompiledProgramIR and exposes legacy interface for runtime.
 */
export class LegacyIRProgram implements IRProgram {
  readonly timeModel: TimeModel;
  readonly signals: ReadonlyMap<SigExprId, SigExpr>;
  readonly fields: ReadonlyMap<FieldExprId, FieldExpr>;
  readonly events: ReadonlyMap<EventExprId, EventExpr>;
  readonly domains: ReadonlyMap<DomainId, DomainDef>;
  readonly steps: readonly Step[];
  readonly slotCount: number;

  // Hold reference to original for future use
  private readonly _compiled: CompiledProgramIR;

  constructor(compiled: CompiledProgramIR) {
    this._compiled = compiled;

    // Extract legacy timeModel and domains from schedule
    const schedule = compiled.schedule as any;
    this.timeModel = schedule.timeModel || { kind: 'infinite' as const };
    this.domains = schedule.domains || new Map();
    this.steps = schedule.steps || [];

    // Convert dense arrays back to Maps for legacy runtime
    this.signals = new Map(
      compiled.signalExprs.nodes.map((expr, idx) => [sigExprId(idx), expr])
    );
    this.fields = new Map(
      compiled.fieldExprs.nodes.map((expr, idx) => [fieldExprId(idx), expr])
    );
    this.events = new Map(
      compiled.eventExprs.nodes.map((expr, idx) => [eventExprId(idx), expr])
    );

    // Calculate slot count from slotMeta
    this.slotCount = compiled.slotMeta.length;
  }

  /**
   * Get the original CompiledProgramIR (for migration purposes)
   */
  getCompiled(): CompiledProgramIR {
    return this._compiled;
  }
}

/**
 * Adapt CompiledProgramIR to legacy IRProgram interface
 */
export function adaptToLegacy(compiled: CompiledProgramIR): IRProgram {
  return new LegacyIRProgram(compiled);
}
