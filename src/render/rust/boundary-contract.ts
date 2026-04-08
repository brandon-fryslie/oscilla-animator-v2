/**
 * WASM Renderer Canonical Boundary Contract
 *
 * [LAW:one-source-of-truth] All JSON payloads that cross JS→Rust/WASM renderer
 * boundaries are defined, validated, and normalized here. Zod schemas are the
 * single source of truth — TypeScript types are derived via z.infer<>.
 *
 * Spec authority: design-docs/WASM-Boundary-Spec.md
 */

import { z } from 'zod';
import {
  EXPR_RULES, STMT_RULES, BUILTIN_ARG_COUNTS, FRAGMENT_ONLY_BUILTINS,
  walkIR, type RefCheck,
} from '../gpu-ir/ir-node-rules';

// ---------------------------------------------------------------------------
// Layer 1: Leaf types (no dependencies)
// ---------------------------------------------------------------------------

export const SymbolIdSchema = z.string();
export type SymbolId = z.infer<typeof SymbolIdSchema>;

export const DomainIdSchema = z.string();
export type DomainId = z.infer<typeof DomainIdSchema>;

export const TextureIdSchema = z.string();
export type TextureId = z.infer<typeof TextureIdSchema>;

export const ShapeIdSchema = z.string();
export type ShapeId = z.infer<typeof ShapeIdSchema>;

export const SamplerIdSchema = z.string();
export type SamplerId = z.infer<typeof SamplerIdSchema>;

export const StreamIdSchema = z.string();
export type StreamId = z.infer<typeof StreamIdSchema>;

export const WebGpuTopologySchema = z.enum([
  'point-list', 'line-list', 'line-strip', 'triangle-list', 'triangle-strip',
]);
export type WebGpuTopology = z.infer<typeof WebGpuTopologySchema>;

export const WgslTypeSchema = z.enum([
  'f32', 'i32', 'u32', 'bool',
  'vec2<f32>', 'vec2<i32>', 'vec2<u32>',
  'vec3<f32>', 'vec3<i32>', 'vec3<u32>',
  'vec4<f32>', 'vec4<i32>', 'vec4<u32>',
  'mat3x3<f32>', 'mat4x4<f32>',
]);
export type WgslType = z.infer<typeof WgslTypeSchema>;

export const BinaryOpSchema = z.enum([
  '+', '-', '*', '/', '%',
  '==', '!=', '<', '>', '<=', '>=',
  '&&', '||',
  '&', '|', '^', '<<', '>>',
]);
export type BinaryOp = z.infer<typeof BinaryOpSchema>;

export const UnaryOpSchema = z.enum(['!', '-', '~']);
export type UnaryOp = z.infer<typeof UnaryOpSchema>;

export const AtomicOpSchema = z.enum([
  'Add', 'Sub', 'Max', 'Min', 'And', 'Or', 'Xor', 'Exchange',
]);
export type AtomicOp = z.infer<typeof AtomicOpSchema>;

export const BuiltinMathFuncSchema = z.enum([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'exp', 'log', 'pow', 'sqrt',
  'abs', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
  'sign', 'fract', 'ceil', 'floor', 'round',
  'length', 'distance', 'dot', 'cross', 'normalize', 'reflect', 'refract',
  'fwidth', 'dpdx', 'dpdy',
  'hash_u32', 'noise_simplex_2d', 'noise_simplex_3d',
]);
export type BuiltinMathFunc = z.infer<typeof BuiltinMathFuncSchema>;

export const StencilOpSchema = z.enum([
  'keep', 'zero', 'replace', 'invert',
  'increment-clamp', 'decrement-clamp', 'increment-wrap', 'decrement-wrap',
]);
export type StencilOp = z.infer<typeof StencilOpSchema>;

// ---------------------------------------------------------------------------
// Layer 2: Simple specs (depend on Layer 1)
// ---------------------------------------------------------------------------

export const GlobalSpecSchema = z.object({
  type: z.enum(['f32', 'u32', 'i32', 'vec2', 'vec3', 'vec4', 'mat4x4']),
  isDynamic: z.boolean(),
  defaultValue: z.union([z.number(), z.array(z.number()).readonly()]),
});
export type GlobalSpec = z.infer<typeof GlobalSpecSchema>;

