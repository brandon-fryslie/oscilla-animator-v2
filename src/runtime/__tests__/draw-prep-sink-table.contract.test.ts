import { describe, expect, it } from 'vitest';
import {
  DRAW_PREP_SINK_DESCRIPTOR_WORDS,
  DrawPrepSinkDescriptorWord,
} from '../DrawPrepSinkTable';
import { RUST_RENDERER_SINK_TABLE_DESCRIPTOR_WORDS } from '../../render/rust/worker-protocol';

describe('draw-prep sink-table descriptor contract', () => {
  it('uses a 14-word descriptor schema with no legacy scale2 entries', () => {
    expect(DRAW_PREP_SINK_DESCRIPTOR_WORDS).toBe(14);
    expect(Object.prototype.hasOwnProperty.call(DrawPrepSinkDescriptorWord, 'Scale2Mode')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(DrawPrepSinkDescriptorWord, 'Scale2BaseOffset')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(DrawPrepSinkDescriptorWord, 'Scale2LaneStride')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(DrawPrepSinkDescriptorWord, 'Scale2ComponentStride')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(DrawPrepSinkDescriptorWord, 'Scale2DefaultXBits')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(DrawPrepSinkDescriptorWord, 'Scale2DefaultYBits')).toBe(false);
  });

  it('keeps TypeScript runtime and rust worker descriptor widths synchronized', () => {
    expect(RUST_RENDERER_SINK_TABLE_DESCRIPTOR_WORDS).toBe(DRAW_PREP_SINK_DESCRIPTOR_WORDS);
  });
});
