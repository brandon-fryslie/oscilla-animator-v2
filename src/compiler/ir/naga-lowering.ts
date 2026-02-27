import type { BlockId } from '../../types/compiler';
import type { ScheduleIR } from '../backend/schedule-program';
import type { RuntimeAddressTableIR } from './program';
import type { ValueExpr } from './value-expr';
import type { ValueExprId, ValueSlot } from './Indices';
import type {
  Step,
  StepContinuityApply,
  StepEvalOne,
  StepFieldStateWrite,
  StepMaterialize,
  StepStateWrite,
} from './types';

export type NagaScalarKindIR = 'f32' | 'u32';

export type NagaTypeIR =
  | {
      readonly kind: 'scalar';
      readonly scalar: NagaScalarKindIR;
      readonly width: 4;
    }
  | {
      readonly kind: 'vector';
      readonly size: 2 | 3 | 4;
      readonly scalar: NagaScalarKindIR;
      readonly width: 4;
    }
  | {
      readonly kind: 'array';
      readonly base: number;
      readonly size: 'dynamic';
    }
  | {
      readonly kind: 'struct';
      readonly name: string;
      readonly fields: readonly { readonly name: string; readonly type: number }[];
    };

export interface NagaConstantIR {
  readonly type: number;
  readonly value: number;
}

export interface NagaGlobalVariableIR {
  readonly name: 'arena_in' | 'arena_out' | 'state_in' | 'state_out' | 'uniforms';
  readonly storageClass: 'storage' | 'uniform';
  readonly access: 'read' | 'read_write';
  readonly binding: {
    readonly group: number;
    readonly binding: number;
  };
  readonly type: number;
}

export interface NagaFunctionArgumentIR {
  readonly name: string;
  readonly type: number;
  readonly builtin?: 'global_invocation_id';
}

export type NagaExpressionIR =
  | { readonly kind: 'argument'; readonly argument: number }
  | { readonly kind: 'constant'; readonly constant: number }
  | { readonly kind: 'access_index'; readonly base: number; readonly index: number }
  | {
      readonly kind: 'binary';
      readonly op: 'add' | 'mul';
      readonly left: number;
      readonly right: number;
    }
  | {
      readonly kind: 'buffer_load';
      readonly buffer: 'arena_in' | 'arena_out' | 'state_in' | 'state_out';
      readonly index: number;
    }
  | {
      readonly kind: 'as';
      readonly to: NagaScalarKindIR;
      readonly expr: number;
    };

export type NagaStatementIR =
  | {
      readonly kind: 'store';
      readonly buffer: 'arena_out' | 'state_out';
      readonly index: number;
      readonly value: number;
      readonly comment: string;
    }
  | {
      readonly kind: 'comment';
      readonly text: string;
    };

export interface NagaFunctionIR {
  readonly name: string;
  readonly arguments: readonly NagaFunctionArgumentIR[];
  readonly expressions: readonly NagaExpressionIR[];
  readonly body: readonly NagaStatementIR[];
}

export interface NagaEntryPointIR {
  readonly stage: 'compute';
  readonly function: string;
  readonly workgroupSize: readonly [number, number, number];
}

export interface NagaModuleIR {
  readonly types: readonly NagaTypeIR[];
  readonly constants: readonly NagaConstantIR[];
  readonly global_variables: readonly NagaGlobalVariableIR[];
  readonly functions: readonly NagaFunctionIR[];
  readonly entry_points: readonly NagaEntryPointIR[];
}

export interface NagaSourceMapEntryIR {
  readonly blockId: BlockId | null;
  readonly stepIndex: number;
  readonly exprId?: number;
}

export interface NagaLoweringProgramIR {
  readonly module: NagaModuleIR;
  readonly sourceMap: Readonly<Record<string, NagaSourceMapEntryIR>>;
}

interface SlotAddressPlan {
  readonly offset: number;
  readonly laneCount: number;
  readonly laneStride: number;
  readonly componentStride: number;
  readonly stride: number;
  readonly storage: 'f32' | 'i32' | 'u32' | 'shape2d';
}

class Interner<T> {
  private readonly values: T[] = [];
  private readonly indexByKey = new Map<string, number>();

  intern(key: string, value: T): number {
    const existing = this.indexByKey.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const next = this.values.length;
    this.values.push(value);
    this.indexByKey.set(key, next);
    return next;
  }

  toArray(): readonly T[] {
    return this.values;
  }
}