export const ArenaScalarSpecSchema = z.object({
  type: z.enum(['f32', 'u32', 'i32', 'atomic<u32>', 'atomic<i32>', 'vec2', 'vec3', 'vec4', 'mat4x4']),
  clearValue: z.union([z.number(), z.array(z.number()).readonly()]),
});
export type ArenaScalarSpec = z.infer<typeof ArenaScalarSpecSchema>;

export const FieldSpecSchema = z.object({
  type: z.enum(['f32', 'u32', 'i32', 'atomic<u32>', 'atomic<i32>']),
  clearValue: z.number(),
});
export type FieldSpec = z.infer<typeof FieldSpecSchema>;

export const InstanceDomainSpecSchema = z.object({
  capacity: z.number(),
  activeLanesSymbol: SymbolIdSchema,
  fields: z.record(SymbolIdSchema, FieldSpecSchema),
});
export type InstanceDomainSpec = z.infer<typeof InstanceDomainSpecSchema>;

export const DataStreamSpecSchema = z.object({
  type: z.enum(['f32', 'u32']),
  length: z.number(),
});
export type DataStreamSpec = z.infer<typeof DataStreamSpecSchema>;

export const SamplerSpecSchema = z.object({
  magFilter: z.enum(['nearest', 'linear']),
  minFilter: z.enum(['nearest', 'linear']),
  addressModeU: z.enum(['clamp-to-edge', 'repeat', 'mirror-repeat']),
  addressModeV: z.enum(['clamp-to-edge', 'repeat', 'mirror-repeat']),
});
export type SamplerSpec = z.infer<typeof SamplerSpecSchema>;

export const StaticGeometrySpecSchema = z.object({
  topology: WebGpuTopologySchema,
  vertexLayout: z.object({
    stride: z.number(),
    attributes: z.record(z.string(), z.object({
      format: z.enum(['float32x2', 'float32x3', 'float32x4']),
      shaderLocation: z.number(),
    })),
  }),
  vertexData: z.array(z.number()).readonly(),
  indexData: z.array(z.number()).readonly().optional(),
});
export type StaticGeometrySpec = z.infer<typeof StaticGeometrySpecSchema>;

export const TextureSpecSchema = z.object({
  dimension: z.enum(['1d', '2d', '3d', 'cube']),
  width: z.union([z.number(), z.object({ relativeTo: z.literal('canvas'), scale: z.number() })]),
  height: z.union([z.number(), z.object({ relativeTo: z.literal('canvas'), scale: z.number() })]).optional(),
  depthOrArrayLayers: z.number().optional(),
  format: z.string(),
  usage: z.array(z.enum(['storage', 'sampled', 'render_attachment'])).readonly(),
  externalSource: z.enum(['video', 'canvas', 'image_bitmap']).optional(),
});
export type TextureSpec = z.infer<typeof TextureSpecSchema>;

export const StencilFaceStateSchema = z.object({
  compare: z.enum(['always', 'never', 'equal', 'not-equal', 'less', 'less-equal', 'greater', 'greater-equal']),
  failOp: StencilOpSchema,
  depthFailOp: StencilOpSchema,
  passOp: StencilOpSchema,
});
export type StencilFaceState = z.infer<typeof StencilFaceStateSchema>;

export const PipelineStateSpecSchema = z.object({
  blendMode: z.enum(['opaque', 'alpha', 'additive', 'multiply']),
  cullMode: z.enum(['none', 'front', 'back']),
  depthWrite: z.boolean(),
  depthCompare: z.enum(['less', 'always', 'equal', 'greater']),
  stencilReadMask: z.number().optional(),
  stencilWriteMask: z.number().optional(),
  stencilFront: StencilFaceStateSchema.optional(),
  stencilBack: StencilFaceStateSchema.optional(),
});
export type PipelineStateSpec = z.infer<typeof PipelineStateSpecSchema>;

// ---------------------------------------------------------------------------
// Layer 3: ExprIR and StatementIR (recursive)
// ---------------------------------------------------------------------------

