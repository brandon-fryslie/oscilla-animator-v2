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
  type RuntimeState,
  type ExternalInputs,
  type ContinuityConfig,
  createValueStore,
  createFrameCache,
  createRuntimeState,
  createExternalInputs,
  createContinuityConfig,
  updateSmoothing,
  advanceFrame,
} from './RuntimeState';
export { materialize } from './Materializer';
export {
  executeFrame,
  type RenderFrameIR,
  type RenderPassIR,
} from './ScheduleExecutor';
export {
  migrateState,
  createInitialState,
  type StateMigrationResult,
  type StateMigrationDetail,
} from './StateMigration';
