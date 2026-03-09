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
  type ShapeBankState,
  type ShapeBankHeaderRecord,
  type ShapeBankHandleMetadata,
  type ContinuityConfig,
  SHAPE_BANK_HEADER_WORDS,
  SHAPE_BANK_NO_CONTROL_POINT_SLOT,
  DEFAULT_SHAPE_BANK_WORD_CAPACITY,
  ShapeBankHeaderWord,
  createValueStore,
  createFrameCache,
  createShapeBank,
  createSessionState,
  createProgramState,
  createRuntimeState,
  createRuntimeStateFromSession,
  extractSessionState,
  createContinuityConfig,
  allocShapeBankWords,
  readShapeBankHeader,
  readShapeBankHandleMetadata,
  writeShapeBankHeader,
  writeShapeBankHandleMetadata,
  resetShapeBankFrameAllocator,
  resetFrameVolatileShapeBank,
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
export { packDrawPrepSinkTableV1, type PackedDrawPrepSinkTableV1 } from './DrawPrepSinkTablePacker';
export {
  DRAW_PREP_SINK_TABLE_V1_VERSION,
  DRAW_PREP_SINK_TABLE_HEADER_WORDS,
  DRAW_PREP_SINK_TABLE_RECORD_WORDS,
  DrawPrepSinkTableHeaderWord,
  DrawPrepSinkTableRecordWord,
  buildDrawPrepSinkTableHeader,
  computeDrawPrepSinkTableWordCapacity,
  drawModeToCode,
  codeToDrawMode,
  readDrawPrepSinkTableHeader,
  writeDrawPrepSinkTableHeader,
  writeDrawPrepSinkRecord,
  type DrawPrepDrawModeCode,
  type DrawPrepSinkRecordV1,
  type DrawPrepSinkTableHeaderV1,
  type DrawPrepSinkTableV1,
} from './DrawPrepSinkTable';
export { assertSchedulePhaseBoundaryStateReads } from './PhaseBoundaryValidator';
export {
  migrateState,
  createInitialState,
  type StateMigrationResult,
  type StateMigrationDetail,
} from './StateMigration';
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