// Recursive types require explicit type annotation + z.lazy().
// The hand-written union types stay as the annotation target for z.ZodType<T>.

export type ExprIR =
  | { readonly type: 'LiteralF32'; readonly value: number }
  | { readonly type: 'LiteralU32'; readonly value: number }
  | { readonly type: 'LiteralI32'; readonly value: number }
  | { readonly type: 'LiteralBool'; readonly value: boolean }
  | { readonly type: 'Construct'; readonly dataType: WgslType; readonly args: readonly ExprIR[] }
  | { readonly type: 'Cast'; readonly targetType: WgslType; readonly expr: ExprIR }
  | { readonly type: 'Swizzle'; readonly source: ExprIR; readonly mask: string }
  | { readonly type: 'IndexAccess'; readonly target: ExprIR; readonly index: ExprIR }
  | { readonly type: 'Intrinsic'; readonly name: 'global_invocation_id.x' | 'global_invocation_id.y' | 'global_invocation_id.z' | 'vertex_index' | 'instance_index' }
  | { readonly type: 'LoadGlobal'; readonly symbolId: SymbolId }
  | { readonly type: 'LoadScalar'; readonly symbolId: SymbolId }
  | { readonly type: 'LoadField'; readonly symbolId: SymbolId; readonly index: ExprIR }
  | { readonly type: 'TextureSample'; readonly textureId: TextureId; readonly samplerId: SamplerId; readonly uv: ExprIR }
  | { readonly type: 'TextureLoad'; readonly textureId: TextureId; readonly coords: ExprIR }
  | { readonly type: 'AtomicLoadField'; readonly symbolId: SymbolId; readonly index: ExprIR }
  | { readonly type: 'AtomicLoadScalar'; readonly symbolId: SymbolId }
  | { readonly type: 'BinaryOp'; readonly op: BinaryOp; readonly left: ExprIR; readonly right: ExprIR }
  | { readonly type: 'UnaryOp'; readonly op: UnaryOp; readonly expr: ExprIR }
  | { readonly type: 'CallBuiltin'; readonly func: BuiltinMathFunc; readonly args: readonly ExprIR[] }
  | { readonly type: 'VarRef'; readonly name: string }
  | { readonly type: 'ApplyVP'; readonly vpSymbol: SymbolId; readonly position: ExprIR }
  | { readonly type: 'ApplyTransform2D'; readonly position: ExprIR; readonly translateX: ExprIR; readonly translateY: ExprIR; readonly rotation: ExprIR; readonly scale: ExprIR };

export const ExprIRSchema: z.ZodType<ExprIR> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('LiteralF32'), value: z.number() }),
    z.object({ type: z.literal('LiteralU32'), value: z.number() }),
    z.object({ type: z.literal('LiteralI32'), value: z.number() }),
    z.object({ type: z.literal('LiteralBool'), value: z.boolean() }),
    z.object({ type: z.literal('Construct'), dataType: WgslTypeSchema, args: z.array(ExprIRSchema).readonly() }),
    z.object({ type: z.literal('Cast'), targetType: WgslTypeSchema, expr: ExprIRSchema }),
    z.object({ type: z.literal('Swizzle'), source: ExprIRSchema, mask: z.string() }),
    z.object({ type: z.literal('IndexAccess'), target: ExprIRSchema, index: ExprIRSchema }),
    z.object({ type: z.literal('Intrinsic'), name: z.enum([
      'global_invocation_id.x', 'global_invocation_id.y', 'global_invocation_id.z',
      'vertex_index', 'instance_index',
    ])}),
    z.object({ type: z.literal('LoadGlobal'), symbolId: SymbolIdSchema }),
    z.object({ type: z.literal('LoadScalar'), symbolId: SymbolIdSchema }),
    z.object({ type: z.literal('LoadField'), symbolId: SymbolIdSchema, index: ExprIRSchema }),
    z.object({ type: z.literal('TextureSample'), textureId: TextureIdSchema, samplerId: SamplerIdSchema, uv: ExprIRSchema }),
    z.object({ type: z.literal('TextureLoad'), textureId: TextureIdSchema, coords: ExprIRSchema }),
    z.object({ type: z.literal('AtomicLoadField'), symbolId: SymbolIdSchema, index: ExprIRSchema }),
    z.object({ type: z.literal('AtomicLoadScalar'), symbolId: SymbolIdSchema }),
    z.object({ type: z.literal('BinaryOp'), op: BinaryOpSchema, left: ExprIRSchema, right: ExprIRSchema }),
    z.object({ type: z.literal('UnaryOp'), op: UnaryOpSchema, expr: ExprIRSchema }),
    z.object({ type: z.literal('CallBuiltin'), func: BuiltinMathFuncSchema, args: z.array(ExprIRSchema).readonly() }),
    z.object({ type: z.literal('VarRef'), name: z.string() }),
    z.object({ type: z.literal('ApplyVP'), vpSymbol: SymbolIdSchema, position: ExprIRSchema }),
    z.object({ type: z.literal('ApplyTransform2D'), position: ExprIRSchema, translateX: ExprIRSchema, translateY: ExprIRSchema, rotation: ExprIRSchema, scale: ExprIRSchema }),
  ]),
);

