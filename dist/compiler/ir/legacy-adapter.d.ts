/**
 * Legacy Adapter - CompiledProgramIR → IRProgram
 *
 * Provides a compatibility layer that exposes CompiledProgramIR
 * with the legacy IRProgram interface for gradual runtime migration.
 *
 * This adapter will be removed once runtime is fully migrated.
 */
import type { CompiledProgramIR } from './program';
import type { IRProgram, SigExpr, FieldExpr, EventExpr, DomainDef, Step, TimeModel, SigExprId, FieldExprId, EventExprId, DomainId } from './types';
/**
 * LegacyIRProgram - Adapter that implements IRProgram interface
 *
 * Wraps CompiledProgramIR and exposes legacy interface for runtime.
 */
export declare class LegacyIRProgram implements IRProgram {
    readonly timeModel: TimeModel;
    readonly signals: ReadonlyMap<SigExprId, SigExpr>;
    readonly fields: ReadonlyMap<FieldExprId, FieldExpr>;
    readonly events: ReadonlyMap<EventExprId, EventExpr>;
    readonly domains: ReadonlyMap<DomainId, DomainDef>;
    readonly steps: readonly Step[];
    readonly slotCount: number;
    private readonly _compiled;
    constructor(compiled: CompiledProgramIR);
    /**
     * Get the original CompiledProgramIR (for migration purposes)
     */
    getCompiled(): CompiledProgramIR;
}
/**
 * Adapt CompiledProgramIR to legacy IRProgram interface
 */
export declare function adaptToLegacy(compiled: CompiledProgramIR): IRProgram;