class LoweringCtx {
  readonly types = new Interner<NagaTypeIR>();
  readonly constants = new Interner<NagaConstantIR>();
  readonly globals: NagaGlobalVariableIR[] = [];
  readonly sourceMap: Record<string, NagaSourceMapEntryIR> = {};

  private readonly expressions: NagaExpressionIR[] = [];
  private readonly body: NagaStatementIR[] = [];

  addExpression(expr: NagaExpressionIR, source: NagaSourceMapEntryIR): number {
    const id = this.expressions.length;
    this.expressions.push(expr);
    this.sourceMap[`Expr_${id}`] = source;
    return id;
  }

  addStatement(statement: NagaStatementIR, source: NagaSourceMapEntryIR): void {
    this.body.push(statement);
    this.sourceMap[`Stmt_${this.body.length - 1}`] = source;
  }

  internType(type: NagaTypeIR): number {
    return this.types.intern(JSON.stringify(type), type);
  }

  internNumberConstant(type: number, value: number): number {
    return this.constants.intern(`${type}:${value}`, { type, value });
  }

  emitFunction(name: string, args: readonly NagaFunctionArgumentIR[]): NagaFunctionIR {
    return {
      name,
      arguments: args,
      expressions: this.expressions,
      body: this.body,
    };
  }
}

interface LoweringBuiltins {
  readonly f32Type: number;
  readonly u32Type: number;
  readonly vec3U32Type: number;
  readonly arrayF32Type: number;
  readonly uniformsType: number;
}

function registerBuiltinTypes(ctx: LoweringCtx): LoweringBuiltins {
  const f32Type = ctx.internType({ kind: 'scalar', scalar: 'f32', width: 4 });
  const u32Type = ctx.internType({ kind: 'scalar', scalar: 'u32', width: 4 });
  const vec3U32Type = ctx.internType({ kind: 'vector', size: 3, scalar: 'u32', width: 4 });
  const arrayF32Type = ctx.internType({ kind: 'array', base: f32Type, size: 'dynamic' });
  const uniformsType = ctx.internType({
    kind: 'struct',
    name: 'uniforms',
    fields: [{ name: 'dummy', type: u32Type }],
  });
  return { f32Type, u32Type, vec3U32Type, arrayF32Type, uniformsType };
}

function registerBuiltinGlobals(ctx: LoweringCtx, builtins: LoweringBuiltins): void {
  ctx.globals.push(
    {
      name: 'arena_in',
      storageClass: 'storage',
      access: 'read',
      binding: { group: 0, binding: 0 },
      type: builtins.arrayF32Type,
    },
    {
      name: 'arena_out',
      storageClass: 'storage',
      access: 'read_write',
      binding: { group: 0, binding: 1 },
      type: builtins.arrayF32Type,
    },
    {
      name: 'state_in',
      storageClass: 'storage',
      access: 'read',
      binding: { group: 0, binding: 2 },
      type: builtins.arrayF32Type,
    },
    {
      name: 'state_out',
      storageClass: 'storage',
      access: 'read_write',
      binding: { group: 0, binding: 3 },
      type: builtins.arrayF32Type,
    },
    {
      name: 'uniforms',
      storageClass: 'uniform',
      access: 'read',
      binding: { group: 0, binding: 4 },
      type: builtins.uniformsType,
    },
  );
}

function getStepExprId(step: Step): ValueExprId | null {
  switch (step.kind) {
    case 'evalOne':
    case 'eventDispatch':
      return step.expr;
    case 'materialize':
      return step.field;
    case 'stateWrite':
    case 'fieldStateWrite':
      return step.value;
    case 'render':
      return step.scale?.k === 'one' ? step.scale.id : null;
    case 'continuityApply':
    case 'continuityMapBuild':
      return null;
    default: {
      const _exhaustive: never = step;
      void _exhaustive;
      return null;
    }
  }
}

function makeSource(stepIndex: number, exprId: number | undefined, exprToBlock: ReadonlyMap<ValueExprId, BlockId>): NagaSourceMapEntryIR {
  const blockId = exprId !== undefined ? exprToBlock.get(exprId as ValueExprId) ?? null : null;
  return {
    blockId,
    stepIndex,
    exprId,
  };
}