export type StatementIR =
  | { readonly type: 'Let'; readonly name: string; readonly value: ExprIR }
  | { readonly type: 'Var'; readonly name: string; readonly dataType?: WgslType; readonly value?: ExprIR }
  | { readonly type: 'Assign'; readonly target: ExprIR; readonly value: ExprIR }
  | { readonly type: 'StoreGlobal'; readonly symbolId: SymbolId; readonly value: ExprIR }
  | { readonly type: 'StoreScalar'; readonly symbolId: SymbolId; readonly value: ExprIR }
  | { readonly type: 'StoreField'; readonly symbolId: SymbolId; readonly index: ExprIR; readonly value: ExprIR }
  | { readonly type: 'TextureStore'; readonly textureId: TextureId; readonly coords: ExprIR; readonly value: ExprIR }
  | { readonly type: 'If'; readonly condition: ExprIR; readonly accept: readonly StatementIR[]; readonly reject: readonly StatementIR[] }
  | { readonly type: 'For'; readonly init: StatementIR; readonly condition: ExprIR; readonly update: StatementIR; readonly body: readonly StatementIR[] }
  | { readonly type: 'Break' }
  | { readonly type: 'Continue' }
  | { readonly type: 'AtomicOpField'; readonly op: AtomicOp; readonly symbolId: SymbolId; readonly index: ExprIR; readonly value: ExprIR; readonly assignResultTo?: string }
  | { readonly type: 'AtomicOpScalar'; readonly op: AtomicOp; readonly symbolId: SymbolId; readonly value: ExprIR; readonly assignResultTo?: string }
  | { readonly type: 'ReturnVertex'; readonly position: ExprIR; readonly varyings: Record<string, ExprIR> }
  | { readonly type: 'ReturnFragment'; readonly outputs: Record<string, ExprIR> };

export const StatementIRSchema: z.ZodType<StatementIR> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('Let'), name: z.string(), value: ExprIRSchema }),
    z.object({ type: z.literal('Var'), name: z.string(), dataType: WgslTypeSchema.optional(), value: ExprIRSchema.optional() }),
    z.object({ type: z.literal('Assign'), target: ExprIRSchema, value: ExprIRSchema }),
    z.object({ type: z.literal('StoreGlobal'), symbolId: SymbolIdSchema, value: ExprIRSchema }),
    z.object({ type: z.literal('StoreScalar'), symbolId: SymbolIdSchema, value: ExprIRSchema }),
    z.object({ type: z.literal('StoreField'), symbolId: SymbolIdSchema, index: ExprIRSchema, value: ExprIRSchema }),
    z.object({ type: z.literal('TextureStore'), textureId: TextureIdSchema, coords: ExprIRSchema, value: ExprIRSchema }),
    z.object({ type: z.literal('If'), condition: ExprIRSchema, accept: z.array(StatementIRSchema).readonly(), reject: z.array(StatementIRSchema).readonly() }),
    z.object({ type: z.literal('For'), init: StatementIRSchema, condition: ExprIRSchema, update: StatementIRSchema, body: z.array(StatementIRSchema).readonly() }),
    z.object({ type: z.literal('Break') }),
    z.object({ type: z.literal('Continue') }),
    z.object({ type: z.literal('AtomicOpField'), op: AtomicOpSchema, symbolId: SymbolIdSchema, index: ExprIRSchema, value: ExprIRSchema, assignResultTo: z.string().optional() }),
    z.object({ type: z.literal('AtomicOpScalar'), op: AtomicOpSchema, symbolId: SymbolIdSchema, value: ExprIRSchema, assignResultTo: z.string().optional() }),
    z.object({ type: z.literal('ReturnVertex'), position: ExprIRSchema, varyings: z.record(z.string(), ExprIRSchema) }),
    z.object({ type: z.literal('ReturnFragment'), outputs: z.record(z.string(), ExprIRSchema) }),
  ]),
);

