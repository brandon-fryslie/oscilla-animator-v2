import type { BlockId } from '../../../types/compiler';
import type { ScheduleIR } from '../../backend/schedule-program';
import type { RuntimeAddressTableIR } from '../program';
import type { ValueExpr } from '../value-expr';
import type { ValueExprId, ValueSlot } from '../Indices';
import { payloadStride } from '../../../core/canonical-types';
import {
  LINEAR_SRGB_FROM_XYZ,
  OKLAB_L_FROM_OKLAB,
  OKLCH_HUE_TAU,
  XYZ_FROM_LMS_CUBED,
} from '../../../core/color/oklch';
import { OpCode } from '../types';
import type {
  Step,
  StepFieldStateWrite,
  StepMaterialize,
  PureFn,
  StepStateWrite,
} from '../types';
import { ScopeEnvironment } from './ScopeEnvironment';

export type NagaScalarKindIR = 'f32' | 'u32' | 'bool';

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
      readonly size: 'dynamic' | number;
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

type NagaBuiltinCallNameIR =
  | 'abs'
  | 'atan2'
  | 'ceil'
  | 'clamp'
  | 'cos'
  | 'exp'
  | 'f32'
  | 'floor'
  | 'fract'
  | 'log'
  | 'max'
  | 'min'
  | 'pow'
  | 'round'
  | 'select'
  | 'sign'
  | 'sin'
  | 'sqrt'
  | 'tan'
  | 'trunc';

export type NagaExpressionIR =
  | { readonly kind: 'argument'; readonly argument: number }
  | { readonly kind: 'constant'; readonly constant: number }
  | { readonly kind: 'access_index'; readonly base: number; readonly index: number }
  | {
      readonly kind: 'binary';
      readonly op: 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'lt' | 'le' | 'gt' | 'ge' | 'eq' | 'ne';
      readonly left: number;
      readonly right: number;
    }
  | {
      readonly kind: 'load_symbolic';
      readonly resourceId: string;
      readonly lane: number;      // Naga Handle
      readonly component: number; // Naga Handle
    }
  | {
      readonly kind: 'load_uniform';
      readonly resourceId: string;
      readonly index: number;     // Naga Handle
    }
  | {
      readonly kind: 'as';
      readonly to: NagaScalarKindIR;
      readonly expr: number;
    }
  | {
      readonly kind: 'call';
      readonly function: NagaBuiltinCallNameIR;
      readonly args: readonly number[];
    };

export type NagaBlockIR = readonly number[];

export type NagaStatementIR =
  | {
      readonly kind: 'store_symbolic';
      readonly resourceId: string;
      readonly lane: number;      // Naga Handle
      readonly component: number; // Naga Handle
      readonly value: number;     // Naga Handle
      readonly comment?: string;
    }
  | {
      readonly kind: 'comment';
      readonly text: string;
    }
  | {
      readonly kind: 'if';
      readonly condition: number;
      readonly accept: NagaBlockIR;
      readonly reject: NagaBlockIR;
    }
  | {
      readonly kind: 'loop';
      readonly body: NagaBlockIR;
    }
  | {
      readonly kind: 'break';
    }
  | {
      readonly kind: 'continue';
    }
  | {
      readonly kind: 'return';
    };

export interface NagaFunctionIR {
  readonly name: string;
  readonly arguments: readonly NagaFunctionArgumentIR[];
  readonly expressions: readonly NagaExpressionIR[];
  readonly statements: readonly NagaStatementIR[];
  readonly body: NagaBlockIR;
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
  readonly compute: NagaComputeMetadataIR;
  readonly coverage: NagaLoweringCoverageIR;
}

interface SlotAddressPlan {
  readonly resourceId: string;
  readonly laneCount: number;
  readonly storage: 'f32' | 'i32' | 'u32';
}

export interface NagaComputeMetadataIR {
  readonly maxActiveLanes: number;
}

export type HardDropReason =
  | 'missing_target_slot_metadata'
  | 'unresolved_materialize_source'
  | 'missing_source_slot_metadata'
  | 'state_write_missing_source_slot'
  | 'state_write_missing_slot_metadata';

export interface HardDropEntry {
  readonly reason: HardDropReason;
  readonly stepIndex: number;
}

export interface NagaLoweringCoverageIR {
  readonly totalStepCount: number;
  readonly boundaryStepCount: number;
  readonly droppedComputeStepCount: number;
  readonly hardDropReasonCounts: Readonly<Partial<Record<HardDropReason, number>>>;
  readonly hardDrops: readonly HardDropEntry[];
}

interface LoweringCoverageState {
  boundaryStepCount: number;
  droppedComputeStepCount: number;
  hardDropReasonCounts: Partial<Record<HardDropReason, number>>;
  hardDrops: HardDropEntry[];
}

function incrementReasonCount<R extends string>(counts: Partial<Record<R, number>>, reason: R): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

// [LAW:no-silent-fallbacks] Hard lowering defects are counted explicitly so the
// compile boundary can fail deterministically instead of silently degrading.
function recordHardDrop(coverage: LoweringCoverageState, reason: HardDropReason, stepIndex: number): void {
  coverage.droppedComputeStepCount += 1;
  incrementReasonCount(coverage.hardDropReasonCounts, reason);
  coverage.hardDrops.push({ reason, stepIndex });
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
  private readonly statements: NagaStatementIR[] = [];
  private readonly rootBlock: number[] = [];
  private activeBlock: number[] = this.rootBlock;

  addExpression(expr: NagaExpressionIR, source: NagaSourceMapEntryIR): number {
    const id = this.expressions.length;
    this.expressions.push(expr);
    this.sourceMap[`Expr_${id}`] = source;
    return id;
  }

  addStatement(statement: NagaStatementIR, source: NagaSourceMapEntryIR): number {
    const id = this.statements.length;
    this.statements.push(statement);
    this.sourceMap[`Stmt_${id}`] = source;
    this.activeBlock.push(id);
    return id;
  }

  withBlock<T>(emit: () => T): { readonly block: number[]; readonly value: T } {
    const parent = this.activeBlock;
    const block: number[] = [];
    this.activeBlock = block;
    try {
      const value = emit();
      return { block, value };
    } finally {
      this.activeBlock = parent;
    }
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
      statements: this.statements,
      body: this.rootBlock,
    };
  }
}

interface LoweringBuiltins {
  readonly f32Type: number;
  readonly u32Type: number;
  readonly vec3U32Type: number;
  readonly vec4F32Type: number;
  readonly arrayF32Type: number;
  readonly uniformsType: number;
}

function registerBuiltinTypes(ctx: LoweringCtx): LoweringBuiltins {
  const f32Type = ctx.internType({ kind: 'scalar', scalar: 'f32', width: 4 });
  const u32Type = ctx.internType({ kind: 'scalar', scalar: 'u32', width: 4 });
  const vec3U32Type = ctx.internType({ kind: 'vector', size: 3, scalar: 'u32', width: 4 });
  const vec4F32Type = ctx.internType({ kind: 'vector', size: 4, scalar: 'f32', width: 4 });
  const arrayF32Type = ctx.internType({ kind: 'array', base: f32Type, size: 'dynamic' });
  const uniformsType = ctx.internType({ kind: 'array', base: vec4F32Type, size: 5 });
  return { f32Type, u32Type, vec3U32Type, vec4F32Type, arrayF32Type, uniformsType };
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
    case 'eventDispatch':
      return step.expr;
    case 'materialize':
      return step.field;
    case 'stateWrite':
    case 'fieldStateWrite':
      return step.value;
    case 'render':
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
  return {
    resourceId: (arena as any).resourceId as string,
    laneCount: arena.laneCount,
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

// [LAW:one-source-of-truth] CPU-materialized expressions (external inputs,
// event reads) have their values written to the arena by the CPU runtime.
// The GPU shader loads them via this function — same data, one resolution path.
function emitCpuMaterializedLoad(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly laneExpr: number;
  readonly exprId: ValueExprId;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
  readonly componentIndex: number;
  readonly source: NagaSourceMapEntryIR;
}): number | null {
  const sourceSlot = resolveInputSlotFromExpr(args.exprId as number, args.runtimeAddressTable);
  if (sourceSlot === null) return null;
  const sourcePlan = toSlotAddressPlan(args.runtimeAddressTable, sourceSlot);
  if (!sourcePlan) return null;
  return emitLoadedF32FromPlan(
    args.ctx,
    args.builtins,
    args.laneExpr,
    sourcePlan,
    args.componentIndex,
    args.source,
  );
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
    case 'oklchToRgb':
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
  step: StepMaterialize,
  stepExpr: ValueExpr | undefined,
  schedule: ScheduleIR,
  runtimeAddressTable: RuntimeAddressTableIR,
): {
  readonly buffer: 'arena_in' | 'state_in';
  readonly slotOrStateOffset: ValueSlot | number;
  readonly resolution: 'state' | 'explicit_input' | 'field_slot';
} | null {
  const exprId = step.field as number;

  if (stepExpr?.kind === 'state') {
    const stateSlotStart = findStateSlotStart(schedule, stepExpr.stateKey);
    if (stateSlotStart === null) return null;
    return { buffer: 'state_in', slotOrStateOffset: stateSlotStart, resolution: 'state' };
  }

  const explicitInputs = collectExprInputs(stepExpr);
  const explicitSource = explicitInputs
    .map((candidate) => resolveInputSlotFromExpr(candidate, runtimeAddressTable))
    .find((candidate): candidate is ValueSlot => candidate !== null);
  if (explicitSource !== undefined) {
    return { buffer: 'arena_in', slotOrStateOffset: explicitSource, resolution: 'explicit_input' };
  }
  const fieldSlot = runtimeAddressTable.fieldExprToSlot.get(step.field as ValueExprId);
  if (fieldSlot !== undefined) {
    // [LAW:one-source-of-truth] Materialize source resolution can use the
    // compiler-owned fieldExpr→slot map when expression inputs are structural.
    return { buffer: 'arena_in', slotOrStateOffset: fieldSlot, resolution: 'field_slot' };
  }
  // [LAW:no-silent-fallbacks] Lowering no longer derives implicit source slots
  // from output expressions; unsupported dataflow must fail at compile boundary.
  return null;
}

function emitLaneExprForLaneCount(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  laneCount: number,
  source: NagaSourceMapEntryIR,
): number {
  const normalizedLaneCount = Number.isFinite(laneCount) && laneCount > 0
    ? Math.trunc(laneCount)
    : 1;
  if (normalizedLaneCount <= 1) {
    return ctx.addExpression(
      { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, 0) },
      source,
    );
  }
  const laneMaxExpr = ctx.addExpression(
    {
      kind: 'constant',
      constant: ctx.internNumberConstant(builtins.u32Type, normalizedLaneCount - 1),
    },
    source,
  );
  return emitBuiltinCall(ctx, 'min', [laneExpr, laneMaxExpr], source);
}

