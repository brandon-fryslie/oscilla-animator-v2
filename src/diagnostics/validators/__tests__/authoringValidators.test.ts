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

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe('E_TIME_ROOT_MISSING');
      expect(diagnostics[0].severity).toBe('error');
      expect(diagnostics[0].primaryTarget.kind).toBe('graphSpan');
    });

    it('detects multiple TimeRoots', () => {
      const patch = createTestPatch(10, { timeRoots: 2 });
      const diagnostics = runAuthoringValidators(patch, 1);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe('E_TIME_ROOT_MULTIPLE');
      expect(diagnostics[0].severity).toBe('error');
    });

    it('produces no diagnostics for patch with exactly one TimeRoot', () => {
      const patch = createTestPatch(10, { timeRoots: 1 });
      const diagnostics = runAuthoringValidators(patch, 1);

      expect(diagnostics).toHaveLength(0);
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