// ---------------------------------------------------------------------------
// Layer 4: Roster entries (depend on Layer 3)
// ---------------------------------------------------------------------------

export const ComputePassSpecSchema = z.object({
  type: z.literal('Compute'),
  passId: z.string(),
  sourceBlockIds: z.array(z.string()).readonly(),
  workgroupSize: z.tuple([z.number(), z.number(), z.number()]).readonly(),
  dispatch: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('Domain'), domainId: DomainIdSchema }),
    z.object({ mode: z.literal('Texture'), textureId: TextureIdSchema }),
    z.object({ mode: z.literal('Exact'), x: z.number(), y: z.number(), z: z.number() }),
  ]),
  dependencies: z.object({
    requiresGlobals: z.boolean(),
    domains: z.record(DomainIdSchema, z.enum(['read', 'read_write'])),
    textures: z.record(TextureIdSchema, z.enum(['read', 'write', 'read_write'])),
  }),
  ast: z.array(StatementIRSchema).readonly(),
});
export type ComputePassSpec = z.infer<typeof ComputePassSpecSchema>;

export const SystemPassSpecSchema = z.object({
  type: z.literal('System_DrawPrep'),
  passId: z.string(),
  sourceBlockIds: z.array(z.string()).readonly(),
  activeLanesSymbol: SymbolIdSchema,
  vertexCount: z.number(),
});
export type SystemPassSpec = z.infer<typeof SystemPassSpecSchema>;

export const SystemCameraUpdateSpecSchema = z.object({
  type: z.literal('System_CameraUpdate'),
  passId: z.string(),
  cameraRef: SymbolIdSchema,
  ast: z.array(StatementIRSchema).readonly(),
});
export type SystemCameraUpdateSpec = z.infer<typeof SystemCameraUpdateSpecSchema>;

export const DrawCallSpecSchema = z.object({
  intentId: z.string(),
  source: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('Domain'),
      domainId: DomainIdSchema,
      sourceKind: z.enum(['Topology', 'Parametric', 'Field', 'SolverResource']),
      shapeId: ShapeIdSchema,
    }),
    z.object({ type: z.literal('FullScreenQuad') }),
  ]),
  pipelineState: PipelineStateSpecSchema,
  dependencies: z.object({
    requiresGlobals: z.boolean(),
    cameraRef: SymbolIdSchema,
    domains: z.record(DomainIdSchema, z.literal('read')),
    textures: z.record(TextureIdSchema, z.literal('sampled')),
  }),
  vertexAst: z.array(StatementIRSchema).readonly(),
  fragmentAst: z.array(StatementIRSchema).readonly(),
});
export type DrawCallSpec = z.infer<typeof DrawCallSpecSchema>;

/** Viewport in pixel coordinates. Resolved by the TS compiler from declared target dimensions. */
export const ViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  minDepth: z.number(),
  maxDepth: z.number(),
});
export type Viewport = z.infer<typeof ViewportSchema>;

/** Scissor rect in pixel coordinates. Resolved by the TS compiler from declared target dimensions. */
export const ScissorRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type ScissorRect = z.infer<typeof ScissorRectSchema>;

