import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';

function compileScalarProgram() {
  const patch = buildPatch((b) => {
    const time = b.addBlock('InfiniteTimeRoot');
    b.setPortDefault(time, 'periodAMs', 1000);

    const osc = b.addBlock('Oscillator');
    b.wire(time, 'phaseA', osc, 'phase');

    const c = b.addBlock('Const');
    b.setConfig(c, 'value', 0.5);
    const add = b.addBlock('Add');
    b.wire(osc, 'out', add, 'a');
    b.wire(c, 'out', add, 'b');
  });

  const result = compile(patch);
  if (result.kind !== 'ok') {
    throw new Error(result.errors.map((error) => `[${error.code}] ${error.message}`).join('\n'));
  }
  return result.program;
}

// Legacy-alias and deriveKind source gates live in the canonical guardrail
// suite (architecture-guardrails.test.ts) — one enforcement point per
// invariant. [LAW:single-enforcer]
describe('no-legacy-types gate', () => {
  it('enforces numeric-only runtime storage contract and SoA packing', () => {
    const program = compileScalarProgram();

    // [LAW:one-source-of-truth] Runtime slot ABI is numeric-only for the
    // compiler/runtime contract; no legacy object-shaped storage classes.
    expect(program.runtimeSlots.every((slot) => slot.storage === 'f32' || slot.storage === 'i32' || slot.storage === 'u32')).toBe(true);
    expect(program.slotMeta.every((slot) => slot.storage === 'f32' || slot.storage === 'i32' || slot.storage === 'u32')).toBe(true);

    for (const slot of program.runtimeSlots) {
      expect(slot.type.payload.kind).not.toBe('object');
    }

    // [LAW:one-source-of-truth] P0-1 canonical packing is SoA for runtime slot
    // descriptors; compiler slot planning must not emit AoS descriptors.
    const nonSoaSlots = program.runtimeSlots.filter((slot) => slot.arena.packing !== 'soa');
    expect(nonSoaSlots).toEqual([]);

    // [LAW:single-enforcer] Compiler runtime-slot emission is the boundary that
    // guarantees valid descriptor strides and symbolic IDs for MMU lowering.
    expect(
      program.runtimeSlots.every((slot) =>
        typeof slot.arena.resourceId === 'string'
        && slot.arena.resourceId.length > 0
        && (slot.arena.laneStride ?? 0) >= 1
        && (slot.arena.componentStride ?? 0) >= 1,
      ),
    ).toBe(true);
  });
});
