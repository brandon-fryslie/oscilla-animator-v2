import { describe, expect, it } from 'vitest';
import { patchProgramConstants } from '../ConstantPatcher';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import { canonicalMany, canonicalType, FLOAT, floatConst, instanceRef, unitNone } from '../../core/canonical-types';
import { valueSlot } from '../../compiler/ir/Indices';
import { domainTypeId, instanceId } from '../../core/ids';
import type { ArenaSlotDescriptor } from '../../runtime/ArenaValueStore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deserializePatchFromHCL } from '../../patch-dsl/deserialize';
import { compile } from '../../compiler';
import { EventHub } from '../../events/EventHub';
import { computeRuntimeStorageSizes } from '../../compiler/ir/program';
import { createRuntimeState, executeFrame } from '../../runtime';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';

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
          kind: 'eventDispatch',
          expr: params.liveExprId,
          target: 0,
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

function compileSimpleProgram(): {
  program: CompiledProgramIR;
  idByDisplayName: Map<string, string>;
} {
  const hcl = readFileSync(resolve(process.cwd(), 'src/demo/hcl/simple.hcl'), 'utf-8');
  const parsed = deserializePatchFromHCL(hcl);
  expect(parsed.errors).toEqual([]);

  const idByDisplayName = new Map<string, string>();
  for (const [id, block] of parsed.patch.blocks) {
    idByDisplayName.set(block.displayName, id);
  }

  const compiled = compile(parsed.patch, { events: new EventHub() });
  if (compiled.kind !== 'ok') {
    throw new Error(compiled.errors.map((e) => `${e.code}: ${e.message}`).join('\n'));
  }

  return { program: compiled.program, idByDisplayName };
}

function frameSummary(program: CompiledProgramIR): {
  pointsCount: number;
  instanceCount: number;
  firstScale: number;
} {
  const schedule = program.schedule as {
    stateSlotCount?: number;
    eventSlotCount?: number;
    eventCount?: number;
  };
  const sizes = computeRuntimeStorageSizes(program.runtimeSlots);
  const state = createRuntimeState(
    sizes.f32,
    schedule.stateSlotCount ?? 0,
    schedule.eventSlotCount ?? 0,
    schedule.eventCount ?? 0,
    program.valueExprs.nodes.length,
    program.arenaTotalFloats,
  );
  const frame = executeFrame(program, state, getTestArena(), 1370);
  const op = frame.ops[0];
  return {
    pointsCount: op?.geometry.pointsCount ?? 0,
    instanceCount: op?.instances.count ?? 0,
    firstScale: op ? (typeof op.instances.size === 'number' ? op.instances.size : op.instances.size[0]) : 0,
  };
}

describe('ConstantPatcher simple patch runtime sink gating', () => {
  it('patches runtime-live sink constants and falls back for compile-time-only constants', () => {
    const { program, idByDisplayName } = compileSimpleProgram();
    const dotId = idByDisplayName.get('dot')!;
    const wobbleId = idByDisplayName.get('dot-wobble')!;
    const clockId = idByDisplayName.get('clock')!;

    const resolutionPatched = patchProgramConstants(program, new Map([[`${dotId}:resolution`, 100]]));
    const amountPatched = patchProgramConstants(program, new Map([[`${wobbleId}:amount`, 0.01]]));
    const frequencyPatched = patchProgramConstants(program, new Map([[`${wobbleId}:frequency`, 12]]));
    const periodPatched = patchProgramConstants(program, new Map([[`${clockId}:periodAMs`, 2500]]));

    expect(resolutionPatched).toBeNull();
    expect(amountPatched).not.toBeNull();
    expect(frequencyPatched).not.toBeNull();
    expect(periodPatched).toBeNull();
  });

  it('patches render scale and immediately changes frame output', () => {
    const { program, idByDisplayName } = compileSimpleProgram();
    const renderId = idByDisplayName.get('render')!;

    const before = frameSummary(program);
    const patched = patchProgramConstants(program, new Map([[`${renderId}:scale`, 0.25]]));
    expect(patched).not.toBeNull();

    const after = frameSummary(patched!);
    expect(after.instanceCount).toBe(before.instanceCount);
    expect(after.pointsCount).toBe(before.pointsCount);
    expect(after.firstScale).not.toBeCloseTo(before.firstScale);
    expect(after.firstScale).toBeCloseTo(0.25, 5);
  });
});
