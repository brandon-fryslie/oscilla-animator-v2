/**
 * WebGPU render contract constants.
 *
 * [LAW:one-source-of-truth] Bind group indices, struct strides, and
 * capacity constants shared between JS pipeline code and Rust renderer.
 *
 * NOTE: WGSL shader sources live exclusively in the Rust renderer
 * (default_shaders.rs). The JS-side WGSL template was removed as part
 * of the coordinate system migration (all projection happens via
 * FrameHeader.view_proj in the Rust vertex shader).
 */

export const WEBGPU_RENDER_CONTRACT = Object.freeze({
  sceneUniformFloats: 8,
  sceneUniformBytes: 8 * Float32Array.BYTES_PER_ELEMENT,
  instanceFloats: 12,
  instanceBytes: 12 * Float32Array.BYTES_PER_ELEMENT,
  sceneBindGroup: 0,
  sceneBinding: 0,
  instanceBindGroup: 1,
  instanceBinding: 0,
  topologyBankBindGroup: 2,
  topologyBankBinding: 0,
  topologyBankFlagsWord: 3,
  topologyBankFlagClosed: 1 << 0,
  inputHeaderBytes: 256,
  inputHeaderTimeOffsetBytes: 0x00,
  inputHeaderDeltaTimeOffsetBytes: 0x04,
  inputHeaderFrameCountOffsetBytes: 0x08,
  inputHeaderResolutionXOffsetBytes: 0x0c,
  inputHeaderResolutionYOffsetBytes: 0x10,
  inputHeaderMouseXOffsetBytes: 0x14,
  inputHeaderMouseYOffsetBytes: 0x18,
  inputHeaderMouseButtonsOffsetBytes: 0x1c,
  inputHeaderAudioLowOffsetBytes: 0x20,
  inputHeaderAudioMidOffsetBytes: 0x24,
  inputHeaderAudioHighOffsetBytes: 0x28,
  inputHeaderGaugeActiveOffsetBytes: 0x2c,
  simulationCapacity: 65_536,
  indirectArgsWords: 5,
  indirectArgsBytes: 5 * Uint32Array.BYTES_PER_ELEMENT,
  renderMsaaSampleCount: 4,
} as const);
