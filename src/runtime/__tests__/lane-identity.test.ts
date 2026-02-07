/**
 * Tests for lane identity via continuity state integration (F5).
 *
 * Verifies that buildLaneIdentityMap correctly:
 * - Maps field slots to per-lane identity entries
 * - Uses instance declarations for element counts
 * - Enriches with element IDs from continuity prevDomains
 * - Resolves human-readable instance labels from debugIndex
 * - Handles edge cases (dynamic count, missing instance, empty registry)
 */

import { describe, it, expect } from 'vitest';
import { buildLaneIdentityMap } from '../ValueInspector';
import type { CompiledProgramIR, FieldSlotEntry } from '../../compiler/ir/program';
import type { InstanceDecl } from '../../compiler/ir/types';
import type { ContinuityState } from '../ContinuityState';
import { valueSlot, valueExprId } from '../../compiler/ir/Indices';
import { instanceId } from '../../core/ids';
import type { InstanceId } from '../../core/ids';

// =============================================================================
// Helpers
// =============================================================================

function makeInstanceDecl(id: InstanceId, count: number): InstanceDecl {
  return {
    id,
    domainType: 'circle' as any,
    count,
    lifecycle: 'static',
    identityMode: 'stable',
    elementIdSeed: 0,
  };
}

function makeMinimalProgram(opts: {
  fieldSlotRegistry: Map<any, FieldSlotEntry>;
  instances: Map<InstanceId, InstanceDecl>;
  blockMap?: Map<any, string>;
}): CompiledProgramIR {
  // Minimal program mock with only the fields we need
  return {
    schedule: {
      instances: opts.instances,
      steps: [],
      stateSlotCount: 0,
      stateSlots: [],
      timeModel: { kind: 'driven', source: 'raf' } as any,
      stateMappings: [],
      eventSlotCount: 0,
      eventCount: 0,
    },
    fieldSlotRegistry: opts.fieldSlotRegistry,
    debugIndex: {
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      exprToBlock: new Map(),
      ports: [],
      slotToPort: new Map(),
      blockMap: opts.blockMap ?? new Map(),
    },
    // Unused fields — typed as any to satisfy the interface
    irVersion: 1 as any,
    valueExprs: { nodes: [] },
    constants: { json: [] },
    outputs: [],
    slotMeta: [],
    renderGlobals: [],
    kernelRegistry: {} as any,
  } as CompiledProgramIR;
}

