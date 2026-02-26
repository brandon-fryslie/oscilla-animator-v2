import { describe, expect, it } from 'vitest';
import { patchProgramConstants } from '../ConstantPatcher';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import { canonicalMany, canonicalType, FLOAT, floatConst, instanceRef, unitNone } from '../../core/canonical-types';
import { valueSlot } from '../../compiler/ir/Indices';
import { domainTypeId, instanceId } from '../../core/ids';
import type { ArenaSlotDescriptor } from '../../runtime/ArenaValueStore';

function buildProgramForCountPatch(params: {
  readonly instanceCount: number;
  readonly laneCounts: readonly number[];
}): CompiledProgramIR {
  const slotBase = 36;
  const testInstanceId = instanceId('inst-fast');

  const slotMeta = params.laneCounts.map((_, idx) => ({
    slot: valueSlot(slotBase + idx),
    storage: 'f32' as const,
    offset: 0,
    stride: 1,
    type: canonicalMany(FLOAT, unitNone(), instanceRef('domain.circle', 'inst-fast')),
  }));

  const arenaLayout: ArenaSlotDescriptor[] = [];
  for (let idx = 0; idx < params.laneCounts.length; idx++) {
    const laneCount = params.laneCounts[idx]!;
    arenaLayout[slotBase + idx] = {
      offset: 0,
      stride: 1,
      laneCount,
      length: laneCount,
    };
  }

  return {
    schedule: {
      instances: new Map([
        [testInstanceId, {
          id: testInstanceId,
          domainType: domainTypeId('domain.circle'),
          count: params.instanceCount,
          lifecycle: 'static',
          maxCount: 10_000,
          identityMode: 'stable',
          elementIdSeed: 0,
        }],
      ]),
      stateMappings: [],
    },
    instanceCountProvenance: new Map([
      ['array-1:count', { instanceId: testInstanceId }],
    ]),
    slotMeta,
    arenaLayout,
    valueExprs: { nodes: [] },
  } as unknown as CompiledProgramIR;
}

describe('ConstantPatcher instance count fast-path', () => {
  it('falls back when requested count exceeds compiled arena lane capacity', () => {
    const program = buildProgramForCountPatch({ instanceCount: 8, laneCounts: [8] });

    const patched = patchProgramConstants(program, new Map([['array-1:count', 1673]]));

    expect(patched).toBeNull();
  });

  it('patches schedule instance count when requested count is within lane capacity', () => {
    const program = buildProgramForCountPatch({ instanceCount: 8, laneCounts: [8] });

    const patched = patchProgramConstants(program, new Map([['array-1:count', 5]]));

    expect(patched).not.toBeNull();
    expect(patched?.schedule.instances.get(instanceId('inst-fast'))?.count).toBe(5);
  });

  it('uses the minimum lane capacity across all slots for the same instance', () => {
    const program = buildProgramForCountPatch({ instanceCount: 8, laneCounts: [8, 6] });

    // [LAW:one-source-of-truth] All slots for an instance must respect the same
    // compiled descriptor capacity; the minimum slot capacity is authoritative.
    const patched = patchProgramConstants(program, new Map([['array-1:count', 7]]));

    expect(patched).toBeNull();
  });
});

function buildProgramForConstPatch(params: {
  readonly liveExprId: number;
  readonly patchExprId: number;
}): CompiledProgramIR {
  return {
    valueExprs: {
      nodes: [
        { kind: 'const', value: floatConst(3), type: canonicalType(FLOAT) },
        { kind: 'const', value: floatConst(5), type: canonicalType(FLOAT) },
      ],
    },
    constantProvenance: new Map([
      ['shape-1:resolution', { componentExprIds: [params.patchExprId], payloadKind: 'float' }],
    ]),
    schedule: {
      timeModel: { periodAMs: 1000, periodBMs: 2000 },
      instances: new Map(),
      steps: [
        {
          kind: 'evalOne',
          expr: params.liveExprId,
          target: valueSlot(0),
        },
      ],
      stateSlotCount: 0,
      stateMappings: [],
      eventSlotCount: 0,
      eventCount: 0,
    },
    slotMeta: [],
    arenaLayout: [],
    fieldSlotRegistry: new Map(),
    debugIndex: {
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      exprToBlock: new Map(),
      ports: [],
      slotToPort: new Map(),
      blockMap: new Map(),
    },
  } as unknown as CompiledProgramIR;
}

describe('ConstantPatcher runtime-liveness guard', () => {
  it('falls back when provenance points at a compile-time-only const expr', () => {
    const program = buildProgramForConstPatch({
      liveExprId: 0,
      patchExprId: 1,
    });

    const patched = patchProgramConstants(program, new Map([['shape-1:resolution', 12]]));
    expect(patched).toBeNull();
  });

  it('patches constants when provenance points at a runtime-live expr', () => {
    const program = buildProgramForConstPatch({
      liveExprId: 1,
      patchExprId: 1,
    });

    const patched = patchProgramConstants(program, new Map([['shape-1:resolution', 12]]));
    expect(patched).not.toBeNull();
    expect((patched!.valueExprs.nodes[1] as any).value.value).toBe(12);
  });
});