function toSlotAddressPlan(runtimeAddressTable: RuntimeAddressTableIR, slot: ValueSlot): SlotAddressPlan | null {
  const arena = runtimeAddressTable.slotToArena.get(slot);
  const lookup = runtimeAddressTable.slotLookup.get(slot);
  if (!arena || !lookup) return null;
  const packing = arena.packing ?? 'soa';
  const laneStride = arena.laneStride ?? (packing === 'soa' ? 1 : arena.stride);
  const componentStride = arena.componentStride ?? (packing === 'soa' ? arena.laneCount : 1);
  return {
    offset: arena.offset,
    laneCount: arena.laneCount,
    laneStride,
    componentStride,
    stride: arena.stride,
    storage: lookup.storage,
  };
}

function findStateSlotStart(schedule: ScheduleIR, stateKey: string): number | null {
  for (const mapping of schedule.stateMappings) {
    if (mapping.stateId === stateKey) {
      return mapping.slotStart;
    }
  }
  return null;
}

function resolveInputSlotFromExpr(exprId: number, runtimeAddressTable: RuntimeAddressTableIR): ValueSlot | null {
  const fieldSlot = runtimeAddressTable.fieldExprToSlot.get(exprId);
  if (fieldSlot !== undefined) return fieldSlot;
  const scalarAddress = runtimeAddressTable.scalarExprToArenaAddress.get(exprId);
  if (scalarAddress) return scalarAddress.slot;
  return null;
}

function collectExprInputs(expr: ValueExpr | undefined): readonly number[] {
  if (!expr) return [];
  switch (expr.kind) {
    case 'kernel':
      switch (expr.kernelKind) {
        case 'map':
          return [expr.input as number];
        case 'zip':
          return expr.inputs.map((id) => id as number);
        case 'zipPromote':
          return [expr.field as number, ...expr.ones.map((id) => id as number)];
        case 'broadcast':
          return [expr.one as number, ...(expr.oneComponents ?? []).map((id) => id as number)];
        case 'reduce':
          return [expr.field as number];
        case 'pathDerivative':
          return [expr.field as number];
        case 'pathSample':
          return [expr.controlPoints as number, expr.tField as number];
        default: {
          const _exhaustive: never = expr;
          void _exhaustive;
          return [];
        }
      }
    case 'extract':
      return [expr.input as number];
    case 'construct':
      return expr.components.map((id) => id as number);
    case 'hslToRgb':
      return [expr.input as number];
    case 'event':
      switch (expr.eventKind) {
        case 'wrap':
          return [expr.input as number];
        case 'combine':
          return expr.inputs.map((id) => id as number);
        case 'pulse':
        case 'never':
        case 'const':
          return [];
        default: {
          const _exhaustive: never = expr;
          void _exhaustive;
          return [];
        }
      }
    default:
      return [];
  }
}

function resolveStepInputSlot(
  step: StepEvalOne | StepMaterialize,
  stepExpr: ValueExpr | undefined,
  schedule: ScheduleIR,
  runtimeAddressTable: RuntimeAddressTableIR,
): { readonly buffer: 'arena_in' | 'state_in'; readonly slotOrStateOffset: ValueSlot | number } | null {
  const exprId = step.kind === 'evalOne' ? (step.expr as number) : (step.field as number);

  if (stepExpr?.kind === 'state') {
    const stateSlotStart = findStateSlotStart(schedule, stepExpr.stateKey);
    if (stateSlotStart === null) return null;
    return { buffer: 'state_in', slotOrStateOffset: stateSlotStart };
  }

  const explicitInputs = collectExprInputs(stepExpr);
  const explicitSource = explicitInputs
    .map((candidate) => resolveInputSlotFromExpr(candidate, runtimeAddressTable))
    .find((candidate): candidate is ValueSlot => candidate !== null);
  if (explicitSource !== undefined) {
    return { buffer: 'arena_in', slotOrStateOffset: explicitSource };
  }

  const fallbackSource = resolveInputSlotFromExpr(exprId, runtimeAddressTable);
  if (fallbackSource === null) {
    return null;
  }
  return { buffer: 'arena_in', slotOrStateOffset: fallbackSource };
}

function emitAddressIndex(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  baseOffset: number,
  laneStride: number,
  componentStride: number,
  componentIndex: number,
  source: NagaSourceMapEntryIR,
): number {
  const baseConst = ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, baseOffset) },
    source,
  );
  const laneStrideConst = ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, laneStride) },
    source,
  );
  const laneOffset = ctx.addExpression(
    { kind: 'binary', op: 'mul', left: laneExpr, right: laneStrideConst },
    source,
  );
  const componentConst = ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, componentIndex) },
    source,
  );
  const componentStrideConst = ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, componentStride) },
    source,
  );
  const componentOffset = ctx.addExpression(
    { kind: 'binary', op: 'mul', left: componentConst, right: componentStrideConst },
    source,
  );
  const basePlusLane = ctx.addExpression(
    { kind: 'binary', op: 'add', left: baseConst, right: laneOffset },
    source,
  );
  return ctx.addExpression(
    { kind: 'binary', op: 'add', left: basePlusLane, right: componentOffset },
    source,
  );
}

