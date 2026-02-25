/**
 * Runtime - IR Program Execution
 *
 * Executes compiled IR programs frame-by-frame.
 */

export {
  type EffectiveTime,
  type TimeState,
  createTimeState,
  resolveTime,
  reconcilePhaseOffsets,
} from './timeResolution';
export {
  type ValueStore,
  type FrameCache,
  type SessionState,
  type ProgramState,
  type RuntimeState,
  type ContinuityConfig,
  createValueStore,
  createFrameCache,
  createSessionState,
  createProgramState,
  createRuntimeState,
  createRuntimeStateFromSession,
  extractSessionState,
  createContinuityConfig,
  prepareStateWriteBank,
  commitStateWriteBank,
  advanceFrame,
} from './RuntimeState';
export {
  ExternalWriteBus,
  ExternalChannelSnapshot,
  ExternalChannelSystem,
} from './ExternalChannel';
export { executeFrame } from './ScheduleExecutor';
export {
  migrateState,
  createInitialState,
  type StateMigrationResult,
  type StateMigrationDetail,
} from './StateMigration';
export {
  assembleDrawPathInstancesOp,
  assembleRenderFrame,
  projectAndCompact,
  compactAndCopy,
  type AssemblerContext,
} from './RenderAssembler';

// Test-only exports (for integration tests that bypass compile pipeline)
export { materializeValueExpr, type ValueExprTable } from './ValueExprMaterializer';

// Step-through schedule debugger
export { executeFrameStepped } from './executeFrameStepped';
export { StepDebugSession } from './StepDebugSession';
export { getValueExprChildren, walkValueExprTree } from './ValueExprTreeWalker';
export { readSlotValue, readEventSlotValue, detectAnomalies, inspectBlockSlots } from './ValueInspector';
export { getExprAddressTable, type ExprAddressTable, type SlotLookup } from './ExprAddressTable';
export type {
  ExecutionPhase,
  StepSnapshot,
  SlotValue,
  ValueAnomaly,
  Breakpoint,
  SessionMode,
} from './StepDebugTypes';

// Float32 arena (cardinality unification)
export { type ArenaSlotDescriptor, createArena, arenaRead, arenaWrite, arenaSlice } from './ArenaValueStore';

// Re-export v2 types (now the only types)
export type {
  DrawPathInstancesOp,
  PathGeometry,
  InstanceTransforms,
  PathStyle,
  RenderFrameIR,
  DrawOp,
} from '../render/types';