function makeEmptyContinuity(): ContinuityState {
  return {
    targets: new Map(),
    mappings: new Map(),
    prevDomains: new Map(),
    placementBasis: new Map(),
    lastTModelMs: 0,
    domainChangeThisFrame: false,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('buildLaneIdentityMap', () => {
  it('returns empty map when fieldSlotRegistry is empty', () => {
    const program = makeMinimalProgram({
      fieldSlotRegistry: new Map(),
      instances: new Map(),
    });

    const result = buildLaneIdentityMap(program, null);
    expect(result.size).toBe(0);
  });

  it('builds lane identities for a single field slot', () => {
    const instId = instanceId('spiral-instance');
    const slot = valueSlot(10);

    const fieldReg = new Map<any, FieldSlotEntry>();
    fieldReg.set(slot, { fieldId: valueExprId(1), instanceId: instId });

    const instances = new Map<InstanceId, InstanceDecl>();
    instances.set(instId, makeInstanceDecl(instId, 5));

    const program = makeMinimalProgram({ fieldSlotRegistry: fieldReg, instances });
    const result = buildLaneIdentityMap(program, null);

    expect(result.size).toBe(1);
    const lanes = result.get(slot)!;
    expect(lanes).toHaveLength(5);

    for (let i = 0; i < 5; i++) {
      expect(lanes[i].instanceId).toBe(instId);
      expect(lanes[i].laneIndex).toBe(i);
      expect(lanes[i].totalLanes).toBe(5);
      // No continuity data → no elementId
      expect(lanes[i].elementId).toBeUndefined();
    }
  });

  it('enriches with element IDs from continuity prevDomains', () => {
    const instId = instanceId('grid-instance');
    const slot = valueSlot(20);

    const fieldReg = new Map<any, FieldSlotEntry>();
    fieldReg.set(slot, { fieldId: valueExprId(2), instanceId: instId });

    const instances = new Map<InstanceId, InstanceDecl>();
    instances.set(instId, makeInstanceDecl(instId, 3));

    const program = makeMinimalProgram({ fieldSlotRegistry: fieldReg, instances });

    // Set up continuity with element IDs
    const continuity = makeEmptyContinuity();
    continuity.prevDomains.set(instId as string, {
      count: 3,
      elementId: new Uint32Array([100, 200, 300]),
      identityMode: 'stable',
    });

    const result = buildLaneIdentityMap(program, continuity);
    const lanes = result.get(slot)!;

    expect(lanes).toHaveLength(3);
    expect(lanes[0].elementId).toBe('element #100');
    expect(lanes[1].elementId).toBe('element #200');
    expect(lanes[2].elementId).toBe('element #300');
  });

  it('does not enrich when continuity has identityMode=none', () => {
    const instId = instanceId('unstable-instance');
    const slot = valueSlot(30);

    const fieldReg = new Map<any, FieldSlotEntry>();
    fieldReg.set(slot, { fieldId: valueExprId(3), instanceId: instId });

    const instances = new Map<InstanceId, InstanceDecl>();
    instances.set(instId, makeInstanceDecl(instId, 2));

    const program = makeMinimalProgram({ fieldSlotRegistry: fieldReg, instances });

    const continuity = makeEmptyContinuity();
    continuity.prevDomains.set(instId as string, {
      count: 2,
      elementId: new Uint32Array(0),
      identityMode: 'none',
    });

    const result = buildLaneIdentityMap(program, continuity);
    const lanes = result.get(slot)!;

    expect(lanes).toHaveLength(2);
    expect(lanes[0].elementId).toBeUndefined();
    expect(lanes[1].elementId).toBeUndefined();
  });

  it('skips slots where instance is not found in schedule', () => {
    const missingInstId = instanceId('missing-instance');
    const slot = valueSlot(40);

    const fieldReg = new Map<any, FieldSlotEntry>();
    fieldReg.set(slot, { fieldId: valueExprId(4), instanceId: missingInstId });

    // Empty instances map — no matching instance
    const instances = new Map<InstanceId, InstanceDecl>();

    const program = makeMinimalProgram({ fieldSlotRegistry: fieldReg, instances });
    const result = buildLaneIdentityMap(program, null);

    expect(result.size).toBe(0);
  });

  it('skips slots where instance has dynamic count', () => {
    const instId = instanceId('dynamic-instance');
    const slot = valueSlot(50);

    const fieldReg = new Map<any, FieldSlotEntry>();
    fieldReg.set(slot, { fieldId: valueExprId(5), instanceId: instId });

    const instances = new Map<InstanceId, InstanceDecl>();
    instances.set(instId, {
      ...makeInstanceDecl(instId, 0),
      count: 'dynamic' as any,
    });

    const program = makeMinimalProgram({ fieldSlotRegistry: fieldReg, instances });
    const result = buildLaneIdentityMap(program, null);

    expect(result.size).toBe(0);
  });

  it('resolves instance label from debugIndex blockMap', () => {
    const instId = instanceId('inst_golden-spiral-block');
    const slot = valueSlot(60);

    const fieldReg = new Map<any, FieldSlotEntry>();
    fieldReg.set(slot, { fieldId: valueExprId(6), instanceId: instId });

    const instances = new Map<InstanceId, InstanceDecl>();
    instances.set(instId, makeInstanceDecl(instId, 2));

    // blockMap: numeric blockId 1 → string "golden-spiral-block"
    const blockMap = new Map<any, string>();
    blockMap.set(1, 'golden-spiral-block');

    const program = makeMinimalProgram({ fieldSlotRegistry: fieldReg, instances, blockMap });
    const result = buildLaneIdentityMap(program, null);
    const lanes = result.get(slot)!;

    // instanceId "inst_golden-spiral-block" contains "golden-spiral-block"
    expect(lanes[0].instanceLabel).toBe('golden-spiral-block');
  });

  it('falls back to raw instance ID when no blockMap match', () => {
    const instId = instanceId('orphan-instance');
    const slot = valueSlot(70);

    const fieldReg = new Map<any, FieldSlotEntry>();
    fieldReg.set(slot, { fieldId: valueExprId(7), instanceId: instId });

    const instances = new Map<InstanceId, InstanceDecl>();
    instances.set(instId, makeInstanceDecl(instId, 1));

    const program = makeMinimalProgram({ fieldSlotRegistry: fieldReg, instances });
    const result = buildLaneIdentityMap(program, null);
    const lanes = result.get(slot)!;

    expect(lanes[0].instanceLabel).toBe('orphan-instance');
  });

  it('handles multiple field slots across different instances', () => {
    const inst1 = instanceId('inst-a');
    const inst2 = instanceId('inst-b');
    const slot1 = valueSlot(80);
    const slot2 = valueSlot(81);

    const fieldReg = new Map<any, FieldSlotEntry>();
    fieldReg.set(slot1, { fieldId: valueExprId(8), instanceId: inst1 });
    fieldReg.set(slot2, { fieldId: valueExprId(9), instanceId: inst2 });

    const instances = new Map<InstanceId, InstanceDecl>();
    instances.set(inst1, makeInstanceDecl(inst1, 3));
    instances.set(inst2, makeInstanceDecl(inst2, 7));

    const program = makeMinimalProgram({ fieldSlotRegistry: fieldReg, instances });
    const result = buildLaneIdentityMap(program, null);

    expect(result.size).toBe(2);
    expect(result.get(slot1)!).toHaveLength(3);
    expect(result.get(slot2)!).toHaveLength(7);

    // Verify lane indices are correct for both
    expect(result.get(slot1)![2].laneIndex).toBe(2);
    expect(result.get(slot1)![2].totalLanes).toBe(3);
    expect(result.get(slot2)![6].laneIndex).toBe(6);
    expect(result.get(slot2)![6].totalLanes).toBe(7);
  });

  it('laneIndex is always in range [0, totalLanes)', () => {
    const instId = instanceId('range-check-inst');
    const slot = valueSlot(90);

    const fieldReg = new Map<any, FieldSlotEntry>();
    fieldReg.set(slot, { fieldId: valueExprId(10), instanceId: instId });

    const instances = new Map<InstanceId, InstanceDecl>();
    instances.set(instId, makeInstanceDecl(instId, 10));

    const program = makeMinimalProgram({ fieldSlotRegistry: fieldReg, instances });
    const result = buildLaneIdentityMap(program, null);
    const lanes = result.get(slot)!;

    for (const lane of lanes) {
      expect(lane.laneIndex).toBeGreaterThanOrEqual(0);
      expect(lane.laneIndex).toBeLessThan(lane.totalLanes);
    }
  });
});
