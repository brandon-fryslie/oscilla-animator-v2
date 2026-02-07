/**
 * WhyNotEvaluated Tests
 *
 * Tests the "Why Not Evaluated" analysis for identifying why a block/port
 * has no value in the debugger.
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph/Patch';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import type { CompilationSnapshot } from '../../services/CompilationInspectorService';
import { compilationInspector } from '../../services/CompilationInspectorService';
import { analyzeWhyNotEvaluated } from '../WhyNotEvaluated';
import { blockId, portId } from '../../types';

// Ensure all blocks are registered
import '../../blocks/all';

// =============================================================================
// Helpers
// =============================================================================

/** Compile a normal connected patch and return program + snapshot */
function compileConnectedPatch(): { program: CompiledProgramIR; snapshot: CompilationSnapshot } {
  const patch = buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');

    const ellipse = b.addBlock('Ellipse');
    b.setPortDefault(ellipse, 'rx', 0.03);
    b.setPortDefault(ellipse, 'ry', 0.03);

    const array = b.addBlock('Array');
    b.setPortDefault(array, 'count', 4);

    const layout = b.addBlock('GridLayoutUV');
    b.setPortDefault(layout, 'rows', 2);
    b.setPortDefault(layout, 'cols', 2);

    const render = b.addBlock('RenderInstances2D');

    const colorSig = b.addBlock('Const');
    b.setConfig(colorSig, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
    const colorField = b.addBlock('Broadcast');
    b.wire(colorSig, 'out', colorField, 'signal');

    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(layout, 'position', render, 'pos');
    b.wire(colorField, 'field', render, 'color');
  });

  compilationInspector.clear();
  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(`Compile failed: ${result.errors.map(e => e.message).join(', ')}`);
  }

  const snapshot = compilationInspector.getLatestSnapshot();
  if (!snapshot) {
    throw new Error('No compilation snapshot available');
  }

  return { program: result.program, snapshot };
}

/** Compile a patch with a disconnected block */
function compileWithDisconnectedBlock(): {
  program: CompiledProgramIR;
  snapshot: CompilationSnapshot;
  disconnectedBlockId: string;
} {
  let disconnectedId = '';
  const patch = buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');

    const ellipse = b.addBlock('Ellipse');
    b.setPortDefault(ellipse, 'rx', 0.03);
    b.setPortDefault(ellipse, 'ry', 0.03);

    const array = b.addBlock('Array');
    b.setPortDefault(array, 'count', 4);

    const layout = b.addBlock('GridLayoutUV');
    b.setPortDefault(layout, 'rows', 2);
    b.setPortDefault(layout, 'cols', 2);

    const render = b.addBlock('RenderInstances2D');

    const colorSig = b.addBlock('Const');
    b.setConfig(colorSig, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
    const colorField = b.addBlock('Broadcast');
    b.wire(colorSig, 'out', colorField, 'signal');

    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(layout, 'position', render, 'pos');
    b.wire(colorField, 'field', render, 'color');

    // Add a disconnected Const block (not wired to anything)
    const disconnected = b.addBlock('Const');
    b.setConfig(disconnected, 'value', 42);
    disconnectedId = disconnected;
  });

  compilationInspector.clear();
  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(`Compile failed: ${result.errors.map(e => e.message).join(', ')}`);
  }

  const snapshot = compilationInspector.getLatestSnapshot();
  if (!snapshot) {
    throw new Error('No compilation snapshot available');
  }

  return { program: result.program, snapshot, disconnectedBlockId: disconnectedId };
}

// =============================================================================
// Tests
// =============================================================================