function emitTypedCopy(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  sourcePlan: SlotAddressPlan,
  sourceBuffer: 'arena_in' | 'state_in' | 'arena_out',
  targetPlan: SlotAddressPlan,
  targetBuffer: 'arena_out' | 'state_out',
  source: NagaSourceMapEntryIR,
  comment: string,
): void {
  const componentCount = Math.min(sourcePlan.stride, targetPlan.stride);
  // [LAW:dataflow-not-control-flow] Lowering always emits the same per-component
  // sequence; lane participation is encoded as data in address expressions.
  for (let componentIndex = 0; componentIndex < componentCount; componentIndex++) {
    const sourceIndex = emitAddressIndex(
      ctx,
      builtins,
      laneExpr,
      sourcePlan.offset,
      sourcePlan.laneStride,
      sourcePlan.componentStride,
      componentIndex,
      source,
    );
    const targetIndex = emitAddressIndex(
      ctx,
      builtins,
      laneExpr,
      targetPlan.offset,
      targetPlan.laneStride,
      targetPlan.componentStride,
      componentIndex,
      source,
    );

    const loaded = ctx.addExpression(
      { kind: 'buffer_load', buffer: sourceBuffer, index: sourceIndex },
      source,
    );

    // [LAW:one-source-of-truth] Handle storage semantics are centralized here:
    // f32 arena buffers transport u32 handles via explicit bitcasts.
    const typedRead = sourcePlan.storage === 'u32'
      ? ctx.addExpression({ kind: 'as', to: 'u32', expr: loaded }, source)
      : loaded;
    const storeValue = targetPlan.storage === 'u32'
      ? ctx.addExpression({ kind: 'as', to: 'f32', expr: typedRead }, source)
      : typedRead;

    ctx.addStatement(
      {
        kind: 'store',
        buffer: targetBuffer,
        index: targetIndex,
        value: storeValue,
        comment,
      },
      source,
    );
  }
}

function createStateSlotAddressPlan(schedule: ScheduleIR, stateSlotStart: number): SlotAddressPlan | null {
  for (const mapping of schedule.stateMappings) {
    if (mapping.slotStart !== stateSlotStart) continue;
    return {
      offset: mapping.slotStart,
      laneCount: mapping.laneCount,
      laneStride: mapping.stride,
      componentStride: 1,
      stride: mapping.stride,
      storage: 'f32',
    };
  }
  return null;
}

function lowerStep(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  step: Step,
  stepIndex: number,
  schedule: ScheduleIR,
  runtimeAddressTable: RuntimeAddressTableIR,
  valueExprs: readonly ValueExpr[],
  exprToBlock: ReadonlyMap<ValueExprId, BlockId>,
): void {
  const maybeExprId = getStepExprId(step);
  const source = makeSource(
    stepIndex,
    maybeExprId === null ? undefined : (maybeExprId as number),
    exprToBlock,
  );

  switch (step.kind) {
    case 'evalOne':
    case 'materialize': {
      const targetPlan = toSlotAddressPlan(runtimeAddressTable, step.target);
      if (!targetPlan) {
        ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: missing target slot metadata` }, source);
        return;
      }
      const exprId = step.kind === 'evalOne' ? (step.expr as number) : (step.field as number);
      const expr = valueExprs[exprId];
      const sourceBinding = resolveStepInputSlot(step, expr, schedule, runtimeAddressTable);
      if (!sourceBinding) {
        ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: unresolved source for ${step.kind}` }, source);
        return;
      }

      const sourcePlan = sourceBinding.buffer === 'state_in'
        ? createStateSlotAddressPlan(schedule, sourceBinding.slotOrStateOffset as number)
        : toSlotAddressPlan(runtimeAddressTable, sourceBinding.slotOrStateOffset as ValueSlot);
      if (!sourcePlan) {
        ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: missing source slot metadata` }, source);
        return;
      }

      emitTypedCopy(
        ctx,
        builtins,
        laneExpr,
        sourcePlan,
        sourceBinding.buffer,
        targetPlan,
        'arena_out',
        source,
        `step ${stepIndex} kind=${step.kind}`,
      );
      return;
    }

    case 'continuityApply': {
      lowerContinuityApply(ctx, builtins, laneExpr, step, stepIndex, runtimeAddressTable, source);
      return;
    }

    case 'stateWrite':
    case 'fieldStateWrite': {
      lowerStateWrite(
        ctx,
        builtins,
        laneExpr,
        step,
        stepIndex,
        schedule,
        runtimeAddressTable,
        source,
      );
      return;
    }

    case 'eventDispatch':
    case 'continuityMapBuild':
    case 'render': {
      ctx.addStatement(
        {
          kind: 'comment',
          text: `step ${stepIndex} kind=${step.kind} lowered in non-compute stage`,
        },
        source,
      );
      return;
    }

    default: {
      const _exhaustive: never = step;
      void _exhaustive;
    }
  }
}

function lowerContinuityApply(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  step: StepContinuityApply,
  stepIndex: number,
  runtimeAddressTable: RuntimeAddressTableIR,
  source: NagaSourceMapEntryIR,
): void {
  const sourcePlan = toSlotAddressPlan(runtimeAddressTable, step.baseSlot);
  const targetPlan = toSlotAddressPlan(runtimeAddressTable, step.outputSlot);
  if (!sourcePlan || !targetPlan) {
    ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: continuityApply missing slot metadata` }, source);
    return;
  }

  emitTypedCopy(
    ctx,
    builtins,
    laneExpr,
    sourcePlan,
    'arena_in',
    targetPlan,
    'arena_out',
    source,
    `step ${stepIndex} kind=continuityApply semantic=${step.semantic}`,
  );
}

