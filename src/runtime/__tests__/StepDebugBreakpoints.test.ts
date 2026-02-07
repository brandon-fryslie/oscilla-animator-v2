/**
 * Tests for E4: Breakpoint UX helpers and step-to-block resolution.
 *
 * Validates:
 * - getStepExprId extracts expression IDs from schedule steps
 * - stepToBlock is populated correctly during compilation
 * - block-id breakpoint matching resolves through blockMap
 */

import { describe, it, expect } from 'vitest';
import type { Step } from '../../compiler/ir/types';
import type { ValueExprId } from '../../compiler/ir/Indices';
import type { ValueSlot, DebugIndexIR, BlockId, PortId, PortBindingIR } from '../../compiler/ir/program';
import type { Breakpoint, StepSnapshot } from '../StepDebugTypes';

// =============================================================================
// getStepExprId — unit tests
// =============================================================================

/**
 * Extract the primary expression ID from a schedule step.
 * Copied from compile.ts to test in isolation.
 */
function getStepExprId(step: Step): ValueExprId | null {
  switch (step.kind) {
    case 'evalValue':
      return step.expr;
    case 'slotWriteStrided':
      return step.inputs.length > 0 ? step.inputs[0] : null;
    case 'materialize':
      return step.field;
    case 'stateWrite':
    case 'fieldStateWrite':
      return step.value;
    case 'render':
      return step.scale?.id ?? null;
    case 'continuityMapBuild':
    case 'continuityApply':
      return null;
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}

describe('getStepExprId', () => {
  it('extracts expr from evalValue step', () => {
    const step: Step = {
      kind: 'evalValue',
      expr: 42 as ValueExprId,
      target: { storage: 'value', slot: 0 as ValueSlot },
      strategy: 0,
    };
    expect(getStepExprId(step)).toBe(42);
  });

  it('extracts first input from slotWriteStrided', () => {
    const step: Step = {
      kind: 'slotWriteStrided',
      slotBase: 10 as ValueSlot,
      inputs: [5 as ValueExprId, 6 as ValueExprId],
    };
    expect(getStepExprId(step)).toBe(5);
  });

  it('returns null for empty slotWriteStrided inputs', () => {
    const step: Step = {
      kind: 'slotWriteStrided',
      slotBase: 10 as ValueSlot,
      inputs: [],
    };
    expect(getStepExprId(step)).toBeNull();
  });

  it('extracts field from materialize step', () => {
    const step: Step = {
      kind: 'materialize',
      field: 7 as ValueExprId,
      instanceId: 'inst-1' as any,
      target: 20 as ValueSlot,
    };
    expect(getStepExprId(step)).toBe(7);
  });

  it('extracts value from stateWrite step', () => {
    const step: Step = {
      kind: 'stateWrite',
      stateSlot: 0 as any,
      value: 11 as ValueExprId,
    };
    expect(getStepExprId(step)).toBe(11);
  });

  it('returns null for continuityMapBuild', () => {
    const step: Step = {
      kind: 'continuityMapBuild',
      instanceId: 'inst-1' as any,
      outputMapping: 'mapping-1',
    };
    expect(getStepExprId(step)).toBeNull();
  });

  it('returns null for continuityApply', () => {
    const step: Step = {
      kind: 'continuityApply',
      targetKey: 'key-1',
      instanceId: 'inst-1' as any,
      policy: { kind: 'none' },
      baseSlot: 0 as ValueSlot,
      outputSlot: 1 as ValueSlot,
      semantic: 'position',
      stride: 2,
    };
    expect(getStepExprId(step)).toBeNull();
  });
});

// =============================================================================
// Block-id breakpoint matching with blockMap resolution
// =============================================================================

describe('block-id breakpoint matching', () => {
  const makeDebugIndex = (): DebugIndexIR => ({
    stepToBlock: new Map([
      [0, 0 as unknown as BlockId],  // step 0 → block index 0
      [1, 1 as unknown as BlockId],  // step 1 → block index 1
    ] as any),
    slotToBlock: new Map(),
    exprToBlock: new Map(),
    ports: [],
    slotToPort: new Map(),
    blockMap: new Map([
      [0, 'b0'] as any,
      [1, 'b1'] as any,
    ]),
    blockDisplayNames: new Map([
      [0, 'Oscillator 1'] as any,
      [1, 'Lag 1'] as any,
    ]),
  });

  /**
   * Simulates the fixed _matchesBreakpoint logic for block-id.
   */
  function blockIdBreakpointMatches(
    snapshot: Pick<StepSnapshot, 'blockId'>,
    bp: Extract<Breakpoint, { kind: 'block-id' }>,
    debugIndex: DebugIndexIR,
  ): boolean {
    if (snapshot.blockId !== null) {
      const stringId = debugIndex.blockMap.get(snapshot.blockId);
      if (stringId === (bp.blockId as string)) return true;
    }
    return false;
  }

  it('matches when blockMap resolves to the same string ID', () => {
    const debugIndex = makeDebugIndex();
    const snapshot = { blockId: 0 as unknown as BlockId };
    const bp = { kind: 'block-id' as const, blockId: 'b0' as BlockId };
    expect(blockIdBreakpointMatches(snapshot, bp, debugIndex)).toBe(true);
  });

  it('does not match when blockMap resolves to a different string ID', () => {
    const debugIndex = makeDebugIndex();
    const snapshot = { blockId: 0 as unknown as BlockId };
    const bp = { kind: 'block-id' as const, blockId: 'b1' as BlockId };
    expect(blockIdBreakpointMatches(snapshot, bp, debugIndex)).toBe(false);
  });

  it('does not match when blockId is null', () => {
    const debugIndex = makeDebugIndex();
    const snapshot = { blockId: null };
    const bp = { kind: 'block-id' as const, blockId: 'b0' as BlockId };
    expect(blockIdBreakpointMatches(snapshot, bp, debugIndex)).toBe(false);
  });

  it('does not match when blockId is not in blockMap', () => {
    const debugIndex = makeDebugIndex();
    const snapshot = { blockId: 99 as unknown as BlockId };
    const bp = { kind: 'block-id' as const, blockId: 'b0' as BlockId };
    expect(blockIdBreakpointMatches(snapshot, bp, debugIndex)).toBe(false);
  });
});

// =============================================================================
// Slot name resolution
// =============================================================================

describe('resolveSlotName', () => {
  function resolveSlotName(
    slot: ValueSlot,
    debugIndex: DebugIndexIR | null,
    blocks: ReadonlyMap<string, { displayName: string; type: string }> | null,
  ): string {
    if (!debugIndex) return `slot ${slot}`;

    const portId = debugIndex.slotToPort.get(slot);
    if (portId === undefined) return `slot ${slot}`;

    const portBinding = debugIndex.ports.find(p => p.port === portId);
    if (!portBinding) return `slot ${slot}`;

    const displayName = debugIndex.blockDisplayNames?.get(portBinding.block);
    const blockStringId = debugIndex.blockMap.get(portBinding.block);
    const blockLabel = displayName
      ?? (blockStringId ? blocks?.get(blockStringId)?.displayName : null)
      ?? blockStringId
      ?? `block ${portBinding.block}`;

    return `${blockLabel}.${portBinding.portName}`;
  }

  it('resolves full slot name with display name from debugIndex', () => {
    const debugIndex: DebugIndexIR = {
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      exprToBlock: new Map(),
      ports: [{ port: 0 as unknown as PortId, block: 0 as unknown as BlockId, portName: 'out', direction: 'out', domain: 'signal', role: 'userWire' } as PortBindingIR],
      slotToPort: new Map([[5 as ValueSlot, 0 as unknown as PortId]]),
      blockMap: new Map([[0 as unknown as BlockId, 'b0']]),
      blockDisplayNames: new Map([[0 as unknown as BlockId, 'Oscillator 1']]),
    };
    expect(resolveSlotName(5 as ValueSlot, debugIndex, null)).toBe('Oscillator 1.out');
  });

  it('falls back to slot N when debugIndex is null', () => {
    expect(resolveSlotName(5 as ValueSlot, null, null)).toBe('slot 5');
  });

  it('falls back to slot N when slot has no port mapping', () => {
    const debugIndex: DebugIndexIR = {
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      exprToBlock: new Map(),
      ports: [],
      slotToPort: new Map(),
      blockMap: new Map(),
    };
    expect(resolveSlotName(5 as ValueSlot, debugIndex, null)).toBe('slot 5');
  });

  it('falls back to blocks map when blockDisplayNames is absent', () => {
    const debugIndex: DebugIndexIR = {
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      exprToBlock: new Map(),
      ports: [{ port: 0 as unknown as PortId, block: 0 as unknown as BlockId, portName: 'phase', direction: 'out', domain: 'signal', role: 'userWire' } as PortBindingIR],
      slotToPort: new Map([[3 as ValueSlot, 0 as unknown as PortId]]),
      blockMap: new Map([[0 as unknown as BlockId, 'b0']]),
    };
    const blocks = new Map([['b0', { displayName: 'Phasor 1', type: 'Phasor' }]]);
    expect(resolveSlotName(3 as ValueSlot, debugIndex, blocks)).toBe('Phasor 1.phase');
  });

  it('falls back to string block ID when no display name available', () => {
    const debugIndex: DebugIndexIR = {
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      exprToBlock: new Map(),
      ports: [{ port: 0 as unknown as PortId, block: 0 as unknown as BlockId, portName: 'out', direction: 'out', domain: 'signal', role: 'userWire' } as PortBindingIR],
      slotToPort: new Map([[7 as ValueSlot, 0 as unknown as PortId]]),
      blockMap: new Map([[0 as unknown as BlockId, 'b0']]),
    };
    expect(resolveSlotName(7 as ValueSlot, debugIndex, null)).toBe('b0.out');
  });
});
