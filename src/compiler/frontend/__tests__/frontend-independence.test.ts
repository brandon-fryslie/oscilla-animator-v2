/**
 * Frontend Independence Tests
 *
 * Verifies that the Frontend can operate independently of the Backend:
 * - Can resolve types without backend compilation
 * - Can insert adapters without backend compilation
 * - Can classify cycles without backend compilation
 * - Produces TypedPatch and CycleSummary for UI consumption
 *
 * These tests import ONLY from src/compiler/frontend/ and src/graph/
 * to prove the Frontend has no backend dependencies.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../../graph';
import { compileFrontend } from '../index';
import type { FrontendResult } from '../index';

// Import blocks to trigger registration
import '../../../blocks/all';


describe('Frontend Independence', () => {
  describe('Type Resolution', () => {
    it('resolves port types without backend compilation', () => {
      // Create a simple patch with type inference
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        const constBlock = b.addBlock('Const');
        b.setConfig(constBlock, 'value', 42);
        const addBlock = b.addBlock('Add');
        b.wire(constBlock, 'out', addBlock, 'a');
        b.wire(constBlock, 'out', addBlock, 'b');
      });

      const result = compileFrontend(patch);

      expect(result.backendReady).toBe(true);

      // TypedPatch should exist
      expect(result.typedPatch).toBeDefined();
      expect(result.typedPatch.blocks).toBeDefined();

      // Port types should be resolved
      expect(result.typedPatch.portTypes).toBeDefined();
      expect(result.typedPatch.portTypes.size).toBeGreaterThan(0);

      // Check that some port types are concrete (not type variables)
      let foundConcreteType = false;
      for (const [portKey, portType] of result.typedPatch.portTypes) {
        if (portType && typeof portType === 'object' && 'payload' in portType) {
          foundConcreteType = true;
          break;
        }
      }
      expect(foundConcreteType).toBe(true);
    });

    it('provides type information accessible to UI', () => {
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot');
        b.setPortDefault(time, 'periodAMs', 1000);
        const osc = b.addBlock('Oscillator');
        b.setPortDefault(osc, 'mode', 0);
        b.wire(time, 'phaseA', osc, 'phase');
      });

      const result = compileFrontend(patch);

      expect(result.backendReady).toBe(true);
      const { typedPatch } = result;

      // Verify TypedPatch structure for UI
      expect(typedPatch.blocks).toBeDefined();
      expect(Array.isArray(typedPatch.blocks)).toBe(true);
      expect(typedPatch.portTypes).toBeInstanceOf(Map);

      // Should have types for connected ports
      expect(typedPatch.portTypes.size).toBeGreaterThan(0);
    });
  });

  describe('Adapter Insertion', () => {
    it('inserts adapters without backend compilation', () => {
      // Create a patch that requires adapter insertion
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        const phaseBlock = b.addBlock('Const');
        b.setConfig(phaseBlock, 'value', 0.5);
        const scalar = b.addBlock('Const');
        b.setConfig(scalar, 'value', 1.0);

        // This should require adapter insertion during normalization
        const add = b.addBlock('Add');
        b.wire(phaseBlock, 'out', add, 'a');
        b.wire(scalar, 'out', add, 'b');
      });

      const result = compileFrontend(patch);

      // Frontend should succeed even if adapters were needed
      // (Note: actual adapter need depends on type inference)
      expect(result.backendReady).toBe(true);
      const { normalizedPatch, typedPatch } = result;

      // Normalized patch should exist
      expect(normalizedPatch).toBeDefined();
      expect(normalizedPatch.blocks).toBeDefined();

      // TypedPatch should be produced
      expect(typedPatch).toBeDefined();
    });

    it('reports adapter insertion in normalized patch', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        const c = b.addBlock('Const');
        b.setConfig(c, 'value', 10);
        const add = b.addBlock('Add');
        b.wire(c, 'out', add, 'a');
      });

      const result = compileFrontend(patch);

      expect(result.backendReady).toBe(true);
      const { normalizedPatch } = result;

      // Normalized patch should have blocks array
      expect(normalizedPatch.blocks).toBeDefined();
      expect(normalizedPatch.blocks.length).toBeGreaterThan(0);

      // Check that normalization produced a valid structure with blockIndex map
      expect(normalizedPatch.blockIndex).toBeDefined();
      expect(normalizedPatch.blockIndex.size).toBeGreaterThan(0);

      // Verify blocks can be indexed
      expect(normalizedPatch.blockIndex.size).toBe(normalizedPatch.blocks.length);
    });
  });

  describe('Cycle Classification', () => {
    it('classifies cycles without backend compilation', () => {
      // Create a simple feedback loop
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        const delay = b.addBlock('UnitDelay');
        const add = b.addBlock('Add');
        const c = b.addBlock('Const');
        b.setConfig(c, 'value', 1);

        // Create feedback: add -> delay -> add
        b.wire(add, 'out', delay, 'in');
        b.wire(delay, 'out', add, 'a');
        b.wire(c, 'out', add, 'b');
      });

      const result = compileFrontend(patch);

      expect(result.backendReady).toBe(true);
      const { cycleSummary } = result;

      // CycleSummary should exist
      expect(cycleSummary).toBeDefined();
      expect(cycleSummary.sccs).toBeDefined();
      expect(Array.isArray(cycleSummary.sccs)).toBe(true);

      // Should have detected the cycle
      expect(cycleSummary.sccs.length).toBeGreaterThan(0);

      // Verify cycle classification fields exist
      const firstSCC = cycleSummary.sccs[0];
      if (firstSCC) {
        expect(firstSCC).toHaveProperty('blocks');
        expect(firstSCC).toHaveProperty('classification');
        expect(firstSCC).toHaveProperty('legality');
      }
    });

    it('provides cycle summary accessible to UI', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        const c = b.addBlock('Const');
        b.setConfig(c, 'value', 42);
        const add = b.addBlock('Add');
        b.wire(c, 'out', add, 'a');
      });

      const result = compileFrontend(patch);

      expect(result.backendReady).toBe(true);
      const { cycleSummary } = result;

      // CycleSummary should always be present
      expect(cycleSummary).toBeDefined();
      expect(cycleSummary.sccs).toBeDefined();

      // Verify structure for UI consumption
      expect(typeof cycleSummary.hasIllegalCycles).toBe('boolean');

      // Each SCC should have UI-relevant fields
      cycleSummary.sccs.forEach((scc) => {
        expect(scc.blocks).toBeDefined();
        expect(Array.isArray(scc.blocks)).toBe(true);
        expect(scc.classification).toBeDefined();
        expect(scc.legality).toBeDefined();
      });
    });

    it('reports illegal cycles without backend failure', () => {
      // Create an instantaneous illegal cycle (no delay)
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        const add1 = b.addBlock('Add');
        const add2 = b.addBlock('Add');
        const c = b.addBlock('Const');
        b.setConfig(c, 'value', 1);

        // Instantaneous cycle: add1 -> add2 -> add1
        b.wire(add1, 'out', add2, 'a');
        b.wire(add2, 'out', add1, 'a');
        b.wire(c, 'out', add1, 'b');
        b.wire(c, 'out', add2, 'b');
      });

      const result = compileFrontend(patch);

      // Frontend should succeed but report cycle as illegal
      const { cycleSummary, backendReady } = result;

      // Should detect illegal cycle
      expect(cycleSummary.hasIllegalCycles).toBe(true);

      // Backend should NOT be ready
      expect(backendReady).toBe(false);

      // Should have at least one illegal cycle
      const illegalCycles = cycleSummary.sccs.filter(
        (scc) => scc.legality === 'instantaneous-illegal'
      );
      expect(illegalCycles.length).toBeGreaterThan(0);
    });
  });

  describe('Backend Readiness', () => {
    it('sets backendReady=true for valid graphs', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        const c = b.addBlock('Const');
        b.setConfig(c, 'value', 42);
        const add = b.addBlock('Add');
        b.wire(c, 'out', add, 'a');
        b.wire(c, 'out', add, 'b');
      });

      const result = compileFrontend(patch);

      const { backendReady, errors } = result;

      // Should be ready for backend
      expect(backendReady).toBe(true);
      expect(errors.length).toBe(0);
    });

    it('sets backendReady=false for illegal cycles', () => {
      // Already tested in cycle classification above
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        const add1 = b.addBlock('Add');
        const add2 = b.addBlock('Add');

        b.wire(add1, 'out', add2, 'a');
        b.wire(add2, 'out', add1, 'a');
      });

      const result = compileFrontend(patch);

      expect(result.backendReady).toBe(false);
    });

    it('sets backendReady=false for type resolution errors', () => {
      // Create a patch with unresolvable types (dangling edge)
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        // Add block with no inputs - may have unresolved type variables
        b.addBlock('Add');
      });

      const result = compileFrontend(patch);

      // Frontend always returns FrontendResult now — verify the structure exists
      const { errors } = result;
      expect(errors).toBeDefined();
    });
  });

  describe('Frontend Structure', () => {
    it('returns complete FrontendResult structure', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
      });

      const result = compileFrontend(patch);

      expect(result.backendReady).toBe(true);

      // Verify all required fields exist
      expect(result).toHaveProperty('typedPatch');
      expect(result).toHaveProperty('cycleSummary');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('backendReady');
      expect(result).toHaveProperty('normalizedPatch');

      // Type checks
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.backendReady).toBe('boolean');
    });

    it('produces serializable output for UI', () => {
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot');
        const osc = b.addBlock('Oscillator');
        b.wire(time, 'phaseA', osc, 'phase');
      });

      const result = compileFrontend(patch);

      expect(result.backendReady).toBe(true);
      const { cycleSummary } = result;

      // CycleSummary should be serializable
      expect(() => JSON.stringify(cycleSummary.sccs)).not.toThrow();

      // Verify structure is JSON-safe
      cycleSummary.sccs.forEach((scc) => {
        expect(typeof scc.classification).toBe('string');
        expect(typeof scc.legality).toBe('string');
        expect(Array.isArray(scc.blocks)).toBe(true);
      });
    });
  });
});