function lowerStateWrite(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  step: StepStateWrite | StepFieldStateWrite,
  stepIndex: number,
  schedule: ScheduleIR,
  runtimeAddressTable: RuntimeAddressTableIR,
  source: NagaSourceMapEntryIR,
): void {
  const sourceSlot = resolveInputSlotFromExpr(step.value as number, runtimeAddressTable);
  if (sourceSlot === null) {
    ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: state write missing source slot` }, source);
    return;
  }

  const sourcePlan = toSlotAddressPlan(runtimeAddressTable, sourceSlot);
  const targetPlan = createStateSlotAddressPlan(schedule, step.stateSlot as number);
  if (!sourcePlan || !targetPlan) {
    ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: state write missing slot metadata` }, source);
    return;
  }

  emitTypedCopy(
    ctx,
    builtins,
    laneExpr,
    sourcePlan,
    'arena_out',
    targetPlan,
    'state_out',
    source,
    `step ${stepIndex} kind=${step.kind}`,
  );
}

export function lowerScheduleToNagaModule(args: {
  readonly schedule: ScheduleIR;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
  readonly valueExprs: readonly ValueExpr[];
  readonly exprToBlock: ReadonlyMap<ValueExprId, BlockId>;
}): NagaLoweringProgramIR {
  const ctx = new LoweringCtx();
  const builtins = registerBuiltinTypes(ctx);
  registerBuiltinGlobals(ctx, builtins);

  // [LAW:single-enforcer] This lowerer is the single owner of ScheduleIR → Naga
  // artifact translation; no other stage emits this module shape.
  const functionArgs: readonly NagaFunctionArgumentIR[] = [
    {
      name: 'global_id',
      type: builtins.vec3U32Type,
      builtin: 'global_invocation_id',
    },
  ];
  const globalIdExpr = ctx.addExpression(
    { kind: 'argument', argument: 0 },
    { blockId: null, stepIndex: -1 },
  );
  const laneExpr = ctx.addExpression(
    { kind: 'access_index', base: globalIdExpr, index: 0 },
    { blockId: null, stepIndex: -1 },
  );

  const steps = args.schedule.steps as readonly Step[];
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    lowerStep(
      ctx,
      builtins,
      laneExpr,
      steps[stepIndex],
      stepIndex,
      args.schedule,
      args.runtimeAddressTable,
      args.valueExprs,
      args.exprToBlock,
    );
  }

  const mainFunction = ctx.emitFunction('compute_main', functionArgs);

  return {
    module: {
      types: ctx.types.toArray(),
      constants: ctx.constants.toArray(),
      global_variables: ctx.globals,
      functions: [mainFunction],
      entry_points: [
        {
          stage: 'compute',
          function: 'compute_main',
          workgroupSize: [64, 1, 1],
        },
      ],
    },
    sourceMap: ctx.sourceMap,
  };
}
