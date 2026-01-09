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
  createValueStore,
  createFrameCache,
  createRuntimeState,
  createExternalInputs,
  updateSmoothing,
  advanceFrame,
} from './RuntimeState';
export { materialize } from './Materializer';
export {
  executeFrame,
  type RenderFrameIR,
  type RenderPassIR,
} from './ScheduleExecutor';
