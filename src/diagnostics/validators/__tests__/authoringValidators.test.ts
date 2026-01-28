import { describe, it, expect } from 'vitest';
import { runAuthoringValidators } from '../authoringValidators';
import type { Patch, Block } from '../../../graph/Patch';
import { blockId, type BlockId, type BlockRole, type BlockType } from '../../../types';

/**
 * Performance and correctness tests for authoring validators
 */

function createTestPatch(blockCount: number, options: { timeRoots: number }): Patch {
  const blocks = new Map<BlockId, Block>();

  // Add TimeRoot blocks
  for (let i = 0; i < options.timeRoots; i++) {
    const id = blockId(`b${i}`);
    blocks.set(id, {
      id,
      type: 'InfiniteTimeRoot' as BlockType,
      params: {},
      displayName: `TimeRoot ${i}`,
      domainId: null,
      role: { kind: 'timeRoot', meta: {} } as BlockRole,
      inputPorts: new Map(),
      outputPorts: new Map(),
    });
  }

  // Add regular blocks
  for (let i = options.timeRoots; i < blockCount; i++) {
    const id = blockId(`b${i}`);
    blocks.set(id, {
      id,
      type: 'Oscillator' as BlockType,
      params: {},
      displayName: `Block ${i}`,
      domainId: null,
      role: { kind: 'user', meta: { userDefined: true } } as BlockRole,
      inputPorts: new Map(),
      outputPorts: new Map(),
    });
  }

  return {
    blocks,
    edges: [],
  };
}