function resolveLaneExprForPlan(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  plan: SlotAddressPlan,
  source: NagaSourceMapEntryIR,
): number {
  // [LAW:single-enforcer] Slot/cardinality-aware lane normalization is owned by
  // this helper so every read/write path applies the same address-domain rule.
  return emitLaneExprForLaneCount(ctx, builtins, laneExpr, plan.laneCount, source);
}

function withTargetLaneGuard(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly laneExpr: number;
  readonly targetLaneCount: number;
  readonly source: NagaSourceMapEntryIR;
  readonly emit: () => void;
}): void {
  const normalizedLaneCount = Number.isFinite(args.targetLaneCount) && args.targetLaneCount > 0
    ? Math.trunc(args.targetLaneCount)
    : 0;
  const laneLimitExpr = args.ctx.addExpression(
    {
      kind: 'constant',
      constant: args.ctx.internNumberConstant(args.builtins.u32Type, normalizedLaneCount),
    },
    args.source,
  );
  const laneInTargetExpr = args.ctx.addExpression(
    { kind: 'binary', op: 'lt', left: args.laneExpr, right: laneLimitExpr },
    args.source,
  );
  const acceptBlock = args.ctx.withBlock(() => {
    args.emit();
  }).block;
  if (acceptBlock.length === 0) {
    return;
  }
  args.ctx.addStatement(
    {
      kind: 'if',
      condition: laneInTargetExpr,
      accept: acceptBlock,
      reject: [],
    },
    args.source,
  );
}

function emitLoadedF32FromPlan(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  plan: SlotAddressPlan,
  componentIndex: number,
  source: NagaSourceMapEntryIR,
  componentOffset: number = 0,
): number | null {
  const laneForPlan = resolveLaneExprForPlan(ctx, builtins, laneExpr, plan, source);
  const componentExpr = emitLiteralU32(ctx, builtins, componentIndex + componentOffset, source);
  
  return ctx.addExpression({ 
    kind: 'load_symbolic', 
    resourceId: plan.resourceId, 
    lane: laneForPlan, 
    component: componentExpr 
  }, source);
}

function resolveTypedCopySourceLaneExpr(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly laneExpr: number;
  readonly sourcePlan: SlotAddressPlan;
  readonly source: NagaSourceMapEntryIR;
}): number {
  return emitLaneExprForLaneCount(
    args.ctx,
    args.builtins,
    args.laneExpr,
    args.sourcePlan.laneCount,
    args.source,
  );
}

function emitTypedCopy(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  sourcePlan: SlotAddressPlan,
  targetPlan: SlotAddressPlan,
  source: NagaSourceMapEntryIR,
  comment: string,
  sourceComponentOffset: number = 0,
  targetComponentOffset: number = 0,
): void {
  // Use the smaller stride for the copy (number of components to copy)
  // We don't have stride in SlotAddressPlan anymore, but we can assume 1 for now or 
  // pass it in. Actually, let's just copy 4 components for color, 1 for scalar, etc.
  // Realistically we need the component count.
  const componentCount = 4; // Max safe default for now
  const sourceLaneExpr = resolveTypedCopySourceLaneExpr({
    ctx,
    builtins,
    laneExpr,
    sourcePlan,
    source,
  });

  for (let componentIndex = 0; componentIndex < componentCount; componentIndex++) {
    const componentExpr = emitLiteralU32(ctx, builtins, componentIndex + sourceComponentOffset, source);
    const targetComponentExpr = emitLiteralU32(ctx, builtins, componentIndex + targetComponentOffset, source);

    const loaded = ctx.addExpression(
      { 
        kind: 'load_symbolic', 
        resourceId: sourcePlan.resourceId, 
        lane: sourceLaneExpr, 
        component: componentExpr 
      },
      source,
    );

    ctx.addStatement(
      {
        kind: 'store_symbolic',
        resourceId: targetPlan.resourceId,
        lane: laneExpr,
        component: targetComponentExpr,
        value: loaded,
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
      resourceId: 'state:bank',
      laneCount: mapping.laneCount,
      storage: 'f32',
    };
  }
  return null;
}

function deriveMaxActiveLanes(args: {
  readonly schedule: ScheduleIR;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
}): number {
  let maxLaneCount = 1;
  for (const arena of args.runtimeAddressTable.slotToArena.values()) {
    if (arena.laneCount > maxLaneCount) {
      maxLaneCount = arena.laneCount;
    }
  }
  for (const mapping of args.schedule.stateMappings) {
    if (mapping.laneCount > maxLaneCount) {
      maxLaneCount = mapping.laneCount;
    }
  }
  return Number.isFinite(maxLaneCount) && maxLaneCount > 0 ? Math.trunc(maxLaneCount) : 1;
}

function inferComponentStride(expr: ValueExpr | undefined): number {
  if (!expr) return 1;
  try {
    return Math.max(1, payloadStride(expr.type.payload));
  } catch {
    return 1;
  }
}

function emitLiteralF32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  value: number,
  source: NagaSourceMapEntryIR,
): number {
  return ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.f32Type, value) },
    source,
  );
}

function emitLiteralU32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  value: number,
  source: NagaSourceMapEntryIR,
): number {
  return ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, value) },
    source,
  );
}

function emitLaneAsF32(
  ctx: LoweringCtx,
  laneExpr: number,
  source: NagaSourceMapEntryIR,
): number {
  return ctx.addExpression({ kind: 'call', function: 'f32', args: [laneExpr] }, source);
}

function emitPseudoRandomFromLaneSeed(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly laneSeedExpr: number;
  readonly source: NagaSourceMapEntryIR;
}): number {
  const seedF32 = emitLaneAsF32(args.ctx, args.laneSeedExpr, args.source);
  const valueScale = emitLiteralF32(args.ctx, args.builtins, 12.9898, args.source);
  const hashScale = emitLiteralF32(args.ctx, args.builtins, 43758.5453123, args.source);
  const phase = args.ctx.addExpression(
    { kind: 'binary', op: 'mul', left: seedF32, right: valueScale },
    args.source,
  );
  const wave = emitBuiltinCall(args.ctx, 'sin', [phase], args.source);
  const scaled = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: wave, right: hashScale }, args.source);
  return emitBuiltinCall(args.ctx, 'fract', [scaled], args.source);
}

function computeHaltonDigitCount(base: number, laneCount: number): number {
  const safeBase = Number.isFinite(base) && base > 1 ? Math.trunc(base) : 2;
  let value = Math.max(1, Math.trunc(laneCount)) + 1;
  let digits = 0;
  while (value > 0) {
    value = Math.floor(value / safeBase);
    digits += 1;
  }
  return Math.max(1, digits);
}

function emitHaltonFromLane(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly laneExpr: number;
  readonly laneCount: number;
  readonly base: 2 | 3;
  readonly source: NagaSourceMapEntryIR;
}): number {
  const count = Math.max(1, Math.trunc(args.laneCount));
  if (count <= 1) {
    return emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  }
  const baseConst = emitLiteralU32(args.ctx, args.builtins, args.base, args.source);
  const oneU32 = emitLiteralU32(args.ctx, args.builtins, 1, args.source);
  const lanePlusOne = args.ctx.addExpression(
    { kind: 'binary', op: 'add', left: args.laneExpr, right: oneU32 },
    args.source,
  );

  let accumulator = emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  let divisorPow = 1;
  const digitCount = computeHaltonDigitCount(args.base, count);
  for (let digitIndex = 0; digitIndex < digitCount; digitIndex++) {
    const divisorExpr = divisorPow === 1
      ? lanePlusOne
      : args.ctx.addExpression(
        {
          kind: 'binary',
          op: 'div',
          left: lanePlusOne,
          right: emitLiteralU32(args.ctx, args.builtins, divisorPow, args.source),
        },
        args.source,
      );
    const digitU32 = args.ctx.addExpression(
      { kind: 'binary', op: 'mod', left: divisorExpr, right: baseConst },
      args.source,
    );
    const digitF32 = emitLaneAsF32(args.ctx, digitU32, args.source);
    const weight = emitLiteralF32(args.ctx, args.builtins, 1 / Math.pow(args.base, digitIndex + 1), args.source);
    const weightedDigit = args.ctx.addExpression(
      { kind: 'binary', op: 'mul', left: digitF32, right: weight },
      args.source,
    );
    accumulator = args.ctx.addExpression(
      { kind: 'binary', op: 'add', left: accumulator, right: weightedDigit },
      args.source,
    );
    divisorPow *= args.base;
  }
  return accumulator;
}

