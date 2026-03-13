/**
 * Canonical CPU->GPU input header layout.
 *
 * [LAW:one-source-of-truth] Byte and word offsets are defined once here and
 * consumed by marshalling (CPU) and lowering/shaders (GPU).
 */

export const INPUT_HEADER_LAYOUT = {
  totalBytes: 256,
  totalWords: 64,
  fields: {
    TimeSeconds: { byteOffset: 0x00, wordOffset: 0 },
    DeltaTimeSeconds: { byteOffset: 0x04, wordOffset: 1 },
    FrameCount: { byteOffset: 0x08, wordOffset: 2 },
    ResolutionX: { byteOffset: 0x0c, wordOffset: 3 },
    ResolutionY: { byteOffset: 0x10, wordOffset: 4 },
    MouseX: { byteOffset: 0x14, wordOffset: 5 },
    MouseY: { byteOffset: 0x18, wordOffset: 6 },
    MouseButtons: { byteOffset: 0x1c, wordOffset: 7 },
    AudioLow: { byteOffset: 0x20, wordOffset: 8 },
    AudioMid: { byteOffset: 0x24, wordOffset: 9 },
    AudioHigh: { byteOffset: 0x28, wordOffset: 10 },
    GaugeActive: { byteOffset: 0x2c, wordOffset: 11 },
  },
} as const;

export type InputHeaderFieldName = keyof typeof INPUT_HEADER_LAYOUT.fields;
