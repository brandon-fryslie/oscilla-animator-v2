/**
 * Runtime - IR Program Execution
 *
 * Executes compiled IR programs frame-by-frame.
 */
export { BufferPool, getBufferFormat } from './BufferPool';
export { createTimeState, resolveTime, } from './timeResolution';
export { createValueStore, createFrameCache, createRuntimeState, createExternalInputs, updateSmoothing, advanceFrame, } from './RuntimeState';
export { materialize } from './Materializer';
export { executeFrame, } from './ScheduleExecutor';
