import { WEBGPU_RENDER_CONTRACT } from './shaders';

export interface InputSnapshot {
  readonly timeSeconds: number;
  readonly deltaTimeSeconds: number;
  readonly frameCount: number;
  readonly width: number;
  readonly height: number;
  readonly mouseX: number;
  readonly mouseY: number;
  readonly mouseButtons: number;
  readonly audioLow: number;
  readonly audioMid: number;
  readonly audioHigh: number;
  readonly gaugeActive: number;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class InputService {
  private readonly bytes = new Uint8Array(WEBGPU_RENDER_CONTRACT.inputHeaderBytes);
  private readonly view = new DataView(this.bytes.buffer);

  marshal(input: InputSnapshot): Uint8Array {
    this.bytes.fill(0);

    const width = Math.max(0, finiteOr(input.width, 0));
    const height = Math.max(0, finiteOr(input.height, 0));
    const aspect = height > 0 ? width / height : 1;

    const mouseX01 = clamp(finiteOr(input.mouseX, 0), 0, 1);
    const mouseY01 = clamp(finiteOr(input.mouseY, 0), 0, 1);
    const mouseX = (mouseX01 * 2 - 1) * aspect;
    const mouseY = (1 - mouseY01) * 2 - 1;

    // [LAW:single-enforcer] InputService is the only boundary that serializes
    // CPU frame inputs into the canonical fixed-offset GPU header layout.
    this.view.setFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderTimeOffsetBytes, finiteOr(input.timeSeconds, 0), true);
    this.view.setFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderDeltaTimeOffsetBytes, finiteOr(input.deltaTimeSeconds, 0), true);
    this.view.setFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderFrameCountOffsetBytes, finiteOr(input.frameCount, 0), true);
    this.view.setFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderResolutionXOffsetBytes, width, true);
    this.view.setFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderResolutionYOffsetBytes, height, true);
    this.view.setFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderMouseXOffsetBytes, mouseX, true);
    this.view.setFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderMouseYOffsetBytes, mouseY, true);
    this.view.setUint32(WEBGPU_RENDER_CONTRACT.inputHeaderMouseButtonsOffsetBytes, input.mouseButtons >>> 0, true);
    this.view.setFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderAudioLowOffsetBytes, finiteOr(input.audioLow, 0), true);
    this.view.setFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderAudioMidOffsetBytes, finiteOr(input.audioMid, 0), true);
    this.view.setFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderAudioHighOffsetBytes, finiteOr(input.audioHigh, 0), true);
    this.view.setFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderGaugeActiveOffsetBytes, finiteOr(input.gaugeActive, 0), true);

    return this.bytes;
  }
}