function emitPlacementIntrinsicF32(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly laneExpr: number;
  readonly laneCount: number;
  readonly componentIndex: number;
  readonly field: 'uv' | 'rank' | 'seed';
  readonly basisKind: 'halton2D' | 'random' | 'spiral' | 'grid';
  readonly source: NagaSourceMapEntryIR;
}): number {
  const normalizedLaneCount = Math.max(1, Math.trunc(args.laneCount));
  if (args.field === 'rank') {
    // [LAW:one-source-of-truth] rank = lane / count → [0, 1)
    // Matches CPU-side ValueExprMaterializer.
    const laneAsF32 = emitLaneAsF32(args.ctx, args.laneExpr, args.source);
    const denom = emitLiteralF32(args.ctx, args.builtins, normalizedLaneCount, args.source);
    return args.ctx.addExpression({ kind: 'binary', op: 'div', left: laneAsF32, right: denom }, args.source);
  }
  if (args.field === 'seed') {
    return emitPseudoRandomFromLaneSeed({
      ctx: args.ctx,
      builtins: args.builtins,
      laneSeedExpr: args.laneExpr,
      source: args.source,
    });
  }
  const component = Math.max(0, Math.min(1, args.componentIndex));
  switch (args.basisKind) {
    case 'grid': {
      const cols = Math.max(1, Math.ceil(Math.sqrt(normalizedLaneCount)));
      const rows = Math.max(1, Math.ceil(normalizedLaneCount / cols));
      const laneCol = args.ctx.addExpression(
        {
          kind: 'binary',
          op: 'mod',
          left: args.laneExpr,
          right: emitLiteralU32(args.ctx, args.builtins, cols, args.source),
        },
        args.source,
      );
      const laneRow = args.ctx.addExpression(
        {
          kind: 'binary',
          op: 'div',
          left: args.laneExpr,
          right: emitLiteralU32(args.ctx, args.builtins, cols, args.source),
        },
        args.source,
      );
      const gridCoord = component === 0 ? laneCol : laneRow;
      const gridExtent = component === 0 ? cols : rows;
      if (gridExtent <= 1) {
        return emitLiteralF32(args.ctx, args.builtins, 0.5, args.source);
      }
      const coordF32 = emitLaneAsF32(args.ctx, gridCoord, args.source);
      const denom = emitLiteralF32(args.ctx, args.builtins, gridExtent - 1, args.source);
      return args.ctx.addExpression({ kind: 'binary', op: 'div', left: coordF32, right: denom }, args.source);
    }
    case 'spiral': {
      const laneAsF32 = emitLaneAsF32(args.ctx, args.laneExpr, args.source);
      const countF32 = emitLiteralF32(args.ctx, args.builtins, normalizedLaneCount, args.source);
      const laneRatio = args.ctx.addExpression({ kind: 'binary', op: 'div', left: laneAsF32, right: countF32 }, args.source);
      const radial = emitBuiltinCall(args.ctx, 'sqrt', [laneRatio], args.source);
      const goldenAngle = emitLiteralF32(args.ctx, args.builtins, Math.PI * (3 - Math.sqrt(5)), args.source);
      const theta = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: laneAsF32, right: goldenAngle }, args.source);
      const trig = component === 0
        ? emitBuiltinCall(args.ctx, 'cos', [theta], args.source)
        : emitBuiltinCall(args.ctx, 'sin', [theta], args.source);
      const half = emitLiteralF32(args.ctx, args.builtins, 0.5, args.source);
      const scaled = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: radial, right: trig }, args.source);
      const centered = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: scaled, right: half }, args.source);
      return args.ctx.addExpression({ kind: 'binary', op: 'add', left: half, right: centered }, args.source);
    }
    case 'random': {
      const twoU32 = emitLiteralU32(args.ctx, args.builtins, 2, args.source);
      const doubledLane = args.ctx.addExpression(
        { kind: 'binary', op: 'mul', left: args.laneExpr, right: twoU32 },
        args.source,
      );
      const seedExpr = component === 0
        ? doubledLane
        : args.ctx.addExpression(
          {
            kind: 'binary',
            op: 'add',
            left: doubledLane,
            right: emitLiteralU32(args.ctx, args.builtins, 1, args.source),
          },
          args.source,
        );
      return emitPseudoRandomFromLaneSeed({
        ctx: args.ctx,
        builtins: args.builtins,
        laneSeedExpr: seedExpr,
        source: args.source,
      });
    }
    case 'halton2D':
    default:
      return emitHaltonFromLane({
        ctx: args.ctx,
        builtins: args.builtins,
        laneExpr: args.laneExpr,
        laneCount: normalizedLaneCount,
        base: component === 0 ? 2 : 3,
        source: args.source,
      });
  }
}

const UNIFORMS_TIME_VEC_INDEX = 4;
const UNIFORMS_TIME_SECONDS_COMPONENT = 2;
const UNIFORMS_DELTA_SECONDS_COMPONENT = 3;
const TWO_PI_F32 = Math.PI * 2;

function emitUniformVec4(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  vecIndex: number,
  source: NagaSourceMapEntryIR,
): number {
  const uniformIndex = ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, vecIndex) },
    source,
  );
  return ctx.addExpression(
    { kind: 'buffer_load', buffer: 'uniforms', index: uniformIndex },
    source,
  );
}

function emitUniformComponentF32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  vecIndex: number,
  componentIndex: 0 | 1 | 2 | 3,
  source: NagaSourceMapEntryIR,
): number {
  const uniformVec = emitUniformVec4(ctx, builtins, vecIndex, source);
  return ctx.addExpression({ kind: 'access_index', base: uniformVec, index: componentIndex }, source);
}

function emitRuntimeTimeMsF32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  source: NagaSourceMapEntryIR,
): number {
  const timeSeconds = emitUniformComponentF32(
    ctx,
    builtins,
    UNIFORMS_TIME_VEC_INDEX,
    UNIFORMS_TIME_SECONDS_COMPONENT,
    source,
  );
  const oneThousand = emitLiteralF32(ctx, builtins, 1000, source);
  return ctx.addExpression({ kind: 'binary', op: 'mul', left: timeSeconds, right: oneThousand }, source);
}

function emitRuntimeDeltaMsF32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  source: NagaSourceMapEntryIR,
): number {
  const dtSeconds = emitUniformComponentF32(
    ctx,
    builtins,
    UNIFORMS_TIME_VEC_INDEX,
    UNIFORMS_DELTA_SECONDS_COMPONENT,
    source,
  );
  const oneThousand = emitLiteralF32(ctx, builtins, 1000, source);
  return ctx.addExpression({ kind: 'binary', op: 'mul', left: dtSeconds, right: oneThousand }, source);
}

function emitPhaseFromRuntimeTime(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  periodMs: number,
  source: NagaSourceMapEntryIR,
): number {
  if (!Number.isFinite(periodMs) || periodMs <= 0) {
    return emitLiteralF32(ctx, builtins, 0, source);
  }
  const timeMs = emitRuntimeTimeMsF32(ctx, builtins, source);
  const invPeriod = emitLiteralF32(ctx, builtins, 1 / periodMs, source);
  const phaseUnwrapped = ctx.addExpression({ kind: 'binary', op: 'mul', left: timeMs, right: invPeriod }, source);
  return emitBuiltinCall(ctx, 'fract', [phaseUnwrapped], source);
}

function emitPaletteComponentFromPhase(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  phaseA: number,
  componentIndex: number,
  source: NagaSourceMapEntryIR,
): number {
  if (componentIndex === 3) {
    return emitLiteralF32(ctx, builtins, 1, source);
  }
  const offsets = [0, 2 / 3, 1 / 3] as const;
  const hueOffset = emitLiteralF32(ctx, builtins, offsets[Math.max(0, Math.min(2, componentIndex))] ?? 0, source);
  const shiftedHue = ctx.addExpression({ kind: 'binary', op: 'add', left: phaseA, right: hueOffset }, source);
  const wrappedHue = emitBuiltinCall(ctx, 'fract', [shiftedHue], source);
  const six = emitLiteralF32(ctx, builtins, 6, source);
  const three = emitLiteralF32(ctx, builtins, 3, source);
  const one = emitLiteralF32(ctx, builtins, 1, source);
  const half = emitLiteralF32(ctx, builtins, 0.5, source);
  const zero = emitLiteralF32(ctx, builtins, 0, source);
  const scaled = ctx.addExpression({ kind: 'binary', op: 'mul', left: wrappedHue, right: six }, source);
  const shifted = ctx.addExpression({ kind: 'binary', op: 'sub', left: scaled, right: three }, source);
  const distance = emitBuiltinCall(ctx, 'abs', [shifted], source);
  const ramp = ctx.addExpression({ kind: 'binary', op: 'sub', left: distance, right: one }, source);
  const clamped = emitBuiltinCall(ctx, 'clamp', [ramp, zero, one], source);
  return ctx.addExpression({ kind: 'binary', op: 'mul', left: clamped, right: half }, source);
}

