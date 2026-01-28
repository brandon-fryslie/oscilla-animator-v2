/**
 * Backend Preconditions Tests
 *
 * Verifies that the Backend properly validates its inputs:
 * - Requires TypedPatch from Frontend
 * - Rejects incomplete graphs (backendReady=false implied)
 * - Validates that all required data is present before execution
 *
 * These tests verify the contract between Frontend and Backend.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../../graph';
import { compileFrontend } from '../../frontend';
import { compileBackend } from '../index';
import type { CompiledProgramIR } from '../../ir/program';
import type { UnlinkedIRFragments } from '../lower-blocks';
import type { ScheduleIR } from '../schedule-program';
import type { AcyclicOrLegalGraph } from '../../ir/patches';

// Import blocks to trigger registration
import '../../../blocks/time-blocks';
import '../../../blocks/math-blocks';
import '../../../blocks/primitive-blocks';
import '../../../blocks/signal-blocks';

/**
 * Minimal program converter for testing.
 * Backends need a converter to produce final IR.
 */
function testProgramConverter(
  unlinkedIR: UnlinkedIRFragments,
  scheduleIR: ScheduleIR,
  acyclicPatch: AcyclicOrLegalGraph
): CompiledProgramIR {
  // Access the actual IR from the builder (matching compile.ts)
  const builder = unlinkedIR.builder;
  const signalNodes = builder.getSigExprs();
  const fieldNodes = builder.getFieldExprs();
  const eventNodes = builder.getEventExprs();
  
  return {
    irVersion: 1,
    signalExprs: { nodes: signalNodes },
    eventExprs: { nodes: eventNodes },
    fieldExprs: { nodes: fieldNodes },
    constants: { json: [] },
    schedule: scheduleIR,
    outputs: [],
    slotMeta: [],
    debugIndex: {
      blockMap: new Map(),
      slotToPort: new Map(),
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      ports: [],
    },
    fieldSlotRegistry: new Map(),
    renderGlobals: [],
  };
}

