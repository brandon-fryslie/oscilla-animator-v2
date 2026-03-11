/**
 * Render Contract Types
 *
 * Canonical runtime->renderer boundary for WebGPU execution.
 */

/**
 * Matrix-space camera + viewport contract.
 *
 * Renderer consumes world-space sink-table data and applies ViewProjection in
 * GPU stages. Runtime must not pre-project to screen-space payload fields.
 */
export interface MatrixViewportContract {
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

/**
 * Runtime input signal envelope published to the renderer worker each frame.
 *
 * [LAW:dataflow-not-control-flow] Publication shape is fixed every frame;
 * signal variability lives only in values.
 */
export interface RuntimeInputSignalContract {
  readonly timeMs: number;
  readonly inputMouseX: number;
  readonly inputMouseY: number;
  readonly inputMouseButtons: number;
  readonly inputAudioLow: number;
  readonly inputAudioMid: number;
  readonly inputAudioHigh: number;
  readonly inputGaugeActive: number;
}

/**
 * Canonical draw-prep render boundary.
 *
 * [LAW:one-source-of-truth] Runtime and renderer share one authoritative
 * sink-table contract shape from this module.
 */
export interface DrawPrepRenderContract {
  readonly drawPrepSinkTableV1: Uint32Array;
  readonly drawPrepSinkTableWordCount: number;
}