describe('Authoring Validators', () => {
  describe('TimeRoot validation', () => {
    it('detects missing TimeRoot', () => {
      const patch = createTestPatch(10, { timeRoots: 0 });
      const diagnostics = runAuthoringValidators(patch, 1);
      const timeRootDiagnostics = diagnostics.filter(d => d.code === 'E_TIME_ROOT_MISSING');

      expect(timeRootDiagnostics).toHaveLength(1);
      expect(timeRootDiagnostics[0].severity).toBe('error');
      expect(timeRootDiagnostics[0].primaryTarget.kind).toBe('graphSpan');
    });

    it('detects multiple TimeRoots', () => {
      const patch = createTestPatch(10, { timeRoots: 2 });
      const diagnostics = runAuthoringValidators(patch, 1);
      const timeRootDiagnostics = diagnostics.filter(d => d.code === 'E_TIME_ROOT_MULTIPLE');

      expect(timeRootDiagnostics).toHaveLength(1);
      expect(timeRootDiagnostics[0].severity).toBe('error');
    });

    it('produces no timeroot errors for patch with exactly one TimeRoot', () => {
      const patch = createTestPatch(10, { timeRoots: 1 });
      const diagnostics = runAuthoringValidators(patch, 1);
      const timeRootDiagnostics = diagnostics.filter(d => 
        d.code === 'E_TIME_ROOT_MISSING' || d.code === 'E_TIME_ROOT_MULTIPLE'
      );

      expect(timeRootDiagnostics).toHaveLength(0);
    });
  });

  describe('Connectivity validation', () => {
    it('detects disconnected blocks', () => {
      const patch = createTestPatch(5, { timeRoots: 1 });
      const diagnostics = runAuthoringValidators(patch, 1);
      const disconnectedDiagnostics = diagnostics.filter(d => d.code === 'W_GRAPH_DISCONNECTED_BLOCK');

      // All blocks are disconnected (no edges in test patch)
      // 1 TimeRoot (warning because no outgoing) + 4 regular blocks (warning because no edges)
      expect(disconnectedDiagnostics.length).toBeGreaterThan(0);
      expect(disconnectedDiagnostics[0].severity).toBe('warn');
    });
  });

  describe('Diagnostic Actions', () => {
    describe('E_TIME_ROOT_MISSING actions', () => {
      it('includes createTimeRoot action', () => {
        const patch = createTestPatch(10, { timeRoots: 0 });
        const diagnostics = runAuthoringValidators(patch, 1);
        const timeRootDiagnostic = diagnostics.find(d => d.code === 'E_TIME_ROOT_MISSING');

        expect(timeRootDiagnostic).toBeDefined();
        expect(timeRootDiagnostic!.actions).toBeDefined();
        expect(timeRootDiagnostic!.actions).toHaveLength(1);
      });

      it('createTimeRoot action has correct structure', () => {
        const patch = createTestPatch(10, { timeRoots: 0 });
        const diagnostics = runAuthoringValidators(patch, 1);
        const timeRootDiagnostic = diagnostics.find(d => d.code === 'E_TIME_ROOT_MISSING');
        const action = timeRootDiagnostic!.actions![0];

        expect(action.kind).toBe('createTimeRoot');
        expect(action.label).toBe('Add InfiniteTimeRoot');
        expect((action as any).timeRootKind).toBe('Infinite');
      });
    });

    describe('W_GRAPH_DISCONNECTED_BLOCK actions', () => {
      it('includes goToTarget and removeBlock actions', () => {
        const patch = createTestPatch(5, { timeRoots: 1 });
        const diagnostics = runAuthoringValidators(patch, 1);
        const disconnectedDiagnostics = diagnostics.filter(d => d.code === 'W_GRAPH_DISCONNECTED_BLOCK');

        expect(disconnectedDiagnostics.length).toBeGreaterThan(0);
        
        for (const diagnostic of disconnectedDiagnostics) {
          expect(diagnostic.actions).toBeDefined();
          expect(diagnostic.actions).toHaveLength(2);
        }
      });

      it('first action is goToTarget with correct structure', () => {
        const patch = createTestPatch(5, { timeRoots: 1 });
        const diagnostics = runAuthoringValidators(patch, 1);
        const disconnectedDiagnostic = diagnostics.find(d => d.code === 'W_GRAPH_DISCONNECTED_BLOCK');
        const action = disconnectedDiagnostic!.actions![0];

        expect(action.kind).toBe('goToTarget');
        expect(action.label).toBe('Go to Block');
        expect((action as any).target).toBeDefined();
        expect((action as any).target.kind).toBe('block');
        expect((action as any).target.blockId).toBeDefined();
      });

      it('second action is removeBlock with correct structure', () => {
        const patch = createTestPatch(5, { timeRoots: 1 });
        const diagnostics = runAuthoringValidators(patch, 1);
        const disconnectedDiagnostic = diagnostics.find(d => d.code === 'W_GRAPH_DISCONNECTED_BLOCK');
        const action = disconnectedDiagnostic!.actions![1];

        expect(action.kind).toBe('removeBlock');
        expect(action.label).toBe('Remove Block');
        expect((action as any).blockId).toBeDefined();
      });

      it('action blockId matches diagnostic target blockId', () => {
        const patch = createTestPatch(5, { timeRoots: 1 });
        const diagnostics = runAuthoringValidators(patch, 1);
        const disconnectedDiagnostic = diagnostics.find(d => d.code === 'W_GRAPH_DISCONNECTED_BLOCK');
        
        expect(disconnectedDiagnostic!.primaryTarget.kind).toBe('block');
        const targetBlockId = (disconnectedDiagnostic!.primaryTarget as any).blockId;
        const removeAction = disconnectedDiagnostic!.actions![1];
        const goToAction = disconnectedDiagnostic!.actions![0];

        expect((removeAction as any).blockId).toBe(targetBlockId);
        expect((goToAction as any).target.blockId).toBe(targetBlockId);
      });
    });
  });

  describe('Performance', () => {
    it('completes in <10ms for 50-block patch', () => {
      const patch = createTestPatch(50, { timeRoots: 0 });

      const start = performance.now();
      runAuthoringValidators(patch, 1);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('completes in <50ms for 200-block patch', () => {
      const patch = createTestPatch(200, { timeRoots: 0 });

      const start = performance.now();
      runAuthoringValidators(patch, 1);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });
});