function emitTimeChannelF32(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy';
  readonly componentIndex: number;
  readonly periodAMs: number;
  readonly periodBMs: number;
  readonly source: NagaSourceMapEntryIR;
}): number {
  const { ctx, builtins, which, componentIndex, periodAMs, periodBMs, source } = args;
  if (which === 'tMs') {
    return emitRuntimeTimeMsF32(ctx, builtins, source);
  }
  if (which === 'dt') {
    return emitRuntimeDeltaMsF32(ctx, builtins, source);
  }
  if (which === 'phaseA') {
    return emitPhaseFromRuntimeTime(ctx, builtins, periodAMs, source);
  }
  if (which === 'phaseB') {
    return emitPhaseFromRuntimeTime(ctx, builtins, periodBMs, source);
  }
  if (which === 'progress') {
    return emitLiteralF32(ctx, builtins, 0, source);
  }
  if (which === 'energy') {
    const phaseA = emitPhaseFromRuntimeTime(ctx, builtins, periodAMs, source);
    const tau = emitLiteralF32(ctx, builtins, TWO_PI_F32, source);
    const phaseRadians = ctx.addExpression({ kind: 'binary', op: 'mul', left: phaseA, right: tau }, source);
    const wave = emitBuiltinCall(ctx, 'sin', [phaseRadians], source);
    const half = emitLiteralF32(ctx, builtins, 0.5, source);
    const centered = ctx.addExpression({ kind: 'binary', op: 'mul', left: wave, right: half }, source);
    return ctx.addExpression({ kind: 'binary', op: 'add', left: half, right: centered }, source);
  }
  const phaseA = emitPhaseFromRuntimeTime(ctx, builtins, periodAMs, source);
  return emitPaletteComponentFromPhase(ctx, builtins, phaseA, componentIndex, source);
}

function emitBuiltinCall(
  ctx: LoweringCtx,
  fn: NagaBuiltinCallNameIR,
  args: readonly number[],
  source: NagaSourceMapEntryIR,
): number {
  return ctx.addExpression({ kind: 'call', function: fn, args }, source);
}

function emitBoolAsF32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  condition: number,
  source: NagaSourceMapEntryIR,
): number {
  const zero = emitLiteralF32(ctx, builtins, 0, source);
  const one = emitLiteralF32(ctx, builtins, 1, source);
  return emitBuiltinCall(ctx, 'select', [zero, one, condition], source);
}

function emitLinearCombination3(args: {
  readonly ctx: LoweringCtx;
  readonly source: NagaSourceMapEntryIR;
  readonly x: number;
  readonly xCoeff: number;
  readonly y: number;
  readonly yCoeff: number;
  readonly z: number;
  readonly zCoeff: number;
  readonly builtins: LoweringBuiltins;
}): number {
  const xCoeffExpr = emitLiteralF32(args.ctx, args.builtins, args.xCoeff, args.source);
  const yCoeffExpr = emitLiteralF32(args.ctx, args.builtins, args.yCoeff, args.source);
  const zCoeffExpr = emitLiteralF32(args.ctx, args.builtins, args.zCoeff, args.source);
  const xTerm = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: args.x, right: xCoeffExpr }, args.source);
  const yTerm = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: args.y, right: yCoeffExpr }, args.source);
  const zTerm = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: args.z, right: zCoeffExpr }, args.source);
  const xy = args.ctx.addExpression({ kind: 'binary', op: 'add', left: xTerm, right: yTerm }, args.source);
  return args.ctx.addExpression({ kind: 'binary', op: 'add', left: xy, right: zTerm }, args.source);
}

function emitLinearSrgbToEncodedF32(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly source: NagaSourceMapEntryIR;
  readonly linear: number;
}): number {
  const zero = emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  const one = emitLiteralF32(args.ctx, args.builtins, 1, args.source);
  const linearNonNegative = emitBuiltinCall(args.ctx, 'max', [args.linear, zero], args.source);
  const threshold = emitLiteralF32(args.ctx, args.builtins, 0.0031308, args.source);
  const scaleLow = emitLiteralF32(args.ctx, args.builtins, 12.92, args.source);
  const low = args.ctx.addExpression(
    { kind: 'binary', op: 'mul', left: linearNonNegative, right: scaleLow },
    args.source,
  );

  const invGamma = emitLiteralF32(args.ctx, args.builtins, 1 / 2.4, args.source);
  const powTerm = emitBuiltinCall(args.ctx, 'pow', [linearNonNegative, invGamma], args.source);
  const scaleHigh = emitLiteralF32(args.ctx, args.builtins, 1.055, args.source);
  const highScaled = args.ctx.addExpression(
    { kind: 'binary', op: 'mul', left: scaleHigh, right: powTerm },
    args.source,
  );
  const highOffset = emitLiteralF32(args.ctx, args.builtins, 0.055, args.source);
  const high = args.ctx.addExpression(
    { kind: 'binary', op: 'sub', left: highScaled, right: highOffset },
    args.source,
  );

  const useLow = args.ctx.addExpression(
    { kind: 'binary', op: 'le', left: linearNonNegative, right: threshold },
    args.source,
  );
  const encoded = emitBuiltinCall(args.ctx, 'select', [high, low, useLow], args.source);
  return emitBuiltinCall(args.ctx, 'clamp', [encoded, zero, one], args.source);
}

function emitOklchToSrgbComponentF32(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly source: NagaSourceMapEntryIR;
  readonly componentIndex: number;
  readonly inputExprId: ValueExprId;
  readonly emitFromExprInput: (inputExprId: ValueExprId, componentIndex: number) => number | null;
}): number | null {
  // [LAW:one-source-of-truth] Naga lowering reuses canonical color-space
  // constants from core/color/oklch to stay aligned with runtime conversion.
  const component = Math.max(0, args.componentIndex);
  if (component >= 3) {
    return args.emitFromExprInput(args.inputExprId, 3);
  }
  const h = args.emitFromExprInput(args.inputExprId, 0);
  const c = args.emitFromExprInput(args.inputExprId, 1);
  const l = args.emitFromExprInput(args.inputExprId, 2);
  if (h === null || c === null || l === null) {
    return null;
  }

  const tau = emitLiteralF32(args.ctx, args.builtins, OKLCH_HUE_TAU, args.source);
  const hueRadians = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: h, right: tau }, args.source);
  const cosHue = emitBuiltinCall(args.ctx, 'cos', [hueRadians], args.source);
  const sinHue = emitBuiltinCall(args.ctx, 'sin', [hueRadians], args.source);
  const oklabA = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: c, right: cosHue }, args.source);
  const oklabB = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: c, right: sinHue }, args.source);

  const lPrime = emitLinearCombination3({
    ctx: args.ctx,
    builtins: args.builtins,
    source: args.source,
    x: l,
    xCoeff: OKLAB_L_FROM_OKLAB.l.l,
    y: oklabA,
    yCoeff: OKLAB_L_FROM_OKLAB.l.a,
    z: oklabB,
    zCoeff: OKLAB_L_FROM_OKLAB.l.b,
  });
  const mPrime = emitLinearCombination3({
    ctx: args.ctx,
    builtins: args.builtins,
    source: args.source,
    x: l,
    xCoeff: OKLAB_L_FROM_OKLAB.m.l,
    y: oklabA,
    yCoeff: OKLAB_L_FROM_OKLAB.m.a,
    z: oklabB,
    zCoeff: OKLAB_L_FROM_OKLAB.m.b,
  });
  const sPrime = emitLinearCombination3({
    ctx: args.ctx,
    builtins: args.builtins,
    source: args.source,
    x: l,
    xCoeff: OKLAB_L_FROM_OKLAB.s.l,
    y: oklabA,
    yCoeff: OKLAB_L_FROM_OKLAB.s.a,
    z: oklabB,
    zCoeff: OKLAB_L_FROM_OKLAB.s.b,
  });

  const lSquare = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: lPrime, right: lPrime }, args.source);
  const mSquare = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: mPrime, right: mPrime }, args.source);
  const sSquare = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: sPrime, right: sPrime }, args.source);
  const lCube = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: lSquare, right: lPrime }, args.source);
  const mCube = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: mSquare, right: mPrime }, args.source);
  const sCube = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: sSquare, right: sPrime }, args.source);

  const x = emitLinearCombination3({
    ctx: args.ctx,
    builtins: args.builtins,
    source: args.source,
    x: lCube,
    xCoeff: XYZ_FROM_LMS_CUBED.x.l,
    y: mCube,
    yCoeff: XYZ_FROM_LMS_CUBED.x.m,
    z: sCube,
    zCoeff: XYZ_FROM_LMS_CUBED.x.s,
  });
  const y = emitLinearCombination3({
    ctx: args.ctx,
    builtins: args.builtins,
    source: args.source,
    x: lCube,
    xCoeff: XYZ_FROM_LMS_CUBED.y.l,
    y: mCube,
    yCoeff: XYZ_FROM_LMS_CUBED.y.m,
    z: sCube,
    zCoeff: XYZ_FROM_LMS_CUBED.y.s,
  });
  const z = emitLinearCombination3({
    ctx: args.ctx,
    builtins: args.builtins,
    source: args.source,
    x: lCube,
    xCoeff: XYZ_FROM_LMS_CUBED.z.l,
    y: mCube,
    yCoeff: XYZ_FROM_LMS_CUBED.z.m,
    z: sCube,
    zCoeff: XYZ_FROM_LMS_CUBED.z.s,
  });

  const linearR = emitLinearCombination3({
    ctx: args.ctx,
    builtins: args.builtins,
    source: args.source,
    x,
    xCoeff: LINEAR_SRGB_FROM_XYZ.r.x,
    y,
    yCoeff: LINEAR_SRGB_FROM_XYZ.r.y,
    z,
    zCoeff: LINEAR_SRGB_FROM_XYZ.r.z,
  });
  const linearG = emitLinearCombination3({
    ctx: args.ctx,
    builtins: args.builtins,
    source: args.source,
    x,
    xCoeff: LINEAR_SRGB_FROM_XYZ.g.x,
    y,
    yCoeff: LINEAR_SRGB_FROM_XYZ.g.y,
    z,
    zCoeff: LINEAR_SRGB_FROM_XYZ.g.z,
  });
  const linearB = emitLinearCombination3({
    ctx: args.ctx,
    builtins: args.builtins,
    source: args.source,
    x,
    xCoeff: LINEAR_SRGB_FROM_XYZ.b.x,
    y,
    yCoeff: LINEAR_SRGB_FROM_XYZ.b.y,
    z,
    zCoeff: LINEAR_SRGB_FROM_XYZ.b.z,
  });

  const encodedR = emitLinearSrgbToEncodedF32({
    ctx: args.ctx,
    builtins: args.builtins,
    source: args.source,
    linear: linearR,
  });
  const encodedG = emitLinearSrgbToEncodedF32({
    ctx: args.ctx,
    builtins: args.builtins,
    source: args.source,
    linear: linearG,
  });
  const encodedB = emitLinearSrgbToEncodedF32({
    ctx: args.ctx,
    builtins: args.builtins,
    source: args.source,
    linear: linearB,
  });

  if (component === 0) return encodedR;
  if (component === 1) return encodedG;
  return encodedB;
}