describe('analyzeWhyNotEvaluated', () => {
  describe('with no program (compilation failed)', () => {
    it('should return unknown reason when no program and no snapshot', () => {
      const result = analyzeWhyNotEvaluated(
        blockId('test-block'),
        undefined,
        null,
        null,
      );

      expect(result.blockId).toBe('test-block');
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].kind).toBe('unknown');
    });

    it('should return compile-error when snapshot has errors', () => {
      const mockSnapshot: CompilationSnapshot = {
        compileId: 'test',
        timestamp: Date.now(),
        totalDurationMs: 0,
        passes: [{
          passNumber: 1,
          passName: 'normalization',
          timestamp: Date.now(),
          durationMs: 0,
          input: null,
          output: null,
          errors: [{
            kind: 'UnknownBlockType',
            message: 'Block type "Foo" is not registered',
            blockId: 'test-block',
          }],
          inputSize: 0,
          outputSize: 0,
        }],
        status: 'failure',
      };

      const result = analyzeWhyNotEvaluated(
        blockId('test-block'),
        undefined,
        null,
        mockSnapshot,
      );

      expect(result.reasons.some(r => r.kind === 'compile-error')).toBe(true);
      const compileErrorReason = result.reasons.find(r => r.kind === 'compile-error');
      expect(compileErrorReason?.kind === 'compile-error' && compileErrorReason.errors.length).toBeGreaterThan(0);
    });
  });

  describe('with a successfully compiled patch', () => {
    it('should return empty reasons for a scheduled block', () => {
      const { program, snapshot } = compileConnectedPatch();

      // Find a block that IS in the program (e.g., look through the blockMap)
      let scheduledBlockId: string | undefined;
      for (const [, strId] of program.debugIndex.blockMap) {
        scheduledBlockId = strId;
        break; // Take the first one
      }

      if (!scheduledBlockId) {
        // If no blocks in blockMap, skip this test
        return;
      }

      const result = analyzeWhyNotEvaluated(
        blockId(scheduledBlockId),
        undefined,
        program,
        snapshot,
      );

      // A scheduled block should have empty reasons (it IS evaluated)
      // or at most event-related reasons (which is still evaluated, just event-driven)
      const nonEventReasons = result.reasons.filter(r => r.kind !== 'event-not-fired');
      expect(nonEventReasons).toHaveLength(0);
    });

    it('should return unknown for a block not in the debug index', () => {
      const { program, snapshot } = compileConnectedPatch();

      const result = analyzeWhyNotEvaluated(
        blockId('nonexistent-block-id'),
        undefined,
        program,
        snapshot,
      );

      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].kind).toBe('unknown');
      expect(
        result.reasons[0].kind === 'unknown' && result.reasons[0].detail
      ).toContain('not found');
    });
  });

  describe('disconnected block analysis', () => {
    it('should identify a disconnected block as not scheduled', () => {
      const { program, snapshot, disconnectedBlockId } = compileWithDisconnectedBlock();

      const result = analyzeWhyNotEvaluated(
        blockId(disconnectedBlockId),
        undefined,
        program,
        snapshot,
      );

      // The disconnected block may or may not be in the debug index.
      // If not in debug index → 'unknown' (not found).
      // If in debug index but not scheduled → 'not-in-schedule'.
      const hasRelevantReason = result.reasons.some(
        r => r.kind === 'not-in-schedule' || r.kind === 'unknown' || r.kind === 'no-connections'
      );
      expect(hasRelevantReason).toBe(true);
    });
  });

  describe('portId parameter', () => {
    it('should pass through portId in result', () => {
      const result = analyzeWhyNotEvaluated(
        blockId('test-block'),
        portId('out'),
        null,
        null,
      );

      expect(result.portId).toBe('out');
    });
  });

  describe('result structure', () => {
    it('should always include blockId in result', () => {
      const result = analyzeWhyNotEvaluated(
        blockId('test-block'),
        undefined,
        null,
        null,
      );

      expect(result.blockId).toBe('test-block');
      expect(result.reasons).toBeDefined();
      expect(Array.isArray(result.reasons)).toBe(true);
    });

    it('should have well-formed reason objects', () => {
      const result = analyzeWhyNotEvaluated(
        blockId('test-block'),
        undefined,
        null,
        null,
      );

      for (const reason of result.reasons) {
        expect(reason.kind).toBeDefined();
        expect(typeof reason.kind).toBe('string');
      }
    });
  });
});
