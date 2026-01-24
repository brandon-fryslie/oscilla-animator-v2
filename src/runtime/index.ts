/**
 * Runtime - IR Program Execution
 *
 * Executes compiled IR programs frame-by-frame.
 */

export { BufferPool, getBufferFormat, type BufferFormat } from './BufferPool';
export {
  type EffectiveTime,
  type TimeState,
  createTimeState,
  resolveTime,
} from './timeResolution';
export {
  type ValueStore,
  type FrameCache,
  type SessionState,
  type ProgramState,
  type RuntimeState,
  type ExternalInputs,
  type ContinuityConfig,
  createValueStore,
  createFrameCache,
  createSessionState,
  createProgramState,
  createRuntimeState,
  createRuntimeStateFromSession,
  extractSessionState,
  createExternalInputs,
  createContinuityConfig,
  updateSmoothing,
  advanceFrame,
} from './RuntimeState';
export { materialize } from './Materializer';
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
  type AssemblerContext,
} from './RenderAssembler';

// Re-export v2 types (now the only types)
export type {
  DrawPathInstancesOp,
  DrawPrimitiveInstancesOp,
  PathGeometry,
  PrimitiveGeometry,
  InstanceTransforms,
  PathStyle,
  RenderFrameIR,
  DrawOp,
} from '../render/types';
