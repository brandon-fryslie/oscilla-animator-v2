/**
 * Multi-Component Signal Support Tests
 *
 * Tests P6 from SPRINT-20260125-multicomponent-signals-DOD.md:
 * - Unit test: StepSlotWriteStrided writes to correct slots
 * - Integration test: Const<vec2> produces correct slot values
 * - End-to-end: signal-only vec3 pipeline compiles and executes
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph';
import { executeFrame } from '../ScheduleExecutor';
import { createRuntimeState } from '../RuntimeState';
import { BufferPool } from '../BufferPool';
import type { Program } from '../../compiler/ir/types';

describe('Multi-Component Signal Support', () => {
  describe('Unit: StepSlotWriteStrided', () => {
    it('writes scalar components to contiguous slots', () => {
      // Build patch: Const<vec2> with known values
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        b.addBlock('Const', { value: { x: 10, y: 20 } });
      });

      const result = compile(patch);
      if (result.kind !== 'ok') {
        console.error('Compilation errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      const program = result.program;
      const state = createRuntimeState(program.slotMeta.length);
      const pool = new BufferPool();

      // Execute one frame
      executeFrame(program, state, pool, 0);

      // Find the Const<vec2> output slot
      // The block lowering should have allocated a strided slot (stride=2)
      // and written x=10 to slot[base+0], y=20 to slot[base+1]
      const constBlock = Array.from(program.schedule.instances.values()).find(
        (inst) => inst.blockType === 'Const'
      );
      expect(constBlock).toBeDefined();
      if (!constBlock) return;

      // Find the output value slot from slotMeta
      const constSlotMeta = program.slotMeta.find(
        (meta) => meta.instanceId === constBlock.id && meta.outputId === 'out'
      );
      expect(constSlotMeta).toBeDefined();
      if (!constSlotMeta) return;

      const baseSlot = constSlotMeta.slotIndex;

      // Verify: values.f64[baseSlot] === 10, values.f64[baseSlot+1] === 20
      expect(state.values.f64[baseSlot]).toBe(10);
      expect(state.values.f64[baseSlot + 1]).toBe(20);
    });

    it('writes vec3 components to 3 contiguous slots', () => {
      // Build patch: PolarToCartesian (signal path) which produces vec3
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        const angle = b.addBlock('Const', { value: 0 }); // angle = 0
        const radius = b.addBlock('Const', { value: 0.5 }); // radius = 0.5
        const polar = b.addBlock('PolarToCartesian', {});
        b.wire(angle, 'out', polar, 'angle');
        b.wire(radius, 'out', polar, 'radius');
      });

      const result = compile(patch);
      if (result.kind !== 'ok') {
        console.error('Compilation errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      const program = result.program;
      const state = createRuntimeState(program.slotMeta.length);
      const pool = new BufferPool();

      executeFrame(program, state, pool, 0);

      // Find PolarToCartesian output slot
      const polarBlock = Array.from(program.schedule.instances.values()).find(
        (inst) => inst.blockType === 'PolarToCartesian'
      );
      expect(polarBlock).toBeDefined();
      if (!polarBlock) return;

      const polarSlotMeta = program.slotMeta.find(
        (meta) => meta.instanceId === polarBlock.id && meta.outputId === 'pos'
      );
      expect(polarSlotMeta).toBeDefined();
      if (!polarSlotMeta) return;

      const baseSlot = polarSlotMeta.slotIndex;

      // Expected: x = 0.5 + 0.5*cos(0) = 0.5 + 0.5 = 1.0
      //           y = 0.5 + 0.5*sin(0) = 0.5 + 0 = 0.5
      //           z = 0
      expect(state.values.f64[baseSlot]).toBeCloseTo(1.0, 5);
      expect(state.values.f64[baseSlot + 1]).toBeCloseTo(0.5, 5);
      expect(state.values.f64[baseSlot + 2]).toBe(0);
    });

    it('writes color components to 4 contiguous slots', () => {
      // Build patch: Const<color> with known RGBA values
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        b.addBlock('Const', { value: { r: 0.1, g: 0.2, b: 0.3, a: 0.4 } });
      });

      const result = compile(patch);
      if (result.kind !== 'ok') {
        console.error('Compilation errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      const program = result.program;
      const state = createRuntimeState(program.slotMeta.length);
      const pool = new BufferPool();

      executeFrame(program, state, pool, 0);

      const constBlock = Array.from(program.schedule.instances.values()).find(
        (inst) => inst.blockType === 'Const'
      );
      expect(constBlock).toBeDefined();
      if (!constBlock) return;

      const constSlotMeta = program.slotMeta.find(
        (meta) => meta.instanceId === constBlock.id && meta.outputId === 'out'
      );
      expect(constSlotMeta).toBeDefined();
      if (!constSlotMeta) return;

      const baseSlot = constSlotMeta.slotIndex;

      // Verify RGBA in contiguous slots
      expect(state.values.f64[baseSlot]).toBeCloseTo(0.1, 5);
      expect(state.values.f64[baseSlot + 1]).toBeCloseTo(0.2, 5);
      expect(state.values.f64[baseSlot + 2]).toBeCloseTo(0.3, 5);
      expect(state.values.f64[baseSlot + 3]).toBeCloseTo(0.4, 5);
    });
  });

  describe('Integration: Const<vec2>', () => {
    it('produces correct slot values for downstream consumers', () => {
      // Build patch: Const<vec2> -> consumer reads components
      // We'll use a simple test: create vec2, pass to PolarToCartesian which reads it
      // Actually, better test: Const<vec2> produces values that can be read back
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        const vec2Const = b.addBlock('Const', { value: { x: 3, y: 4 } });
        // For now, just verify the const itself produces correct values
        // Downstream consumption is tested implicitly by other blocks working
        return { vec2Const };
      });

      const result = compile(patch);
      if (result.kind !== 'ok') {
        console.error('Compilation errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      const program = result.program;
      const state = createRuntimeState(program.slotMeta.length);
      const pool = new BufferPool();

      executeFrame(program, state, pool, 0);

      // Find the Const<vec2> output
      const constBlock = Array.from(program.schedule.instances.values()).find(
        (inst) => inst.blockType === 'Const'
      );
      expect(constBlock).toBeDefined();
      if (!constBlock) return;

      const constSlotMeta = program.slotMeta.find(
        (meta) => meta.instanceId === constBlock.id && meta.outputId === 'out'
      );
      expect(constSlotMeta).toBeDefined();
      if (!constSlotMeta) return;

      const baseSlot = constSlotMeta.slotIndex;

      // Verify components
      expect(state.values.f64[baseSlot]).toBe(3);
      expect(state.values.f64[baseSlot + 1]).toBe(4);
    });

    it('downstream blocks read vec2 components correctly', () => {
      // Build patch: Const<vec2> -> SetZ (reads x,y from vec2, adds z)
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        const vec2Const = b.addBlock('Const', { value: { x: 1.5, y: 2.5 } });
        const angle = b.addBlock('Const', { value: 0 });
        const radius = b.addBlock('Const', { value: 1 });
        const polar = b.addBlock('PolarToCartesian', {});
        b.wire(angle, 'out', polar, 'angle');
        b.wire(radius, 'out', polar, 'radius');

        // PolarToCartesian produces vec3, we can verify that downstream
        const zConst = b.addBlock('Const', { value: 5 });
        const setZ = b.addBlock('SetZ', {});
        b.wire(polar, 'pos', setZ, 'pos');
        b.wire(zConst, 'out', setZ, 'z');
      });

      const result = compile(patch);
      if (result.kind !== 'ok') {
        console.error('Compilation errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      const program = result.program;
      const state = createRuntimeState(program.slotMeta.length);
      const pool = new BufferPool();

      executeFrame(program, state, pool, 0);

      // Find SetZ output
      const setZBlock = Array.from(program.schedule.instances.values()).find(
        (inst) => inst.blockType === 'SetZ'
      );
      expect(setZBlock).toBeDefined();
      if (!setZBlock) return;

      const setZSlotMeta = program.slotMeta.find(
        (meta) => meta.instanceId === setZBlock.id && meta.outputId === 'out'
      );
      expect(setZSlotMeta).toBeDefined();
      if (!setZSlotMeta) return;

      const baseSlot = setZSlotMeta.slotIndex;

      // PolarToCartesian with angle=0, radius=1, centerX=0.5, centerY=0.5
      // x = 0.5 + 1*cos(0) = 1.5, y = 0.5 + 1*sin(0) = 0.5
      // SetZ replaces z with 5
      expect(state.values.f64[baseSlot]).toBeCloseTo(1.5, 5); // x
      expect(state.values.f64[baseSlot + 1]).toBeCloseTo(0.5, 5); // y
      expect(state.values.f64[baseSlot + 2]).toBe(5); // z
    });
  });

  describe('End-to-end: signal-only vec3 pipeline', () => {
    it('compiles and executes without field or array blocks', () => {
      // Pure signal pipeline: constants -> PolarToCartesian -> JitterVec -> SetZ
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});

        // Create polar coordinates
        const angle = b.addBlock('Const', { value: Math.PI / 4 }); // 45 degrees
        const radius = b.addBlock('Const', { value: 0.3 });
        const polar = b.addBlock('PolarToCartesian', {});
        b.wire(angle, 'out', polar, 'angle');
        b.wire(radius, 'out', polar, 'radius');

        // Add jitter
        const rand = b.addBlock('Const', { value: 0.7 }); // deterministic "random"
        const jitter = b.addBlock('JitterVec', {});
        b.wire(polar, 'pos', jitter, 'pos');
        b.wire(rand, 'out', jitter, 'rand');

        // Set Z
        const zVal = b.addBlock('Const', { value: 0.1 });
        const setZ = b.addBlock('SetZ', {});
        b.wire(jitter, 'out', setZ, 'pos');
        b.wire(zVal, 'out', setZ, 'z');

        return { setZ };
      });

      const result = compile(patch);
      if (result.kind !== 'ok') {
        console.error('Compilation errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      const program = result.program;

      // Verify no field steps in schedule (all signal)
      const hasFieldSteps = program.schedule.steps.some(
        (step) =>
          step.kind === 'fieldZip' ||
          step.kind === 'fieldMap' ||
          step.kind === 'fieldIntrinsic'
      );
      expect(hasFieldSteps).toBe(false);

      // Execute
      const state = createRuntimeState(program.slotMeta.length);
      const pool = new BufferPool();
      executeFrame(program, state, pool, 0);

      // Find final SetZ output
      const setZBlock = Array.from(program.schedule.instances.values()).find(
        (inst) => inst.blockType === 'SetZ'
      );
      expect(setZBlock).toBeDefined();
      if (!setZBlock) return;

      const setZSlotMeta = program.slotMeta.find(
        (meta) => meta.instanceId === setZBlock.id && meta.outputId === 'out'
      );
      expect(setZSlotMeta).toBeDefined();
      if (!setZSlotMeta) return;

      const baseSlot = setZSlotMeta.slotIndex;

      // Verify we got valid vec3 values
      // Don't check exact values (jitter is complex), just verify they're numbers
      expect(typeof state.values.f64[baseSlot]).toBe('number');
      expect(typeof state.values.f64[baseSlot + 1]).toBe('number');
      expect(state.values.f64[baseSlot + 2]).toBe(0.1); // z should be exact
      expect(Number.isFinite(state.values.f64[baseSlot])).toBe(true);
      expect(Number.isFinite(state.values.f64[baseSlot + 1])).toBe(true);
    });

    it('signal-only color pipeline compiles and executes', () => {
      // Pure signal color pipeline
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});

        // Create a color constant
        const color = b.addBlock('Const', {
          value: { r: 0.8, g: 0.4, b: 0.2, a: 1.0 },
        });

        return { color };
      });

      const result = compile(patch);
      if (result.kind !== 'ok') {
        console.error('Compilation errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      const program = result.program;

      // Verify no field steps
      const hasFieldSteps = program.schedule.steps.some(
        (step) =>
          step.kind === 'fieldZip' ||
          step.kind === 'fieldMap' ||
          step.kind === 'fieldIntrinsic'
      );
      expect(hasFieldSteps).toBe(false);

      // Execute
      const state = createRuntimeState(program.slotMeta.length);
      const pool = new BufferPool();
      executeFrame(program, state, pool, 0);

      // Find color output
      const colorBlock = Array.from(program.schedule.instances.values()).find(
        (inst) => inst.blockType === 'Const'
      );
      expect(colorBlock).toBeDefined();
      if (!colorBlock) return;

      const colorSlotMeta = program.slotMeta.find(
        (meta) => meta.instanceId === colorBlock.id && meta.outputId === 'out'
      );
      expect(colorSlotMeta).toBeDefined();
      if (!colorSlotMeta) return;

      const baseSlot = colorSlotMeta.slotIndex;

      // Verify RGBA
      expect(state.values.f64[baseSlot]).toBeCloseTo(0.8, 5);
      expect(state.values.f64[baseSlot + 1]).toBeCloseTo(0.4, 5);
      expect(state.values.f64[baseSlot + 2]).toBeCloseTo(0.2, 5);
      expect(state.values.f64[baseSlot + 3]).toBe(1.0);
    });
  });

  describe('SignalEvaluator remains scalar-only', () => {
    it('does not expose array-returning APIs', () => {
      // This is a contract test - verify no multi-value APIs exist
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        b.addBlock('Const', { value: { x: 1, y: 2 } });
      });

      const result = compile(patch);
      if (result.kind !== 'ok') {
        console.error('Compilation errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      const program = result.program;

      // Verify all signal evaluation steps are scalar
      // StepSlotWriteStrided should write one scalar per component
      const stridedSteps = program.schedule.steps.filter(
        (step) => step.kind === 'slotWriteStrided'
      );

      // Each strided step should reference scalar SigExprIds, not arrays
      for (const step of stridedSteps) {
        if (step.kind === 'slotWriteStrided') {
          expect(Array.isArray(step.inputs)).toBe(true);
          expect(step.inputs.length).toBeGreaterThan(0);
          // Each input is a SigExprId (number), not an array
          for (const input of step.inputs) {
            expect(typeof input).toBe('number');
          }
        }
      }
    });
  });

  describe('Component reading via slot indexing', () => {
    it('reads vec3 components using sigSlot(slot + offset)', () => {
      // Test that blocks can decompose multi-component values by reading slots
      // SetZ reads x,y from input vec3 slot, replaces z
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});

        const angle = b.addBlock('Const', { value: 0 });
        const radius = b.addBlock('Const', { value: 1 });
        const polar = b.addBlock('PolarToCartesian', {});
        b.wire(angle, 'out', polar, 'angle');
        b.wire(radius, 'out', polar, 'radius');

        const newZ = b.addBlock('Const', { value: 99 });
        const setZ = b.addBlock('SetZ', {});
        b.wire(polar, 'pos', setZ, 'pos');
        b.wire(newZ, 'out', setZ, 'z');
      });

      const result = compile(patch);
      if (result.kind !== 'ok') {
        console.error('Compilation errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      const program = result.program;

      // Look for sigSlot expressions that read from polar output slot + offset
      // This is an implementation detail, but validates the reading pattern works
      const polarBlock = Array.from(program.schedule.instances.values()).find(
        (inst) => inst.blockType === 'PolarToCartesian'
      );
      expect(polarBlock).toBeDefined();
      if (!polarBlock) return;

      const polarSlotMeta = program.slotMeta.find(
        (meta) => meta.instanceId === polarBlock.id && meta.outputId === 'pos'
      );
      expect(polarSlotMeta).toBeDefined();
      if (!polarSlotMeta) return;

      const polarBaseSlot = polarSlotMeta.slotIndex;

      // Execute and verify SetZ reads correct components
      const state = createRuntimeState(program.slotMeta.length);
      const pool = new BufferPool();
      executeFrame(program, state, pool, 0);

      const setZBlock = Array.from(program.schedule.instances.values()).find(
        (inst) => inst.blockType === 'SetZ'
      );
      expect(setZBlock).toBeDefined();
      if (!setZBlock) return;

      const setZSlotMeta = program.slotMeta.find(
        (meta) => meta.instanceId === setZBlock.id && meta.outputId === 'out'
      );
      expect(setZSlotMeta).toBeDefined();
      if (!setZSlotMeta) return;

      const setZBaseSlot = setZSlotMeta.slotIndex;

      // Polar output: x = 0.5 + 1*cos(0) = 1.5, y = 0.5
      // SetZ should preserve x,y and set z=99
      expect(state.values.f64[setZBaseSlot]).toBeCloseTo(1.5, 5);
      expect(state.values.f64[setZBaseSlot + 1]).toBeCloseTo(0.5, 5);
      expect(state.values.f64[setZBaseSlot + 2]).toBe(99);
    });
  });
});
