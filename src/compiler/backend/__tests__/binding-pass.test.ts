/**
 * Tests for binding-pass.ts (WI-4)
 *
 * These tests verify that the binding pass is:
 * - Pure (same inputs → same outputs)
 * - Deterministic (lexical ordering)
 * - Idempotent (reuses existing state)
 */

import { describe, it, expect } from 'vitest';
import { bindEffects, applyBinding, bindOutputs } from '../binding-pass';
import type { LowerEffects, ValueRefExpr } from '../../ir/lowerTypes';
import type { StableStateId } from '../../ir/types';
import { IRBuilderImpl } from '../../ir/IRBuilderImpl';
import { canonicalSignal } from '../../../core/canonical-types';
import { FLOAT } from '../../../core/canonical-types/payloads';

describe('bindEffects', () => {
  it('allocates state deterministically (lexical order)', () => {
    // Create effects with state declarations in non-lexical order
    const effects: LowerEffects = {
      stateDecls: [
        { key: 'block-B:state' as StableStateId, initialValue: 0 },
        { key: 'block-A:state' as StableStateId, initialValue: 0 },
        { key: 'block-C:state' as StableStateId, initialValue: 0 },
      ],
    };

    const builder = new IRBuilderImpl();
    const result1 = bindEffects({ effects, origin: { blockId: 'test' } }, builder);

    // Create a fresh builder for second call
    const builder2 = new IRBuilderImpl();
    const result2 = bindEffects({ effects, origin: { blockId: 'test' } }, builder2);

    // Same inputs → identical results (lexical order: A, B, C)
    const keys1 = Array.from(result1.stateMap.keys());
    const keys2 = Array.from(result2.stateMap.keys());

    expect(keys1).toEqual(keys2);
    expect(keys1).toEqual(['block-A:state', 'block-B:state', 'block-C:state']);
  });

  it('allocates slots deterministically (lexical order)', () => {
    const type = canonicalSignal(FLOAT);

    const effects: LowerEffects = {
      slotRequests: [
        { portId: 'port-Z', type },
        { portId: 'port-A', type },
        { portId: 'port-M', type },
      ],
    };

    const builder = new IRBuilderImpl();
    const result1 = bindEffects({ effects, origin: { blockId: 'test' } }, builder);

    const builder2 = new IRBuilderImpl();
    const result2 = bindEffects({ effects, origin: { blockId: 'test' } }, builder2);

    // Same inputs → identical slot allocation order
    const portIds1 = Array.from(result1.slotMap.keys());
    const portIds2 = Array.from(result2.slotMap.keys());

    expect(portIds1).toEqual(portIds2);
    expect(portIds1).toEqual(['port-A', 'port-M', 'port-Z']);
  });

  it('reuses existing state (idempotency)', () => {
    const builder = new IRBuilderImpl();

    // First allocation
    const effects1: LowerEffects = {
      stateDecls: [
        { key: 'block-A:state' as StableStateId, initialValue: 0 },
      ],
    };
    const result1 = bindEffects({ effects: effects1, origin: { blockId: 'test' } }, builder);

    // Second allocation with existingState (simulating SCC phase-2)
    const effects2: LowerEffects = {
      stateDecls: [], // No new state to allocate
      stepRequests: [
        { kind: 'stateWrite', stateKey: 'block-A:state' as StableStateId, value: 123 as any },
      ],
    };
    const result2 = bindEffects(
      {
        effects: effects2,
        existingState: result1.stateMap,
        origin: { blockId: 'test', phase: 'phase2' },
      },
      builder
    );

    // Should not emit diagnostics (state found in existingState)
    expect(result2.diagnostics).toHaveLength(0);
  });

  it('validates step requests reference declared state', () => {
    const effects: LowerEffects = {
      stateDecls: [
        { key: 'block-A:state' as StableStateId, initialValue: 0 },
      ],
      stepRequests: [
        { kind: 'stateWrite', stateKey: 'block-A:state' as StableStateId, value: 123 as any },
        { kind: 'stateWrite', stateKey: 'block-B:state' as StableStateId, value: 456 as any }, // Missing
      ],
    };

    const builder = new IRBuilderImpl();
    const result = bindEffects({ effects, origin: { blockId: 'test' } }, builder);

    // Should have one error for missing 'block-B:state'
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].level).toBe('error');
    expect(result.diagnostics[0].message).toContain('block-B:state');
  });

  it('creates expr patches for all allocated state', () => {
    const effects: LowerEffects = {
      stateDecls: [
        { key: 'block-A:state' as StableStateId, initialValue: 0 },
        { key: 'block-B:state' as StableStateId, initialValue: 0 },
      ],
    };

    const builder = new IRBuilderImpl();
    const result = bindEffects({ effects, origin: { blockId: 'test' } }, builder);

    // exprPatches should match stateMap entries
    expect(result.exprPatches.size).toBe(2);
    expect(result.exprPatches.has('block-A:state' as StableStateId)).toBe(true);
    expect(result.exprPatches.has('block-B:state' as StableStateId)).toBe(true);

    // Values should be the same as stateMap
    for (const [key, slot] of result.stateMap.entries()) {
      expect(result.exprPatches.get(key)).toBe(slot);
    }
  });
});

