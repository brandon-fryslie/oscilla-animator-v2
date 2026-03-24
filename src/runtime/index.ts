/**
 * Runtime - IR Program Execution
 *
 * Executes compiled IR programs frame-by-frame.
 */

function runtimePublicSurfaceVersion(): string {
  // [LAW:one-source-of-truth] Runtime public exports are versioned through one canonical tag.
  return 'canonical-v2.5';
}

export const RUNTIME_PUBLIC_SURFACE_VERSION = runtimePublicSurfaceVersion();

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
export {
  assertSchedulePhaseBoundaryStateReads,
} from './PhaseBoundaryValidator';
export {
  migrateState,
  createInitialState,
  type StateMigrationResult,
  type StateMigrationDetail,
} from './StateMigration';
// Test-only exports (for integration tests that bypass compile pipeline)
export { materializeValueExpr, type ValueExprTable } from './ValueExprMaterializer';
export { packDrawPrepSinkTableV1 } from './DrawPrepSinkTablePacker';

// Step-through schedule debugger
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