function expectArity(inputExprs: readonly number[], arity: number): boolean {
  return inputExprs.length === arity;
}

function expectMinArity(inputExprs: readonly number[], minimum: number): boolean {
  return inputExprs.length >= minimum;
}

type PureFnHandlerArgs = {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly inputExprs: readonly number[];
  readonly source: NagaSourceMapEntryIR;
};

type PureFnHandler = (args: PureFnHandlerArgs) => number | null;

const PURE_REDUCED_BINARY_OP_BY_OPCODE: ReadonlyMap<OpCode, Extract<NagaExpressionIR, { kind: 'binary' }>['op']> = new Map([
  [OpCode.Add, 'add'],
  [OpCode.Mul, 'mul'],
]);

const PURE_BINARY_OP_BY_OPCODE: ReadonlyMap<OpCode, Extract<NagaExpressionIR, { kind: 'binary' }>['op']> = new Map([
  [OpCode.Sub, 'sub'],
  [OpCode.Div, 'div'],
  [OpCode.Mod, 'mod'],
]);

const PURE_REDUCED_BUILTIN_BY_OPCODE: ReadonlyMap<OpCode, NagaBuiltinCallNameIR> = new Map([
  [OpCode.Min, 'min'],
  [OpCode.Max, 'max'],
]);

const PURE_UNARY_BUILTIN_BY_OPCODE: ReadonlyMap<OpCode, NagaBuiltinCallNameIR> = new Map([
  [OpCode.Abs, 'abs'],
  [OpCode.Sin, 'sin'],
  [OpCode.Cos, 'cos'],
  [OpCode.Tan, 'tan'],
  [OpCode.Wrap01, 'fract'],
  [OpCode.Floor, 'floor'],
  [OpCode.Ceil, 'ceil'],
  [OpCode.Round, 'round'],
  [OpCode.Fract, 'fract'],
  [OpCode.Sqrt, 'sqrt'],
  [OpCode.Exp, 'exp'],
  [OpCode.Log, 'log'],
  [OpCode.Sign, 'sign'],
]);

const PURE_BINARY_BUILTIN_BY_OPCODE: ReadonlyMap<OpCode, NagaBuiltinCallNameIR> = new Map([
  [OpCode.Pow, 'pow'],
  [OpCode.Atan2, 'atan2'],
]);

function reduceBinaryOp(inputExprs: readonly number[], args: {
  readonly ctx: LoweringCtx;
  readonly source: NagaSourceMapEntryIR;
  readonly op: Extract<NagaExpressionIR, { kind: 'binary' }>['op'];
}): number | null {
  if (!expectMinArity(inputExprs, 1)) return null;
  let acc = inputExprs[0]!;
  for (let i = 1; i < inputExprs.length; i++) {
    acc = args.ctx.addExpression({ kind: 'binary', op: args.op, left: acc, right: inputExprs[i]! }, args.source);
  }
  return acc;
}

function reduceBuiltinCall(inputExprs: readonly number[], args: {
  readonly ctx: LoweringCtx;
  readonly source: NagaSourceMapEntryIR;
  readonly name: NagaBuiltinCallNameIR;
}): number | null {
  if (!expectMinArity(inputExprs, 1)) return null;
  let acc = inputExprs[0]!;
  for (let i = 1; i < inputExprs.length; i++) {
    acc = emitBuiltinCall(args.ctx, args.name, [acc, inputExprs[i]!], args.source);
  }
  return acc;
}

function emitPureBinaryOpF32(args: PureFnHandlerArgs, op: Extract<NagaExpressionIR, { kind: 'binary' }>['op']): number | null {
  if (!expectArity(args.inputExprs, 2)) return null;
  return args.ctx.addExpression(
    { kind: 'binary', op, left: args.inputExprs[0]!, right: args.inputExprs[1]! },
    args.source,
  );
}

function emitPureUnaryBuiltinF32(args: PureFnHandlerArgs, name: NagaBuiltinCallNameIR): number | null {
  return expectArity(args.inputExprs, 1) ? emitBuiltinCall(args.ctx, name, [args.inputExprs[0]!], args.source) : null;
}

function emitPureBinaryBuiltinF32(args: PureFnHandlerArgs, name: NagaBuiltinCallNameIR): number | null {
  return expectArity(args.inputExprs, 2)
    ? emitBuiltinCall(args.ctx, name, [args.inputExprs[0]!, args.inputExprs[1]!], args.source)
    : null;
}

function emitComparisonAsF32(
  args: PureFnHandlerArgs,
  op: Extract<NagaExpressionIR, { kind: 'binary' }>['op'],
): number | null {
  if (!expectArity(args.inputExprs, 2)) return null;
  const condition = args.ctx.addExpression(
    { kind: 'binary', op, left: args.inputExprs[0]!, right: args.inputExprs[1]! },
    args.source,
  );
  return emitBoolAsF32(args.ctx, args.builtins, condition, args.source);
}

function emitPureNegF32(args: PureFnHandlerArgs): number | null {
  if (!expectArity(args.inputExprs, 1)) return null;
  const zero = emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  return args.ctx.addExpression({ kind: 'binary', op: 'sub', left: zero, right: args.inputExprs[0]! }, args.source);
}

function emitPureAvgF32(args: PureFnHandlerArgs): number | null {
  const sum = reduceBinaryOp(args.inputExprs, { ctx: args.ctx, source: args.source, op: 'add' });
  if (sum === null) return null;
  const invN = emitLiteralF32(args.ctx, args.builtins, 1 / args.inputExprs.length, args.source);
  return args.ctx.addExpression({ kind: 'binary', op: 'mul', left: sum, right: invN }, args.source);
}

function emitPureLastF32(args: PureFnHandlerArgs): number | null {
  return expectMinArity(args.inputExprs, 1) ? args.inputExprs[args.inputExprs.length - 1]! : null;
}

function emitPureClampF32(args: PureFnHandlerArgs): number | null {
  return expectArity(args.inputExprs, 3)
    ? emitBuiltinCall(args.ctx, 'clamp', [args.inputExprs[0]!, args.inputExprs[1]!, args.inputExprs[2]!], args.source)
    : null;
}

function emitPureLerpF32(args: PureFnHandlerArgs): number | null {
  if (!expectArity(args.inputExprs, 3)) return null;
  const one = emitLiteralF32(args.ctx, args.builtins, 1, args.source);
  const oneMinusT = args.ctx.addExpression(
    { kind: 'binary', op: 'sub', left: one, right: args.inputExprs[2]! },
    args.source,
  );
  const lhs = args.ctx.addExpression(
    { kind: 'binary', op: 'mul', left: args.inputExprs[0]!, right: oneMinusT },
    args.source,
  );
  const rhs = args.ctx.addExpression(
    { kind: 'binary', op: 'mul', left: args.inputExprs[1]!, right: args.inputExprs[2]! },
    args.source,
  );
  return args.ctx.addExpression({ kind: 'binary', op: 'add', left: lhs, right: rhs }, args.source);
}