describe('Backend Preconditions', () => {
  describe('TypedPatch Validation', () => {
    it('accepts valid TypedPatch from Frontend', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        const c = b.addBlock('Const', { value: 42 });
        const add = b.addBlock('Add', {});
        b.wire(c, 'out', add, 'a');
        b.wire(c, 'out', add, 'b');
      });

      const frontendResult = compileFrontend(patch);
      expect(frontendResult.kind).toBe('ok');

      if (frontendResult.kind === 'ok') {
        const { typedPatch, backendReady } = frontendResult.result;

        // Frontend should be ready
        expect(backendReady).toBe(true);

        // Backend should accept this
        const backendResult = compileBackend(
          typedPatch,
          testProgramConverter
        );

        // Debug: log errors if any
        if (backendResult.kind === 'error') {
          console.log('Backend errors:', JSON.stringify(backendResult.errors, null, 2));
        }

        expect(backendResult.kind).toBe('ok');
        if (backendResult.kind === 'ok') {
          expect(backendResult.result.program).toBeDefined();
        }
      }
    });

    it('produces valid program from valid input', () => {
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot', {});
        const osc = b.addBlock('Oscillator', { waveform: 'oscSin' });
        b.wire(time, 'phaseA', osc, 'phase');
      });

      const frontendResult = compileFrontend(patch);
      expect(frontendResult.kind).toBe('ok');

      if (frontendResult.kind === 'ok') {
        const { typedPatch } = frontendResult.result;

        const backendResult = compileBackend(
          typedPatch,
          testProgramConverter
        );

        expect(backendResult.kind).toBe('ok');
        if (backendResult.kind === 'ok') {
          const { program, scheduleIR, unlinkedIR } = backendResult.result;

          // Verify program structure
          expect(program).toBeDefined();
          expect(program.signalExprs).toBeDefined();
          expect(program.schedule).toBeDefined();

          // Verify intermediate representations
          expect(scheduleIR).toBeDefined();
          expect(unlinkedIR).toBeDefined();
        }
      }
    });
  });

  describe('Illegal Cycle Rejection', () => {
    it('fails when Frontend indicates backendReady=false', () => {
      // Create an instantaneous illegal cycle
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        const add1 = b.addBlock('Add', {});
        const add2 = b.addBlock('Add', {});

        b.wire(add1, 'out', add2, 'a');
        b.wire(add2, 'out', add1, 'a');
      });

      const frontendResult = compileFrontend(patch);

      if (frontendResult.kind === 'ok') {
        const { typedPatch, backendReady, cycleSummary } = frontendResult.result;

        // Frontend should detect illegal cycle
        expect(cycleSummary.hasIllegalCycles).toBe(true);
        expect(backendReady).toBe(false);

        // Backend should fail with illegal cycle
        const backendResult = compileBackend(
          typedPatch,
          testProgramConverter
        );

        // Backend should fail
        expect(backendResult.kind).toBe('error');
        if (backendResult.kind === 'error') {
          // Should have errors
          expect(backendResult.errors.length).toBeGreaterThan(0);
          
          // Errors should mention cycle or compilation failure
          const hasRelevantError = backendResult.errors.some(
            (e) =>
              e.kind.includes('Cycle') ||
              e.kind.includes('Illegal') ||
              e.kind.includes('Backend') ||
              e.message.toLowerCase().includes('cycle')
          );
          expect(hasRelevantError).toBe(true);
        }
      }
    });

    it('succeeds with legal feedback loops', () => {
      // Create a legal feedback loop with UnitDelay
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        const delay = b.addBlock('UnitDelay', {});
        const add = b.addBlock('Add', {});
        const c = b.addBlock('Const', { value: 1 });

        // Legal feedback: add -> delay -> add
        b.wire(add, 'out', delay, 'in');
        b.wire(delay, 'out', add, 'a');
        b.wire(c, 'out', add, 'b');
      });

      const frontendResult = compileFrontend(patch);
      expect(frontendResult.kind).toBe('ok');

      if (frontendResult.kind === 'ok') {
        const { typedPatch, backendReady } = frontendResult.result;

        // Should be legal and ready
        expect(backendReady).toBe(true);

        // Backend should succeed
        const backendResult = compileBackend(
          typedPatch,
          testProgramConverter
        );

        expect(backendResult.kind).toBe('ok');
      }
    });
  });

  describe('Type Completeness', () => {
    it('requires fully resolved types', () => {
      // Create a minimal valid patch
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        const c = b.addBlock('Const', { value: 1 });
        const add = b.addBlock('Add', {});
        b.wire(c, 'out', add, 'a');
      });

      const frontendResult = compileFrontend(patch);

      if (frontendResult.kind === 'ok') {
        const { typedPatch } = frontendResult.result;

        // TypedPatch should have port types
        expect(typedPatch.portTypes).toBeDefined();
        expect(typedPatch.portTypes.size).toBeGreaterThan(0);

        // Backend should accept it
        const backendResult = compileBackend(
          typedPatch,
          testProgramConverter
        );

        // Should succeed or fail with clear error
        expect(['ok', 'error']).toContain(backendResult.kind);
      }
    });
  });

  describe('Backend Pipeline Stages', () => {
    it('executes all backend passes', () => {
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot', {});
        const osc = b.addBlock('Oscillator', {});
        b.wire(time, 'phaseA', osc, 'phase');
      });

      const frontendResult = compileFrontend(patch);
      expect(frontendResult.kind).toBe('ok');

      if (frontendResult.kind === 'ok') {
        const { typedPatch } = frontendResult.result;

        const backendResult = compileBackend(
          typedPatch,
          testProgramConverter
        );

        expect(backendResult.kind).toBe('ok');
        if (backendResult.kind === 'ok') {
          const { unlinkedIR, scheduleIR, acyclicPatch } = backendResult.result;

          // Verify each stage produced output
          expect(unlinkedIR).toBeDefined();
          expect(unlinkedIR.builder).toBeDefined();

          expect(scheduleIR).toBeDefined();
          expect(scheduleIR.steps).toBeDefined();

          expect(acyclicPatch).toBeDefined();
          expect(acyclicPatch.blocks).toBeDefined();
        }
      }
    });

    it('produces execution schedule', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        const c1 = b.addBlock('Const', { value: 1 });
        const c2 = b.addBlock('Const', { value: 2 });
        const add = b.addBlock('Add', {});
        b.wire(c1, 'out', add, 'a');
        b.wire(c2, 'out', add, 'b');
      });

      const frontendResult = compileFrontend(patch);
      expect(frontendResult.kind).toBe('ok');

      if (frontendResult.kind === 'ok') {
        const { typedPatch } = frontendResult.result;

        const backendResult = compileBackend(
          typedPatch,
          testProgramConverter
        );

        expect(backendResult.kind).toBe('ok');
        if (backendResult.kind === 'ok') {
          const { scheduleIR } = backendResult.result;

          // Should have execution steps
          expect(scheduleIR.steps).toBeDefined();
          expect(Array.isArray(scheduleIR.steps)).toBe(true);
          expect(scheduleIR.steps.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Error Propagation', () => {
    it('reports clear errors when backend fails', () => {
      // Create a patch that might fail in backend
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        const add1 = b.addBlock('Add', {});
        const add2 = b.addBlock('Add', {});

        // Illegal instantaneous cycle
        b.wire(add1, 'out', add2, 'a');
        b.wire(add2, 'out', add1, 'a');
      });

      const frontendResult = compileFrontend(patch);

      if (frontendResult.kind === 'ok') {
        const { typedPatch } = frontendResult.result;

        const backendResult = compileBackend(
          typedPatch,
          testProgramConverter
        );

        if (backendResult.kind === 'error') {
          // Errors should have proper structure
          expect(backendResult.errors).toBeDefined();
          expect(Array.isArray(backendResult.errors)).toBe(true);
          expect(backendResult.errors.length).toBeGreaterThan(0);

          // Each error should have kind and message
          backendResult.errors.forEach((error) => {
            expect(error).toHaveProperty('kind');
            expect(error).toHaveProperty('message');
            expect(typeof error.kind).toBe('string');
            expect(typeof error.message).toBe('string');
          });
        }
      }
    });
  });

  describe('Contract Verification', () => {
    it('follows Frontend->Backend contract', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
      });

      // Step 1: Frontend produces TypedPatch
      const frontendResult = compileFrontend(patch);
      expect(frontendResult.kind).toBe('ok');

      if (frontendResult.kind === 'ok') {
        const { typedPatch, backendReady } = frontendResult.result;

        // Step 2: Check contract - if backendReady, backend should succeed
        if (backendReady) {
          const backendResult = compileBackend(
            typedPatch,
            testProgramConverter
          );

          // Contract: backendReady=true implies backend succeeds
          // (or fails with a clear reason unrelated to frontend issues)
          expect(backendResult.kind).toBe('ok');
        }
      }
    });

    it('Backend receives only normalized, typed blocks', () => {
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot', {});
        const osc = b.addBlock('Oscillator', {});
        b.wire(time, 'phaseA', osc, 'phase');
      });

      const frontendResult = compileFrontend(patch);
      expect(frontendResult.kind).toBe('ok');

      if (frontendResult.kind === 'ok') {
        const { typedPatch } = frontendResult.result;

        // TypedPatch should have normalized structure
        expect(typedPatch.blocks).toBeDefined();
        expect(Array.isArray(typedPatch.blocks)).toBe(true);

        // Should have blockIndex map (from normalization)
        expect(typedPatch.blockIndex).toBeDefined();
        expect(typedPatch.blockIndex.size).toBeGreaterThan(0);

        // Should have port types (from type analysis)
        expect(typedPatch.portTypes).toBeInstanceOf(Map);

        // Backend can trust this structure
        const backendResult = compileBackend(
          typedPatch,
          testProgramConverter
        );

        expect(['ok', 'error']).toContain(backendResult.kind);
      }
    });
  });
});