export const RenderPassSpecSchema = z.object({
  type: z.literal('Render'),
  passId: z.string(),
  sourceBlockIds: z.array(z.string()).readonly(),
  sampleCount: z.number(),
  targets: z.object({
    colors: z.array(z.object({
      textureId: z.union([TextureIdSchema, z.literal('canvas')]),
      loadOp: z.enum(['load', 'clear']),
      clearColor: z.tuple([z.number(), z.number(), z.number(), z.number()]).readonly().optional(),
    })).readonly(),
    depthStencil: z.object({
      textureId: TextureIdSchema,
      // [LAW:dataflow-not-control-flow] Op + value live in one variant so the
      // load/clear distinction can't drift apart at consumer sites.
      depth: z.discriminatedUnion('op', [
        z.object({ op: z.literal('load') }),
        z.object({ op: z.literal('clear'), value: z.number() }),
      ]).optional(),
      stencil: z.discriminatedUnion('op', [
        z.object({ op: z.literal('load') }),
        z.object({ op: z.literal('clear'), value: z.number() }),
      ]).optional(),
    }).optional(),
  }),
  viewport: ViewportSchema,
  scissorRect: ScissorRectSchema,
  drawCalls: z.array(DrawCallSpecSchema).readonly(),
});
export type RenderPassSpec = z.infer<typeof RenderPassSpecSchema>;

export const CompositePassSpecSchema = z.object({
  type: z.literal('Composite'),
  passId: z.string(),
  sourceBlockIds: z.array(z.string()).readonly(),
  sampleCount: z.number(),
  targets: z.object({
    colors: z.array(z.object({
      textureId: z.union([TextureIdSchema, z.literal('canvas')]),
      loadOp: z.enum(['load', 'clear']),
      clearColor: z.tuple([z.number(), z.number(), z.number(), z.number()]).readonly().optional(),
    })).readonly(),
  }),
  viewport: ViewportSchema,
  scissorRect: ScissorRectSchema,
  drawCalls: z.array(DrawCallSpecSchema).readonly(),
});
export type CompositePassSpec = z.infer<typeof CompositePassSpecSchema>;

export const RosterEntrySchema = z.discriminatedUnion('type', [
  ComputePassSpecSchema,
  RenderPassSpecSchema,
  CompositePassSpecSchema,
  SystemPassSpecSchema,
  SystemCameraUpdateSpecSchema,
]);
export type RosterEntry = z.infer<typeof RosterEntrySchema>;

const ExecutionRosterSchema = z.array(RosterEntrySchema).readonly();
export type ExecutionRoster = z.infer<typeof ExecutionRosterSchema>;

// ---------------------------------------------------------------------------
// Layer 5: Top-level payload + receipt
// ---------------------------------------------------------------------------

export const MemoryManifestSchema = z.object({
  preserveStateOnRecompile: z.boolean(),
  globals: z.record(SymbolIdSchema, GlobalSpecSchema),
  arenaScalars: z.record(SymbolIdSchema, ArenaScalarSpecSchema),
  domains: z.record(DomainIdSchema, InstanceDomainSpecSchema),
  textures: z.record(TextureIdSchema, TextureSpecSchema),
  shapeBank: z.record(ShapeIdSchema, StaticGeometrySpecSchema),
  dataStreams: z.record(StreamIdSchema, DataStreamSpecSchema),
  samplers: z.record(SamplerIdSchema, SamplerSpecSchema),
});
export type MemoryManifest = z.infer<typeof MemoryManifestSchema>;

// ---------------------------------------------------------------------------
// Semantic validation — uses walkIR from ir-node-rules
// ---------------------------------------------------------------------------

/**
 * Validate semantic consistency of a PipelineInstallPayload.
 * Driven by EXPR_RULES and STMT_RULES tables via walkIR — no case statements.
 */