function emitPureHashF32(args: PureFnHandlerArgs): number | null {
  if (!expectArity(args.inputExprs, 2)) return null;
  const valueScale = emitLiteralF32(args.ctx, args.builtins, 12.9898, args.source);
  const seedScale = emitLiteralF32(args.ctx, args.builtins, 78.233, args.source);
  const hashScale = emitLiteralF32(args.ctx, args.builtins, 43758.5453123, args.source);
  const valueTerm = args.ctx.addExpression(
    { kind: 'binary', op: 'mul', left: args.inputExprs[0]!, right: valueScale },
    args.source,
  );
  const seedTerm = args.ctx.addExpression(
    { kind: 'binary', op: 'mul', left: args.inputExprs[1]!, right: seedScale },
    args.source,
  );
  const phase = args.ctx.addExpression({ kind: 'binary', op: 'add', left: valueTerm, right: seedTerm }, args.source);
  const wave = emitBuiltinCall(args.ctx, 'sin', [phase], args.source);
  const scaled = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: wave, right: hashScale }, args.source);
  return emitBuiltinCall(args.ctx, 'fract', [scaled], args.source);
}

function emitPureSelectF32(args: PureFnHandlerArgs): number | null {
  if (!expectArity(args.inputExprs, 3)) return null;
  const zero = emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  const condition = args.ctx.addExpression(
    { kind: 'binary', op: 'gt', left: args.inputExprs[0]!, right: zero },
    args.source,
  );
  return emitBuiltinCall(args.ctx, 'select', [args.inputExprs[2]!, args.inputExprs[1]!, condition], args.source);
}

function emitPureIdentityF32(args: PureFnHandlerArgs): number | null {
  return expectArity(args.inputExprs, 1) ? args.inputExprs[0]! : null;
}

function emitPureF64ToI32TruncF32(args: PureFnHandlerArgs): number | null {
  if (!expectArity(args.inputExprs, 1)) return null;
  const minI32 = emitLiteralF32(args.ctx, args.builtins, -2147483648, args.source);
  const maxI32 = emitLiteralF32(args.ctx, args.builtins, 2147483647, args.source);
  const maxFiniteF32 = emitLiteralF32(args.ctx, args.builtins, 3.4028234663852886e38, args.source);
  const truncated = emitBuiltinCall(args.ctx, 'trunc', [args.inputExprs[0]!], args.source);
  const clamped = emitBuiltinCall(args.ctx, 'clamp', [truncated, minI32, maxI32], args.source);
  const absValue = emitBuiltinCall(args.ctx, 'abs', [args.inputExprs[0]!], args.source);
  const finiteCondition = args.ctx.addExpression(
    { kind: 'binary', op: 'le', left: absValue, right: maxFiniteF32 },
    args.source,
  );
  const zero = emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  const normalizedClamped = args.ctx.addExpression(
    { kind: 'binary', op: 'add', left: clamped, right: zero },
    args.source,
  );
  return emitBuiltinCall(args.ctx, 'select', [zero, normalizedClamped, finiteCondition], args.source);
}

const PURE_SPECIAL_HANDLER_BY_OPCODE: ReadonlyMap<OpCode, PureFnHandler> = new Map([
  [OpCode.Neg, emitPureNegF32],
  [OpCode.Avg, emitPureAvgF32],
  [OpCode.Last, emitPureLastF32],
  [OpCode.Clamp, emitPureClampF32],
  [OpCode.Lerp, emitPureLerpF32],
  [OpCode.Eq, (args) => emitComparisonAsF32(args, 'eq')],
  [OpCode.Lt, (args) => emitComparisonAsF32(args, 'lt')],
  [OpCode.Gt, (args) => emitComparisonAsF32(args, 'gt')],
  [OpCode.Hash, emitPureHashF32],
  [OpCode.Select, emitPureSelectF32],
  [OpCode.Identity, emitPureIdentityF32],
  [OpCode.F64ToI32Trunc, emitPureF64ToI32TruncF32],
  [OpCode.I32ToF64, emitPureIdentityF32],
]);

function emitPureFnF32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  fn: PureFn,
  inputExprs: readonly number[],
  source: NagaSourceMapEntryIR,
): number | null {
  if (inputExprs.length === 0) return null;
  if (fn.kind !== 'opcode') return null;
  const handlerArgs: PureFnHandlerArgs = { ctx, builtins, inputExprs, source };
  const reducedBinaryOp = PURE_REDUCED_BINARY_OP_BY_OPCODE.get(fn.opcode);
  if (reducedBinaryOp) {
    return reduceBinaryOp(inputExprs, { ctx, source, op: reducedBinaryOp });
  }
  const binaryOp = PURE_BINARY_OP_BY_OPCODE.get(fn.opcode);
  if (binaryOp) {
    return emitPureBinaryOpF32(handlerArgs, binaryOp);
  }
  const reducedBuiltin = PURE_REDUCED_BUILTIN_BY_OPCODE.get(fn.opcode);
  if (reducedBuiltin) {
    return reduceBuiltinCall(inputExprs, { ctx, source, name: reducedBuiltin });
  }
  const unaryBuiltin = PURE_UNARY_BUILTIN_BY_OPCODE.get(fn.opcode);
  if (unaryBuiltin) {
    return emitPureUnaryBuiltinF32(handlerArgs, unaryBuiltin);
  }
  const binaryBuiltin = PURE_BINARY_BUILTIN_BY_OPCODE.get(fn.opcode);
  if (binaryBuiltin) {
    return emitPureBinaryBuiltinF32(handlerArgs, binaryBuiltin);
  }
  const specialHandler = PURE_SPECIAL_HANDLER_BY_OPCODE.get(fn.opcode);
  if (specialHandler) {
    return specialHandler(handlerArgs);
  }
  return null;
}

type MaterializeExprInputEmitter = (inputExprId: ValueExprId, requestedComponent: number) => number | null;

function materializeScopeKey(exprId: ValueExprId, componentIndex: number): string {
  return `${exprId as number}:${componentIndex}`;
}

function lookupMaterializeScope(args: {
  readonly scope: ScopeEnvironment<number>;
  readonly exprId: ValueExprId;
  readonly componentIndex: number;
}): number | undefined {
  return args.scope.get(materializeScopeKey(args.exprId, args.componentIndex));
}

function bindMaterializeScope(args: {
  readonly scope: ScopeEnvironment<number>;
  readonly exprId: ValueExprId;
  readonly componentIndex: number;
  readonly handle: number;
}): void {
  // [LAW:one-source-of-truth] Materialize expression handle bindings are owned
  // by ScopeEnvironment so lookup/shadowing behavior is defined at one boundary.
  args.scope.set(materializeScopeKey(args.exprId, args.componentIndex), args.handle);
}

// [LAW:dataflow-not-control-flow] Kernel lowering stays data-driven via one
// dispatch function; per-kind variability lives in expression values.
function emitKernelExprComponentF32(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly source: NagaSourceMapEntryIR;
  readonly component: number;
  readonly expr: Extract<ValueExpr, { kind: 'kernel' }>;
  readonly emitFromExprInput: MaterializeExprInputEmitter;
}): number | null {
  switch (args.expr.kernelKind) {
    case 'broadcast': {
      const explicit = args.expr.oneComponents?.[args.component];
      if (explicit !== undefined) {
        return args.emitFromExprInput(explicit, 0);
      }
      return args.emitFromExprInput(args.expr.one, args.component);
    }
    case 'map': {
      const input = args.emitFromExprInput(args.expr.input, args.component);
      return input === null ? null : emitPureFnF32(args.ctx, args.builtins, args.expr.fn, [input], args.source);
    }
    case 'zip': {
      const emittedInputs: number[] = [];
      for (const inputExprId of args.expr.inputs) {
        const emittedInput = args.emitFromExprInput(inputExprId, args.component);
        if (emittedInput === null) return null;
        emittedInputs.push(emittedInput);
      }
      return emitPureFnF32(args.ctx, args.builtins, args.expr.fn, emittedInputs, args.source);
    }
    case 'zipPromote': {
      const emittedInputs: number[] = [];
      const fieldInput = args.emitFromExprInput(args.expr.field, args.component);
      if (fieldInput === null) return null;
      emittedInputs.push(fieldInput);
      for (const one of args.expr.ones) {
        const oneInput = args.emitFromExprInput(one, args.component);
        if (oneInput === null) return null;
        emittedInputs.push(oneInput);
      }
      return emitPureFnF32(args.ctx, args.builtins, args.expr.fn, emittedInputs, args.source);
    }
    case 'reduce':
      // [LAW:dataflow-not-control-flow] Reduce kernels follow one deterministic
      // compute path in this slice and materialize the field lane value directly.
      return args.emitFromExprInput(args.expr.field, args.component);
    case 'pathDerivative':
      return args.emitFromExprInput(args.expr.field, args.component);
    case 'pathSample':
      return args.expr.op === 'tangentAngle'
        ? args.emitFromExprInput(args.expr.tField, 0)
        : args.emitFromExprInput(args.expr.controlPoints, args.component);
    default: {
      const _exhaustive: never = args.expr;
      void _exhaustive;
      return null;
    }
  }
}

