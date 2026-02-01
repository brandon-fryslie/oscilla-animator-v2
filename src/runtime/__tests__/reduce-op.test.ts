/**
 * ReduceOp Tests
 * 
 * Tests field→scalar reduction operations (sum, avg, min, max)
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph';
import { BLOCK_DEFS_BY_TYPE } from '../../blocks/registry';

describe('ReduceOp', () => {
  describe('Block Registration', () => {
    it('registers Reduce block in registry', () => {
      const reduceBlock = BLOCK_DEFS_BY_TYPE.get('Reduce');
      
      expect(reduceBlock).toBeDefined();
      expect(reduceBlock?.type).toBe('Reduce');
      expect(reduceBlock?.category).toBe('field');
      expect(reduceBlock?.form).toBe('primitive');
    });

    it('has correct input/output port definitions', () => {
      const reduceBlock = BLOCK_DEFS_BY_TYPE.get('Reduce');
      
      expect(reduceBlock?.inputs.field).toBeDefined();
      expect(reduceBlock?.inputs.field.label).toBe('Field');
      
      expect(reduceBlock?.outputs.signal).toBeDefined();
      expect(reduceBlock?.outputs.signal.label).toBe('Result');
    });

    it('has correct cardinality metadata', () => {
      const reduceBlock = BLOCK_DEFS_BY_TYPE.get('Reduce');
      
      expect(reduceBlock?.cardinality).toBeDefined();
      expect(reduceBlock?.cardinality?.cardinalityMode).toBe('transform');
      expect(reduceBlock?.cardinality?.laneCoupling).toBe('laneCoupled');
    });
  });

  // NOTE: Runtime evaluation tests are deferred until reduceField
  // can access field materialization (requires ScheduleExecutor changes)
  describe.skip('Runtime Evaluation', () => {
    it('sums scalar field values', () => {
      // TODO: Implement after reduceField can materialize fields
    });

    it('computes average correctly', () => {
      // TODO: Implement componentwise reduction
    });

    it('finds minimum value', () => {
      // TODO: Implement componentwise reduction
    });

    it('finds maximum value', () => {
      // TODO: Implement componentwise reduction
    });

    it('handles empty field', () => {
      // TODO: Should return 0
    });

    it('propagates NaN', () => {
      // TODO: NaN in any element should propagate
    });

    it('reduces vec2 componentwise', () => {
      // TODO: sum([vec2(1,2), vec2(3,4)]) → vec2(4, 6)
    });
  });
});
