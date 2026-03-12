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
  /** Viewport width in physical canvas pixels. */
  readonly width: number;
  /** Viewport height in physical canvas pixels. */
  readonly height: number;
  /** Dimensionless zoom scalar applied by the renderer view transform. */
  readonly zoom: number;
  /** Camera pan offset on X in physical canvas pixels. */
  readonly panX: number;
  /** Camera pan offset on Y in physical canvas pixels. */
  readonly panY: number;
}

/**
 * Runtime input signal envelope published to the renderer worker each frame.
 *
 * [LAW:dataflow-not-control-flow] Publication shape is fixed every frame;
 * signal variability lives only in values.
 */
export interface RuntimeInputSignalContract {
  /** Monotonic runtime timestamp in milliseconds. */
  readonly timeMs: number;
  /** Mouse X in physical canvas pixels (origin: left). */
  readonly inputMouseX: number;
  /** Mouse Y in physical canvas pixels (origin: top). */
  readonly inputMouseY: number;
  /** Mouse button bitmask: bit0=primary, bit1=secondary, bit2=auxiliary. */
  readonly inputMouseButtons: number;
  /** Low-band audio magnitude normalized to [0, 1]. */
  readonly inputAudioLow: number;
  /** Mid-band audio magnitude normalized to [0, 1]. */
  readonly inputAudioMid: number;
  /** High-band audio magnitude normalized to [0, 1]. */
  readonly inputAudioHigh: number;
  /** Application activity gauge normalized to [0, 1]. */
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

export function defineDrawPrepRenderContract(contract: DrawPrepRenderContract): DrawPrepRenderContract {
  // [LAW:one-source-of-truth] Runtime and renderer use this helper to pin
  // contract shape ownership to the canonical boundary module.
  return contract;
}