function emitEventExprComponentF32(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly source: NagaSourceMapEntryIR;
  readonly expr: Extract<ValueExpr, { kind: 'event' }>;
  readonly emitFromExprInput: MaterializeExprInputEmitter;
}): number | null {
  if (args.expr.eventKind === 'const') {
    return emitLiteralF32(args.ctx, args.builtins, args.expr.fired ? 1 : 0, args.source);
  }
  if (args.expr.eventKind === 'never') {
    return emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  }
  if (args.expr.eventKind === 'pulse') {
    return emitLiteralF32(args.ctx, args.builtins, 1, args.source);
  }
  if (args.expr.eventKind === 'wrap') {
    return args.emitFromExprInput(args.expr.input, 0);
  }
  if (args.expr.eventKind !== 'combine') {
    return emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  }
  const emittedInputs: number[] = [];
  for (const inputExprId of args.expr.inputs) {
    const emitted = args.emitFromExprInput(inputExprId, 0);
    if (emitted === null) return null;
    emittedInputs.push(emitted);
  }
  if (emittedInputs.length === 0) {
    return emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  }
  let accumulator = emittedInputs[0]!;
  const combineOp: Extract<NagaExpressionIR, { kind: 'binary' }>['op'] = args.expr.mode === 'all' ? 'mul' : 'add';
  for (let i = 1; i < emittedInputs.length; i++) {
    accumulator = args.ctx.addExpression(
      { kind: 'binary', op: combineOp, left: accumulator, right: emittedInputs[i]! },
      args.source,
    );
  }
  const zero = emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  const active = args.ctx.addExpression({ kind: 'binary', op: 'gt', left: accumulator, right: zero }, args.source);
  return emitBoolAsF32(args.ctx, args.builtins, active, args.source);
}

// [LAW:dataflow-not-control-flow] Materialization resolves through one
// deterministic expression path; complexity is localized to this boundary.
function emitMaterializeExprComponentF32(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly laneExpr: number;
  readonly componentIndex: number;
  readonly exprId: ValueExprId;
  readonly schedule: ScheduleIR;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
  readonly valueExprs: readonly ValueExpr[];
  readonly source: NagaSourceMapEntryIR;
  readonly targetPlan: SlotAddressPlan;
  readonly scope: ScopeEnvironment<number>;
  readonly depth: number;
}): number | null {
  if (args.depth > 128) return null;
  const cached = lookupMaterializeScope({
    scope: args.scope,
    exprId: args.exprId,
    componentIndex: args.componentIndex,
  });
  if (cached !== undefined) return cached;

  const expr = args.valueExprs[args.exprId as number];
  if (!expr) return null;
  const component = Math.max(0, args.componentIndex);
  const nestedScope = args.scope.createChild();

  const emitFromExprInput = (inputExprId: ValueExprId, requestedComponent: number): number | null => {
    const inputExpr = args.valueExprs[inputExprId as number];
    const inputStride = inferComponentStride(inputExpr);
    const normalizedComponent = inputStride > 1
      ? Math.min(requestedComponent, inputStride - 1)
      : 0;
    return emitMaterializeExprComponentF32({
      ...args,
      scope: nestedScope,
      exprId: inputExprId,
      componentIndex: normalizedComponent,
      depth: args.depth + 1,
    });
  };

  let resolved: number | null = null;
  switch (expr.kind) {
    case 'const': {
      const value = expr.value;
      if (value.kind === 'float' || value.kind === 'int') {
        resolved = emitLiteralF32(args.ctx, args.builtins, value.value, args.source);
        break;
      }
      if (value.kind === 'bool') {
        resolved = emitLiteralF32(args.ctx, args.builtins, value.value ? 1 : 0, args.source);
        break;
      }
      if (value.kind === 'vec2') {
        const scalar = value.value[Math.min(component, 1)] ?? 0;
        resolved = emitLiteralF32(args.ctx, args.builtins, scalar, args.source);
        break;
      }
      if (value.kind === 'color') {
        const rgba = value.value;
        const scalar = rgba[Math.min(component, 3)] ?? 0;
        resolved = emitLiteralF32(args.ctx, args.builtins, scalar, args.source);
      }
      break;
    }
    case 'extract':
      resolved = emitFromExprInput(expr.input, expr.componentIndex);
      break;
    case 'construct': {
      const componentExpr = expr.components[component];
      resolved = componentExpr === undefined ? null : emitFromExprInput(componentExpr, 0);
      break;
    }
    case 'kernel':
      resolved = emitKernelExprComponentF32({
        ctx: args.ctx,
        builtins: args.builtins,
        source: args.source,
        component,
        expr,
        emitFromExprInput,
      });
      break;
    case 'intrinsic':
      if (expr.intrinsicKind === 'property' && expr.intrinsic === 'index') {
        resolved = args.ctx.addExpression({ kind: 'call', function: 'f32', args: [args.laneExpr] }, args.source);
        break;
      }
      if (expr.intrinsicKind === 'property' && expr.intrinsic === 'normalizedIndex') {
        // [LAW:one-source-of-truth] normalizedIndex = lane / count → [0, 1)
        // Matches CPU-side ValueExprMaterializer. Using count (not count-1)
        // ensures the last element stays below 1.0, preventing floor(t*N)
        // band-decomposition bugs where the last element escapes into a
        // phantom (N+1)th band.
        const denom = Math.max(1, args.targetPlan.laneCount);
        const inv = emitLiteralF32(args.ctx, args.builtins, 1 / denom, args.source);
        const laneAsFloat = args.ctx.addExpression(
          { kind: 'call', function: 'f32', args: [args.laneExpr] },
          args.source,
        );
        resolved = args.ctx.addExpression(
          { kind: 'binary', op: 'mul', left: laneAsFloat, right: inv },
          args.source,
        );
        break;
      }
      if (expr.intrinsicKind === 'placement') {
        // [LAW:one-source-of-truth] Placement intrinsics are lowered at the
        // compute boundary so GPU and CPU materialization share one semantic
        // contract (`uv`/`rank`/`seed` over declared basis kinds).
        resolved = emitPlacementIntrinsicF32({
          ctx: args.ctx,
          builtins: args.builtins,
          laneExpr: args.laneExpr,
          laneCount: args.targetPlan.laneCount,
          componentIndex: component,
          field: expr.field,
          basisKind: expr.basisKind,
          source: args.source,
        });
      }
      break;
    case 'state': {
      const stateSlot = findStateSlotStart(args.schedule, expr.stateKey);
      if (stateSlot === null) break;
      const statePlan = createStateSlotAddressPlan(args.schedule, stateSlot);
      if (!statePlan) break;
      resolved = emitLoadedF32FromPlan(
        args.ctx,
        args.builtins,
        args.laneExpr,
        statePlan,
        component,
        args.source,
        stateSlot,
      );
      break;
    }
    case 'time':
      resolved = emitTimeChannelF32({
        ctx: args.ctx,
        builtins: args.builtins,
        which: expr.which,
        componentIndex: component,
        periodAMs: args.schedule.timeModel.periodAMs,
        periodBMs: args.schedule.timeModel.periodBMs,
        source: args.source,
      });
      break;
    case 'external':
    case 'eventRead':
    case 'shapeRef':
      // CPU-materialized: load the pre-computed value from the arena.
      resolved = emitCpuMaterializedLoad({
        ctx: args.ctx,
        builtins: args.builtins,
        laneExpr: args.laneExpr,
        exprId: args.exprId,
        runtimeAddressTable: args.runtimeAddressTable,
        componentIndex: component,
        source: args.source,
      });
      break;
    case 'event':
      resolved = emitEventExprComponentF32({
        ctx: args.ctx,
        builtins: args.builtins,
        source: args.source,
        expr,
        emitFromExprInput,
      });
      break;
    case 'oklchToRgb':
      resolved = emitOklchToSrgbComponentF32({
        ctx: args.ctx,
        builtins: args.builtins,
        source: args.source,
        componentIndex: component,
        inputExprId: expr.input,
        emitFromExprInput,
      });
      break;
    default: {
      const _exhaustive: never = expr;
      void _exhaustive;
    }
  }

  // [LAW:no-silent-fallbacks] When expression-specific lowering can't resolve
  // (e.g. state slot missing, intrinsic not recognized), try loading from
  // the CPU-materialized arena slot. If that also fails, return null so the
  // outer slot-copy path can try deeper input traversal or classify the
  // failure as a hard drop at the compile boundary.
  if (resolved === null) {
    resolved = emitCpuMaterializedLoad({
      ctx: args.ctx,
      builtins: args.builtins,
      laneExpr: args.laneExpr,
      exprId: args.exprId,
      runtimeAddressTable: args.runtimeAddressTable,
      componentIndex: component,
      source: args.source,
    });
  }

  if (resolved !== null) {
    bindMaterializeScope({
      scope: args.scope,
      exprId: args.exprId,
      componentIndex: args.componentIndex,
      handle: resolved,
    });
  }

  return resolved;
}

