import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ENGINE_RS_SOURCE = readFileSync(
  join(__dirname, '../../wasm/rust/oscilla-rust-renderer/src/engine.rs'),
  'utf8',
);

describe('Rust engine isotropic-scale contract', () => {
  it('does not read deprecated scale2 descriptor lanes in canonical draw-prep assembly', () => {
    expect(ENGINE_RS_SOURCE.includes('let scale2_mode = read_sink_word')).toBe(false);
    expect(ENGINE_RS_SOURCE.includes('let scale2_x_from_slot = read_arena_f32')).toBe(false);
    expect(ENGINE_RS_SOURCE.includes('let scale2_y_from_slot = read_arena_f32')).toBe(false);
  });

  it('pins deprecated transform1 scale2 lanes to identity at assembly output', () => {
    expect(ENGINE_RS_SOURCE).toContain('instance_words[base + 4u] = 1.0;');
    expect(ENGINE_RS_SOURCE).toContain('instance_words[base + 5u] = 1.0;');
  });

  it('uses one scalar source for both scale axes in the default vertex path', () => {
    expect(ENGINE_RS_SOURCE).toContain('let rawScale = inst.transform0.z;');
    expect(ENGINE_RS_SOURCE).toContain('let scaleY = scaleX;');
    expect(ENGINE_RS_SOURCE.includes('let rawScaleX = inst.transform0.z * inst.transform1.x;')).toBe(false);
    expect(ENGINE_RS_SOURCE.includes('let rawScaleY = inst.transform0.z * inst.transform1.y;')).toBe(false);
  });
});