describe('bindOutputs', () => {
  it('binds slots from slotMap', () => {
    const type = canonicalSignal(FLOAT);
    const builder = new IRBuilderImpl();

    const outputsById: Record<string, ValueRefExpr> = {
      out: {
        id: 123 as any,
        type,
        stride: 1,
        // slot is undefined - needs binding
      },
    };

    const slotMap = new Map([['out', 42 as any]]);

    const bound = bindOutputs(outputsById, slotMap, 'test-block', 'impure', builder);

    expect(bound.size).toBe(1);
    expect(bound.get('out')?.slot).toBe(42);
  });

  it('allocates slots for pure blocks', () => {
    const type = canonicalSignal(FLOAT);
    const builder = new IRBuilderImpl();

    const outputsById: Record<string, ValueRefExpr> = {
      out: {
        id: 123 as any,
        type,
        stride: 1,
        // slot is undefined
      },
    };

    const slotMap = new Map(); // No pre-allocated slot

    const bound = bindOutputs(outputsById, slotMap, 'test-block', 'pure', builder);

    expect(bound.size).toBe(1);
    expect(bound.get('out')?.slot).toBeDefined();
  });

  it('throws for impure blocks with missing slots', () => {
    const type = canonicalSignal(FLOAT);
    const builder = new IRBuilderImpl();

    const outputsById: Record<string, ValueRefExpr> = {
      out: {
        id: 123 as any,
        type,
        stride: 1,
        // slot is undefined
      },
    };

    const slotMap = new Map(); // No pre-allocated slot

    expect(() => {
      bindOutputs(outputsById, slotMap, 'test-block', 'impure', builder);
    }).toThrow('missing slot');
  });
});

describe('applyBinding', () => {
  it('applies expr patches to builder', () => {
    const effects: LowerEffects = {
      stateDecls: [
        { key: 'block-A:state' as StableStateId, initialValue: 42 },
      ],
    };

    const builder = new IRBuilderImpl();
    const result = bindEffects({ effects, origin: { blockId: 'test' } }, builder);

    // Apply binding
    applyBinding(builder, result, effects);

    // Builder should have the state slot allocated
    const slot = builder.findStateSlot('block-A:state' as StableStateId);
    expect(slot).toBeDefined();
  });

  it('processes step requests', () => {
    const effects: LowerEffects = {
      stateDecls: [
        { key: 'block-A:state' as StableStateId, initialValue: 0 },
      ],
      stepRequests: [
        { kind: 'stateWrite', stateKey: 'block-A:state' as StableStateId, value: 123 as any },
      ],
    };

    const builder = new IRBuilderImpl();
    const result = bindEffects({ effects, origin: { blockId: 'test' } }, builder);

    // Should not throw
    expect(() => {
      applyBinding(builder, result, effects);
    }).not.toThrow();
  });
});