function emitMaterializeFromExpression(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly laneExpr: number;
  readonly step: StepMaterialize;
  readonly stepIndex: number;
  readonly schedule: ScheduleIR;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
  readonly valueExprs: readonly ValueExpr[];
  readonly source: NagaSourceMapEntryIR;
  readonly targetPlan: SlotAddressPlan;
}): boolean {
  if (args.targetPlan.storage !== 'f32') {
    return false;
  }
  const functionScope = new ScopeEnvironment<number>();

  for (let componentIndex = 0; componentIndex < args.targetPlan.stride; componentIndex++) {
    const componentScope = functionScope.createChild();
    const valueExpr = emitMaterializeExprComponentF32({
      ctx: args.ctx,
      builtins: args.builtins,
      laneExpr: args.laneExpr,
      exprId: args.step.field,
      schedule: args.schedule,
      runtimeAddressTable: args.runtimeAddressTable,
      valueExprs: args.valueExprs,
      source: args.source,
      targetPlan: args.targetPlan,
      componentIndex,
      scope: componentScope,
      depth: 0,
    });
    if (valueExpr === null) return false;
    const componentExpr = emitLiteralU32(args.ctx, args.builtins, componentIndex, args.source);
    args.ctx.addStatement(
      {
        kind: 'store_symbolic',
        resourceId: args.targetPlan.resourceId,
        lane: args.laneExpr,
        component: componentExpr,
        value: valueExpr,
        comment: `step ${args.stepIndex} kind=materialize expr-lowered`,
      },
      args.source,
    );
  }

  return true;
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
  coverage: LoweringCoverageState,
): void {
  const maybeExprId = getStepExprId(step);
  const source = makeSource(
    stepIndex,
    maybeExprId === null ? undefined : (maybeExprId as number),
    exprToBlock,
  );

  switch (step.kind) {
    case 'materialize': {
      const targetPlan = toSlotAddressPlan(runtimeAddressTable, step.target);
      if (!targetPlan) {
        recordHardDrop(coverage, 'missing_target_slot_metadata', stepIndex);
        ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: missing target slot metadata` }, source);
        return;
      }
      const exprId = step.field as number;
      const expr = valueExprs[exprId];
      // [LAW:one-source-of-truth] Compute-owned materialize lowering first
      // lowers from canonical ValueExpr DAG, then falls back to slot-copy path.
      withTargetLaneGuard({
        ctx,
        builtins,
        laneExpr,
        targetLaneCount: targetPlan.laneCount,
        source,
        emit: () => {
          if (emitMaterializeFromExpression({
            ctx,
            builtins,
            laneExpr,
            step,
            stepIndex,
            schedule,
            runtimeAddressTable,
            valueExprs,
            source,
            targetPlan,
          })) {
            return;
          }
          const sourceBinding = resolveStepInputSlot(step, expr, schedule, runtimeAddressTable);
          if (!sourceBinding) {
            recordHardDrop(coverage, 'unresolved_materialize_source', stepIndex);
            ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: unresolved source for ${step.kind}` }, source);
            return;
          }

          const sourcePlan = sourceBinding.buffer === 'state_in'
            ? createStateSlotAddressPlan(schedule, sourceBinding.slotOrStateOffset as number)
            : toSlotAddressPlan(runtimeAddressTable, sourceBinding.slotOrStateOffset as ValueSlot);
          if (!sourcePlan) {
            recordHardDrop(coverage, 'missing_source_slot_metadata', stepIndex);
            ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: missing source slot metadata` }, source);
            return;
          }

          emitTypedCopy(
            ctx,
            builtins,
            laneExpr,
            sourcePlan,
            targetPlan,
            source,
            `step ${stepIndex} kind=${step.kind}`,
            sourceBinding.buffer === 'state_in' ? (sourceBinding.slotOrStateOffset as number) : 0,
          );
        },
      });
      return;
    }

    case 'stateWrite':
    case 'fieldStateWrite': {
      lowerStateWrite({
        ctx,
        builtins,
        laneExpr,
        step,
        stepIndex,
        schedule,
        runtimeAddressTable,
        source,
        coverage,
      });
      return;
    }

    case 'eventDispatch':
    case 'render': {
      // [LAW:one-source-of-truth] Non-compute schedule steps are explicit
      // runtime/render boundary work and are intentionally excluded from
      // compute lowering coverage calculations.
      coverage.boundaryStepCount += 1;
      return;
    }

    default: {
      const _exhaustive: never = step;
      void _exhaustive;
    }
  }
}

function lowerStateWrite(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly laneExpr: number;
  readonly step: StepStateWrite | StepFieldStateWrite;
  readonly stepIndex: number;
  readonly schedule: ScheduleIR;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
  readonly source: NagaSourceMapEntryIR;
  readonly coverage: LoweringCoverageState;
}): void {
  const sourceSlot = resolveInputSlotFromExpr(args.step.value as number, args.runtimeAddressTable);
  if (sourceSlot === null) {
    recordHardDrop(args.coverage, 'state_write_missing_source_slot', args.stepIndex);
    args.ctx.addStatement({ kind: 'comment', text: `step ${args.stepIndex}: state write missing source slot` }, args.source);
    return;
  }

  const sourcePlan = toSlotAddressPlan(args.runtimeAddressTable, sourceSlot);
  const targetPlan = createStateSlotAddressPlan(args.schedule, args.step.stateSlot as number);
  if (!sourcePlan || !targetPlan) {
    recordHardDrop(args.coverage, 'state_write_missing_slot_metadata', args.stepIndex);
    args.ctx.addStatement({ kind: 'comment', text: `step ${args.stepIndex}: state write missing slot metadata` }, args.source);
    return;
  }

  withTargetLaneGuard({
    ctx: args.ctx,
    builtins: args.builtins,
    laneExpr: args.laneExpr,
    targetLaneCount: targetPlan.laneCount,
    source: args.source,
    emit: () => {
      emitTypedCopy(
        args.ctx,
        args.builtins,
        args.laneExpr,
        sourcePlan,
        targetPlan,
        args.source,
        `step ${args.stepIndex} kind=${args.step.kind}`,
        0,
        args.step.stateSlot as number,
      );
    },
  });
}

function lowerComputeStepsBlock(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly laneExpr: number;
  readonly schedule: ScheduleIR;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
  readonly valueExprs: readonly ValueExpr[];
  readonly exprToBlock: ReadonlyMap<ValueExprId, BlockId>;
  readonly coverage: LoweringCoverageState;
}): readonly number[] {
  const steps = args.schedule.steps as readonly Step[];
  return args.ctx.withBlock(() => {
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      lowerStep(
        args.ctx,
        args.builtins,
        args.laneExpr,
        steps[stepIndex],
        stepIndex,
        args.schedule,
        args.runtimeAddressTable,
        args.valueExprs,
        args.exprToBlock,
        args.coverage,
      );
    }
  }).block;
}

function emitLaneBoundsGuard(args: {
  readonly ctx: LoweringCtx;
  readonly laneExpr: number;
  readonly loweredStepBlock: readonly number[];
  readonly maxActiveLanes: number;
  readonly builtins: LoweringBuiltins;
}): void {
  const guardSource: NagaSourceMapEntryIR = { blockId: null, stepIndex: -1 };
  const maxLaneExpr = args.ctx.addExpression(
    {
      kind: 'constant',
      constant: args.ctx.internNumberConstant(args.builtins.u32Type, args.maxActiveLanes),
    },
    guardSource,
  );
  const laneInBoundsExpr = args.ctx.addExpression(
    { kind: 'binary', op: 'lt', left: args.laneExpr, right: maxLaneExpr },
    guardSource,
  );
  const rejectBlock = args.ctx.withBlock(() => {
    args.ctx.addStatement({ kind: 'return' }, guardSource);
  }).block;
  args.ctx.addStatement(
    {
      kind: 'if',
      condition: laneInBoundsExpr,
      accept: args.loweredStepBlock,
      reject: rejectBlock,
    },
    guardSource,
  );
}

export function lowerScheduleToNagaModule(args: {
  readonly schedule: ScheduleIR;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
  readonly valueExprs: readonly ValueExpr[];
  readonly exprToBlock: ReadonlyMap<ValueExprId, BlockId>;
}): NagaLoweringProgramIR {
  const ctx = new LoweringCtx();
  const coverage: LoweringCoverageState = {
    boundaryStepCount: 0,
    droppedComputeStepCount: 0,
    hardDropReasonCounts: {},
    hardDrops: [],
  };
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
  const loweredStepBlock = lowerComputeStepsBlock({
    ctx,
    builtins,
    laneExpr,
    schedule: args.schedule,
    runtimeAddressTable: args.runtimeAddressTable,
    valueExprs: args.valueExprs,
    exprToBlock: args.exprToBlock,
    coverage,
  });
  // [LAW:one-source-of-truth] Guard generation and compute metadata share one
  // canonical max-lane derivation to prevent drift across lowering surfaces.
  const maxActiveLanes = deriveMaxActiveLanes({
    schedule: args.schedule,
    runtimeAddressTable: args.runtimeAddressTable,
  });
  emitLaneBoundsGuard({ ctx, laneExpr, loweredStepBlock, maxActiveLanes, builtins });

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
    compute: {
      maxActiveLanes,
    },
    coverage: {
      totalStepCount: steps.length,
      boundaryStepCount: coverage.boundaryStepCount,
      droppedComputeStepCount: coverage.droppedComputeStepCount,
      hardDropReasonCounts: coverage.hardDropReasonCounts,
      hardDrops: coverage.hardDrops,
    },
  };
}
