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
  type: z.enum(['f32', 'u32', 'i32', 'atomic<u32>', 'atomic<i32>']),
  clearValue: z.number(),
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
  | { readonly type: 'VarRef'; readonly name: string };

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
  ]),
);

export type StatementIR =
  | { readonly type: 'Let'; readonly name: string; readonly value: ExprIR }
  | { readonly type: 'Var'; readonly name: string; readonly dataType?: WgslType; readonly value?: ExprIR }
  | { readonly type: 'Assign'; readonly target: ExprIR; readonly value: ExprIR }
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
    cameraRef: SymbolIdSchema.optional(),
    domains: z.record(DomainIdSchema, z.literal('read')),
    textures: z.record(TextureIdSchema, z.literal('sampled')),
  }),
  vertexAst: z.array(StatementIRSchema).readonly(),
  fragmentAst: z.array(StatementIRSchema).readonly(),
});
export type DrawCallSpec = z.infer<typeof DrawCallSpecSchema>;

export const RenderPassSpecSchema = z.object({
  type: z.literal('Render'),
  passId: z.string(),
  sourceBlockIds: z.array(z.string()).readonly(),
  targets: z.object({
    colors: z.array(z.object({
      textureId: z.union([TextureIdSchema, z.literal('canvas')]),
      loadOp: z.enum(['load', 'clear']),
      clearColor: z.tuple([z.number(), z.number(), z.number(), z.number()]).readonly().optional(),
    })).readonly(),
    depthStencil: z.object({
      textureId: TextureIdSchema,
      depthLoadOp: z.enum(['load', 'clear']).optional(),
      depthClearValue: z.number().optional(),
      stencilLoadOp: z.enum(['load', 'clear']).optional(),
      stencilClearValue: z.number().optional(),
    }).optional(),
  }),
  drawCalls: z.array(DrawCallSpecSchema).readonly(),
});
export type RenderPassSpec = z.infer<typeof RenderPassSpecSchema>;

