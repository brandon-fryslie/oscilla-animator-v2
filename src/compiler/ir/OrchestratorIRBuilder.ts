/**
 * OrchestratorIRBuilder Interface - Full Surface for Orchestrator Code
 *
 * This interface extends BlockIRBuilder with imperative operations:
 * - Slot allocation and registration
 * - Schedule step emission
 * - State slot management
 * - Expression resolution/patching
 *
 * ONLY orchestrator code (lower-blocks.ts, binding-pass.ts, combine-utils.ts)
 * should use this interface. Blocks see only BlockIRBuilder.
 */

import type { BlockIRBuilder } from './BlockIRBuilder';
import type { CanonicalType } from '../../core/canonical-types';
import type { BlockId } from '../../types';
import type {
  ValueExprId,
  ValueSlot,
  StateSlotId,
  InstanceId,
} from './Indices';
import type { TimeModelIR } from './schedule';
import type {
  InstanceDecl,
  Step,
  ContinuityPolicy,
  StableStateId,
  StateMapping,
} from './types';
import type { CameraDeclIR } from './program';
import type { ValueExpr } from './value-expr';

// =============================================================================
// OrchestratorIRBuilder Interface (Full/Imperative)
// =============================================================================

/**
 * Full builder interface for orchestrator code.
 * Extends BlockIRBuilder with allocation, registration, and schedule emission.
 */
export interface OrchestratorIRBuilder extends BlockIRBuilder {
  // =========================================================================
  // Slot Allocation & Registration (orchestrator-only)
  // =========================================================================

  /** Allocate a typed slot (stride-aware). */
  allocTypedSlot(type: CanonicalType, label?: string): ValueSlot;

  /** Register a slot's type metadata. */
  registerSlotType(slot: ValueSlot, type: CanonicalType): void;

  /** Register a signal expression -> slot binding. */
  registerSigSlot(sigId: ValueExprId, slot: ValueSlot): void;

  /** Register a field expression -> slot binding. */
  registerFieldSlot(fieldId: ValueExprId, slot: ValueSlot): void;

  /** Allocate a raw slot (stride optional). */
  allocSlot(stride?: number): ValueSlot;

  // =========================================================================
  // Execution Steps (orchestrator-only)
  // =========================================================================

  /** Emit a strided slot write step. */
  stepSlotWriteStrided(slotBase: ValueSlot, inputs: readonly ValueExprId[]): void;

  /** Emit a state write step. */
  stepStateWrite(stateSlot: StateSlotId, value: ValueExprId): void;

  /** Emit a field state write step. */
  stepFieldStateWrite(stateSlot: StateSlotId, value: ValueExprId): void;

  /** Emit a signal evaluation step. */
  stepEvalSig(expr: ValueExprId, target: ValueSlot): void;

  /** Emit a field materialization step. */
  stepMaterialize(field: ValueExprId, instanceId: InstanceId, target: ValueSlot): void;

  /** Emit a continuity map build step. */
  stepContinuityMapBuild(instanceId: InstanceId): void;

  /** Emit a continuity apply step. */
  stepContinuityApply(
    targetKey: string,
    instanceId: InstanceId,
    policy: ContinuityPolicy,
    baseSlot: ValueSlot,
    outputSlot: ValueSlot,
    semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom',
    stride: number
  ): void;

  // =========================================================================
  // State Slots (orchestrator-only)
  // =========================================================================

  /** Allocate a physical state slot. */
  allocStateSlot(
    stableId: StableStateId,
    options?: {
      initialValue?: number;
      stride?: number;
      instanceId?: InstanceId;
      laneCount?: number;
    }
  ): StateSlotId;

  /** Find an already-allocated state slot by symbolic key. */
  findStateSlot(stableId: StableStateId): StateSlotId | undefined;

  // =========================================================================
  // Expression Resolution/Patching (orchestrator-only)
  // =========================================================================

  /**
   * Resolve symbolic state keys to physical slots in all state expressions.
   * Called after state slot allocation to populate ValueExprState.resolvedSlot.
   */
  resolveStateExprs(stateKeyToSlot: ReadonlyMap<string, StateSlotId>): void;

  // =========================================================================
  // Render Globals
  // =========================================================================

  addRenderGlobal(decl: CameraDeclIR): void;
  getRenderGlobals(): readonly CameraDeclIR[];

  // =========================================================================
  // Queries (orchestrator needs these for binding/scheduling)
  // =========================================================================

  getInstances(): ReadonlyMap<InstanceId, InstanceDecl>;
  getSchedule(): TimeModelIR;
  setTimeModel(schedule: TimeModelIR): void;

  getSteps(): readonly Step[];
  getStateMappings(): readonly StateMapping[];
  getStateSlotCount(): number;
  getSlotCount(): number;
  getSlotMetaInputs(): ReadonlyMap<ValueSlot, { readonly type: CanonicalType; readonly stride: number }>;

  /** Get a single value expression by ID. */
  getValueExpr(id: ValueExprId): ValueExpr | undefined;

  /** Get all value expressions. */
  getValueExprs(): readonly ValueExpr[];

  getSigSlots(): ReadonlyMap<number, ValueSlot>;
  getEventSlots(): ReadonlyMap<ValueExprId, any>;
  getEventSlotCount(): number;

  // =========================================================================
  // Debug Provenance Tracking
  // =========================================================================

  /** Set the current block context for expression provenance tracking. */
  setCurrentBlock(blockId: BlockId): void;

  /** Clear the current block context. */
  clearCurrentBlock(): void;

  /** Get the expr→block provenance map built during lowering. */
  getExprToBlock(): ReadonlyMap<ValueExprId, BlockId>;
}