function validatePayloadSemantics(
  payload: { manifest: MemoryManifest; roster: readonly RosterEntry[] },
  ctx: z.RefinementCtx,
): void {
  const { manifest, roster } = payload;

  // Build lookup sets from manifest
  const lookups: Record<RefCheck, Set<string>> = {
    global: new Set(Object.keys(manifest.globals)),
    scalar: new Set(Object.keys(manifest.arenaScalars)),
    field: new Set<string>(),
    atomicField: new Set<string>(),
    texture: new Set(Object.keys(manifest.textures)),
    sampler: new Set(Object.keys(manifest.samplers)),
  };
  const domainIds = new Set(Object.keys(manifest.domains));
  const shapeIds = new Set(Object.keys(manifest.shapeBank));

  for (const [domainId, domain] of Object.entries(manifest.domains)) {
    for (const [fieldName, fieldSpec] of Object.entries(domain.fields)) {
      const symbolId = `${domainId}:${fieldName}`;
      lookups.field.add(symbolId);
      if (fieldSpec.type === 'atomic<u32>' || fieldSpec.type === 'atomic<i32>') {
        lookups.atomicField.add(symbolId);
      }
    }
  }

  const REF_LABELS: Record<RefCheck, string> = {
    global: 'manifest.globals', scalar: 'manifest.arenaScalars',
    field: 'manifest domains', atomicField: 'manifest (must be atomic<u32> or atomic<i32>)',
    texture: 'manifest.textures', sampler: 'manifest.samplers',
  };

  function issue(path: readonly (string | number)[], message: string): void {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path], message });
  }

  type Stage = 'compute' | 'vertex' | 'fragment';

  function makeValidationVisitor(stage: Stage) {
    return {
      onExpr(expr: ExprIR, rule: (typeof EXPR_RULES)[ExprIR['type']], path: readonly (string | number)[]) {
        // Reference checks
        const node = expr as Record<string, unknown>;
        for (const [field, check] of rule.refs) {
          const id = node[field] as string;
          if (!lookups[check].has(id)) {
            issue([...path, field], `'${id}' not in ${REF_LABELS[check]}`);
          }
        }

        // Special: CallBuiltin arg count + fragment-only
        if (rule.special === 'builtinArgCount' && expr.type === 'CallBuiltin') {
          const expected = BUILTIN_ARG_COUNTS[expr.func];
          if (expr.args.length !== expected) {
            issue([...path, 'args'], `${expr.func}() expects ${expected} arg(s), got ${expr.args.length}`);
          }
          if (stage !== 'fragment' && FRAGMENT_ONLY_BUILTINS.has(expr.func)) {
            issue([...path, 'func'], `${expr.func}() is only valid in fragment shaders`);
          }
        }
      },
      onStmt(stmt: StatementIR, rule: (typeof STMT_RULES)[StatementIR['type']], path: readonly (string | number)[]) {
        // Reference checks
        const node = stmt as Record<string, unknown>;
        for (const [field, check] of rule.refs) {
          const id = node[field] as string;
          if (!lookups[check].has(id)) {
            issue([...path, field], `'${id}' not in ${REF_LABELS[check]}`);
          }
        }
      },
    };
  }

  // Validate roster entries
  for (let i = 0; i < roster.length; i++) {
    const entry = roster[i];
    const bp = ['roster', i]; // base path

    if (entry.type === 'Compute') {
      if (entry.dispatch.mode === 'Domain' && !domainIds.has(entry.dispatch.domainId))
        issue([...bp, 'dispatch', 'domainId'], `Domain '${entry.dispatch.domainId}' not in manifest`);
      if (entry.dispatch.mode === 'Texture' && !lookups.texture.has(entry.dispatch.textureId))
        issue([...bp, 'dispatch', 'textureId'], `Texture '${entry.dispatch.textureId}' not in manifest`);
      for (const d of Object.keys(entry.dependencies.domains))
        if (!domainIds.has(d)) issue([...bp, 'dependencies', 'domains', d], `Domain '${d}' not in manifest`);
      for (const t of Object.keys(entry.dependencies.textures))
        if (!lookups.texture.has(t)) issue([...bp, 'dependencies', 'textures', t], `Texture '${t}' not in manifest`);
      walkIR(entry.ast, makeValidationVisitor('compute'), [...bp, 'ast']);
    }
    if (entry.type === 'System_DrawPrep') {
      if (!lookups.scalar.has(entry.activeLanesSymbol))
        issue([...bp, 'activeLanesSymbol'], `Scalar '${entry.activeLanesSymbol}' not in manifest.arenaScalars`);
    }
    if (entry.type === 'Render') {
      for (let j = 0; j < entry.drawCalls.length; j++) {
        const dc = entry.drawCalls[j];
        const dp = [...bp, 'drawCalls', j];
        if (dc.source.type === 'Domain') {
          if (!domainIds.has(dc.source.domainId)) issue([...dp, 'source', 'domainId'], `Domain '${dc.source.domainId}' not in manifest`);
          if (!shapeIds.has(dc.source.shapeId)) issue([...dp, 'source', 'shapeId'], `Shape '${dc.source.shapeId}' not in manifest.shapeBank`);
        }
        if (dc.dependencies.cameraRef && !lookups.global.has(dc.dependencies.cameraRef) && !lookups.scalar.has(dc.dependencies.cameraRef))
          issue([...dp, 'dependencies', 'cameraRef'], `'${dc.dependencies.cameraRef}' not in manifest.globals or manifest.arenaScalars`);
        for (const d of Object.keys(dc.dependencies.domains))
          if (!domainIds.has(d)) issue([...dp, 'dependencies', 'domains', d], `Domain '${d}' not in manifest`);
        for (const t of Object.keys(dc.dependencies.textures))
          if (!lookups.texture.has(t)) issue([...dp, 'dependencies', 'textures', t], `Texture '${t}' not in manifest`);
        walkIR(dc.vertexAst, makeValidationVisitor('vertex'), [...dp, 'vertexAst']);
        walkIR(dc.fragmentAst, makeValidationVisitor('fragment'), [...dp, 'fragmentAst']);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// WGSL function registration — arbitrary functions shipped with the payload
// ---------------------------------------------------------------------------

export const WgslFunctionSchema = z.object({
  /** Callable name in the DSL — must match the public function in the WGSL source */
  name: z.string(),
  /** Complete WGSL source — may contain helper functions */
  wgsl: z.string(),
});
export type WgslFunction = z.infer<typeof WgslFunctionSchema>;

// ---------------------------------------------------------------------------
// WGSL function metadata — extracted from WGSL source via wgsl_reflect.
// TS-side only (NOT sent to Rust). Used for validation and tooling.
// ---------------------------------------------------------------------------

/** A single parameter extracted from a WGSL function signature. */
export interface WgslFunctionParam {
  readonly name: string;
  /** WGSL type name (e.g., 'f32', 'vec2f', 'u32') */
  readonly type: string;
}

/** Metadata extracted from a registered WGSL function's source. */
export interface WgslFunctionMeta {
  readonly name: string;
  readonly params: readonly WgslFunctionParam[];
  /** WGSL return type name, or null for void functions. */
  readonly returnType: string | null;
}

const PipelineInstallPayloadBaseSchema = z.object({
  manifest: MemoryManifestSchema,
  roster: z.array(RosterEntrySchema).readonly(),
  functions: z.array(WgslFunctionSchema).readonly().optional(),
});

export const PipelineInstallPayloadSchema = PipelineInstallPayloadBaseSchema
  .superRefine(validatePayloadSemantics);
export type PipelineInstallPayload = z.infer<typeof PipelineInstallPayloadBaseSchema>;

// Receipt (Rust → JS direction)
export const CompilationDiagnosticSchema = z.object({
  severity: z.enum(['fatal', 'error', 'warning']),
  phase: z.enum(['manifest_allocation', 'ast_lowering', 'wgsl_validation', 'pipeline_creation']),
  blockId: z.string().optional(),
  symbolId: SymbolIdSchema.optional(),
  message: z.string(),
});
export type CompilationDiagnostic = z.infer<typeof CompilationDiagnosticSchema>;

export const InstallReceiptSchema = z.object({
  status: z.enum(['success', 'error']),
  compilationTimeMs: z.number(),
  globalOffsetMap: z.record(SymbolIdSchema, z.number()),
  framePayloadLength: z.number(),
  diagnostics: z.array(CompilationDiagnosticSchema).readonly(),
});
export type InstallReceipt = z.infer<typeof InstallReceiptSchema>;