export const RosterEntrySchema = z.discriminatedUnion('type', [
  ComputePassSpecSchema,
  RenderPassSpecSchema,
  SystemPassSpecSchema,
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
// Semantic validation — data-driven cross-reference checks
// ---------------------------------------------------------------------------

// [LAW:single-enforcer] These tables are the single place that defines what
// each IR node references and how to recurse into children. Adding a new
// ExprIR or StatementIR variant without adding an entry here is a compile error
// (Record<ExprIR['type'], ...> enforces exhaustiveness).

/** Which manifest collection a symbolId/textureId/samplerId must exist in */
type RefCheck = 'global' | 'scalar' | 'field' | 'atomicField' | 'texture' | 'sampler';

interface ExprRule {
  /** Fields that reference manifest symbols: [fieldName, checkKind] */
  readonly refs: readonly (readonly [string, RefCheck])[];
  /** Field names containing a single child ExprIR */
  readonly children: readonly string[];
  /** Field names containing an ExprIR[] array */
  readonly childArrays: readonly string[];
  /** Optional special validation */
  readonly special?: 'builtinArgCount' | 'fragmentOnly';
}

interface StmtRule {
  readonly refs: readonly (readonly [string, RefCheck])[];
  readonly children: readonly string[];
  readonly childArrays: readonly string[];
  /** Field names containing a single child StatementIR */
  readonly stmtChildren: readonly string[];
  /** Field names containing a StatementIR[] array */
  readonly stmtChildArrays: readonly string[];
  /** Field names containing a Record<string, ExprIR> */
  readonly exprRecords: readonly string[];
}

/** Expected arg count for each builtin math function */
const BUILTIN_ARG_COUNTS: Record<BuiltinMathFunc, number> = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, atan2: 2,
  exp: 1, log: 1, pow: 2, sqrt: 1,
  abs: 1, min: 2, max: 2, clamp: 3, mix: 3, step: 2, smoothstep: 3,
  sign: 1, fract: 1, ceil: 1, floor: 1, round: 1,
  length: 1, distance: 2, dot: 2, cross: 2, normalize: 1, reflect: 2, refract: 3,
  fwidth: 1, dpdx: 1, dpdy: 1,
  hash_u32: 1, noise_simplex_2d: 1, noise_simplex_3d: 1,
};

const FRAGMENT_ONLY_BUILTINS = new Set<string>(['dpdx', 'dpdy', 'fwidth']);

// Exhaustive: Record<ExprIR['type'], ExprRule> — adding a variant without a rule is a compile error
const EXPR_RULES: Record<ExprIR['type'], ExprRule> = {
  LiteralF32:      { refs: [], children: [], childArrays: [] },
  LiteralU32:      { refs: [], children: [], childArrays: [] },
  LiteralI32:      { refs: [], children: [], childArrays: [] },
  LiteralBool:     { refs: [], children: [], childArrays: [] },
  VarRef:          { refs: [], children: [], childArrays: [] },
  Intrinsic:       { refs: [], children: [], childArrays: [] },
  LoadGlobal:      { refs: [['symbolId', 'global']], children: [], childArrays: [] },
  LoadScalar:      { refs: [['symbolId', 'scalar']], children: [], childArrays: [] },
  LoadField:       { refs: [['symbolId', 'field']], children: ['index'], childArrays: [] },
  AtomicLoadField: { refs: [['symbolId', 'atomicField']], children: ['index'], childArrays: [] },
  AtomicLoadScalar:{ refs: [['symbolId', 'scalar']], children: [], childArrays: [] },
  TextureLoad:     { refs: [['textureId', 'texture']], children: ['coords'], childArrays: [] },
  TextureSample:   { refs: [['textureId', 'texture'], ['samplerId', 'sampler']], children: ['uv'], childArrays: [] },
  BinaryOp:        { refs: [], children: ['left', 'right'], childArrays: [] },
  UnaryOp:         { refs: [], children: ['expr'], childArrays: [] },
  Cast:            { refs: [], children: ['expr'], childArrays: [] },
  Swizzle:         { refs: [], children: ['source'], childArrays: [] },
  IndexAccess:     { refs: [], children: ['target', 'index'], childArrays: [] },
  Construct:       { refs: [], children: [], childArrays: ['args'] },
  CallBuiltin:     { refs: [], children: [], childArrays: ['args'], special: 'builtinArgCount' },
};

// Exhaustive: Record<StatementIR['type'], StmtRule>
const STMT_RULES: Record<StatementIR['type'], StmtRule> = {
  Let:             { refs: [], children: ['value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  Var:             { refs: [], children: ['value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  Assign:          { refs: [], children: ['target', 'value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  StoreScalar:     { refs: [['symbolId', 'scalar']], children: ['value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  StoreField:      { refs: [['symbolId', 'field']], children: ['index', 'value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  TextureStore:    { refs: [['textureId', 'texture']], children: ['coords', 'value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  If:              { refs: [], children: ['condition'], childArrays: [], stmtChildren: [], stmtChildArrays: ['accept', 'reject'], exprRecords: [] },
  For:             { refs: [], children: ['condition'], childArrays: [], stmtChildren: ['init', 'update'], stmtChildArrays: ['body'], exprRecords: [] },
  Break:           { refs: [], children: [], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  Continue:        { refs: [], children: [], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  AtomicOpField:   { refs: [['symbolId', 'atomicField']], children: ['index', 'value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  AtomicOpScalar:  { refs: [['symbolId', 'scalar']], children: ['value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  ReturnVertex:    { refs: [], children: ['position'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: ['varyings'] },
  ReturnFragment:  { refs: [], children: [], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: ['outputs'] },
};

/**
 * Validate semantic consistency of a PipelineInstallPayload.
 * Driven by EXPR_RULES and STMT_RULES tables — no case statements.
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

  function issue(path: (string | number)[], message: string): void {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  }

  type Stage = 'compute' | 'vertex' | 'fragment';

  function validateExpr(expr: ExprIR, path: (string | number)[], stage: Stage): void {
    const rule = EXPR_RULES[expr.type];
    const node = expr as Record<string, unknown>;

    // Reference checks
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

    // Recurse into children
    for (const field of rule.children) {
      const child = node[field];
      if (child) validateExpr(child as ExprIR, [...path, field], stage);
    }
    for (const field of rule.childArrays) {
      const arr = node[field] as readonly ExprIR[];
      for (let i = 0; i < arr.length; i++) validateExpr(arr[i], [...path, field, i], stage);
    }
  }

  function validateStmt(stmt: StatementIR, path: (string | number)[], stage: Stage): void {
    const rule = STMT_RULES[stmt.type];
    const node = stmt as Record<string, unknown>;

    // Reference checks
    for (const [field, check] of rule.refs) {
      const id = node[field] as string;
      if (!lookups[check].has(id)) {
        issue([...path, field], `'${id}' not in ${REF_LABELS[check]}`);
      }
    }

    // Recurse into expression children
    for (const field of rule.children) {
      const child = node[field];
      if (child) validateExpr(child as ExprIR, [...path, field], stage);
    }
    for (const field of rule.childArrays) {
      const arr = node[field] as readonly ExprIR[];
      for (let i = 0; i < arr.length; i++) validateExpr(arr[i], [...path, field, i], stage);
    }

    // Recurse into statement children
    for (const field of rule.stmtChildren) {
      const child = node[field];
      if (child) validateStmt(child as StatementIR, [...path, field], stage);
    }
    for (const field of rule.stmtChildArrays) {
      const arr = node[field] as readonly StatementIR[];
      for (let i = 0; i < arr.length; i++) validateStmt(arr[i], [...path, field, i], stage);
    }

    // Recurse into expression records (varyings, outputs)
    for (const field of rule.exprRecords) {
      const rec = node[field] as Record<string, ExprIR>;
      for (const [k, v] of Object.entries(rec)) validateExpr(v, [...path, field, k], stage);
    }
  }

  function validateStmts(stmts: readonly StatementIR[], path: (string | number)[], stage: Stage): void {
    for (let i = 0; i < stmts.length; i++) validateStmt(stmts[i], [...path, i], stage);
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
      validateStmts(entry.ast, [...bp, 'ast'], 'compute');
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
        for (const d of Object.keys(dc.dependencies.domains))
          if (!domainIds.has(d)) issue([...dp, 'dependencies', 'domains', d], `Domain '${d}' not in manifest`);
        for (const t of Object.keys(dc.dependencies.textures))
          if (!lookups.texture.has(t)) issue([...dp, 'dependencies', 'textures', t], `Texture '${t}' not in manifest`);
        validateStmts(dc.vertexAst, [...dp, 'vertexAst'], 'vertex');
        validateStmts(dc.fragmentAst, [...dp, 'fragmentAst'], 'fragment');
      }
    }
  }
}

const PipelineInstallPayloadBaseSchema = z.object({
  manifest: MemoryManifestSchema,
  roster: z.array(RosterEntrySchema).readonly(),
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
