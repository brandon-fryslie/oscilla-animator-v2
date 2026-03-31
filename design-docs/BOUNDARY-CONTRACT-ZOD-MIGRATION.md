# Boundary Contract: Zod Migration Instructions

## Goal

Replace all hand-written TypeScript interfaces in `src/render/rust/boundary-contract.ts` with Zod schemas. Types are derived via `z.infer<>`. After this migration, the file provides **both** compile-time types AND runtime structural validation from a single source of truth.

Semantic validation (cross-reference checks) will be added on top later — this migration only covers structural schemas.

## Prerequisites

```bash
npm install zod
```

## The Rule

Every `export interface Foo { ... }` or `export type Foo = ...` becomes:

```typescript
export const FooSchema = z.object({ ... });  // or z.union(), z.enum(), etc.
export type Foo = z.infer<typeof FooSchema>;
```

The derived `type Foo` must be identical to the old interface. If TypeScript complains about assignability after the migration, the schema is wrong.

## Migration Order (bottom-up by dependency)

Work bottom-up so each schema can reference schemas it depends on.

### Layer 1: Leaf types (no dependencies)

```typescript
// Type aliases → branded z.string()
export const SymbolIdSchema = z.string();
export type SymbolId = z.infer<typeof SymbolIdSchema>;
// Repeat for DomainId, TextureId, ShapeId, SamplerId, StreamId

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
```

### Layer 2: Simple specs (depend on Layer 1)

```typescript
export const GlobalSpecSchema = z.object({
  type: z.enum(['f32', 'u32', 'i32', 'vec2', 'vec3', 'vec4', 'mat4x4']),
  isDynamic: z.boolean(),
  defaultValue: z.union([z.number(), z.array(z.number()).readonly()]),
});

export const ArenaScalarSpecSchema = z.object({
  type: z.enum(['f32', 'u32', 'i32', 'atomic<u32>', 'atomic<i32>']),
  clearValue: z.number(),
});

export const FieldSpecSchema = z.object({
  type: z.enum(['f32', 'u32', 'i32', 'atomic<u32>', 'atomic<i32>']),
  clearValue: z.number(),
});

export const InstanceDomainSpecSchema = z.object({
  capacity: z.number(),
  activeLanesSymbol: SymbolIdSchema,
  fields: z.record(SymbolIdSchema, FieldSpecSchema),
});

export const DataStreamSpecSchema = z.object({
  type: z.enum(['f32', 'u32']),
  length: z.number(),
});

export const SamplerSpecSchema = z.object({
  magFilter: z.enum(['nearest', 'linear']),
  minFilter: z.enum(['nearest', 'linear']),
  addressModeU: z.enum(['clamp-to-edge', 'repeat', 'mirror-repeat']),
  addressModeV: z.enum(['clamp-to-edge', 'repeat', 'mirror-repeat']),
});

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

export const TextureSpecSchema = z.object({
  dimension: z.enum(['1d', '2d', '3d', 'cube']),
  width: z.union([z.number(), z.object({ relativeTo: z.literal('canvas'), scale: z.number() })]),
  height: z.union([z.number(), z.object({ relativeTo: z.literal('canvas'), scale: z.number() })]).optional(),
  depthOrArrayLayers: z.number().optional(),
  format: z.string(),
  usage: z.array(z.enum(['storage', 'sampled', 'render_attachment'])).readonly(),
  externalSource: z.enum(['video', 'canvas', 'image_bitmap']).optional(),
});

export const StencilFaceStateSchema = z.object({
  compare: z.enum(['always', 'never', 'equal', 'not-equal', 'less', 'less-equal', 'greater', 'greater-equal']),
  failOp: StencilOpSchema,
  depthFailOp: StencilOpSchema,
  passOp: StencilOpSchema,
});

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
```

### Layer 3: ExprIR and StatementIR (recursive)

These are recursive discriminated unions. Zod handles this with `z.lazy()`:

```typescript
// Forward-declare for recursive reference
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
export type ExprIR = z.infer<typeof ExprIRSchema>;
```

**Important:** For `ExprIR` and `StatementIR`, because they're recursive, you must:
1. Declare the type explicitly: `const ExprIRSchema: z.ZodType<ExprIR> = z.lazy(() => ...)`
2. Keep the hand-written `type ExprIR` union **temporarily** so `z.ZodType<ExprIR>` has something to reference
3. Once you've verified the schema matches, you can switch to `z.infer<>` — but with recursive types this sometimes requires the explicit type annotation to stay

Same pattern for `StatementIR`:

```typescript
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
export type StatementIR = z.infer<typeof StatementIRSchema>;
```

### Layer 4: Roster entries (depend on Layer 3)

```typescript
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

export const SystemPassSpecSchema = z.object({
  type: z.literal('System_DrawPrep'),
  passId: z.string(),
  sourceBlockIds: z.array(z.string()).readonly(),
  activeLanesSymbol: SymbolIdSchema,
  vertexCount: z.number(),
});

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

export const RosterEntrySchema = z.discriminatedUnion('type', [
  ComputePassSpecSchema,
  RenderPassSpecSchema,
  SystemPassSpecSchema,
]);
export type RosterEntry = z.infer<typeof RosterEntrySchema>;
```

### Layer 5: Top-level payload + receipt

```typescript
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

export const PipelineInstallPayloadSchema = z.object({
  manifest: MemoryManifestSchema,
  roster: z.array(RosterEntrySchema).readonly(),
});
export type PipelineInstallPayload = z.infer<typeof PipelineInstallPayloadSchema>;

// Receipt (Rust → JS direction)
export const CompilationDiagnosticSchema = z.object({
  severity: z.enum(['fatal', 'error', 'warning']),
  phase: z.enum(['manifest_allocation', 'ast_lowering', 'wgsl_validation', 'pipeline_creation']),
  blockId: z.string().optional(),
  symbolId: SymbolIdSchema.optional(),
  message: z.string(),
});

export const InstallReceiptSchema = z.object({
  status: z.enum(['success', 'error']),
  compilationTimeMs: z.number(),
  globalOffsetMap: z.record(SymbolIdSchema, z.number()),
  framePayloadLength: z.number(),
  diagnostics: z.array(CompilationDiagnosticSchema).readonly(),
});
```

## Validation Call Site

After migration, add this to the install path. In `engine.worker.ts`, before calling into Rust:

```typescript
import { PipelineInstallPayloadSchema } from './boundary-contract';

// Inside INSTALL_PIPELINE handler:
const parsed = PipelineInstallPayloadSchema.safeParse(JSON.parse(payloadJson));
if (!parsed.success) {
  // Return structured error — never reaches Rust
  self.postMessage({
    type: 'INSTALL_PIPELINE_FAILURE',
    receiptJson: JSON.stringify({
      status: 'error',
      compilationTimeMs: 0,
      globalOffsetMap: {},
      framePayloadLength: 0,
      diagnostics: parsed.error.issues.map(issue => ({
        severity: 'error' as const,
        phase: 'manifest_allocation' as const,
        message: `${issue.path.join('.')}: ${issue.message}`,
      })),
    }),
  });
  return;
}
// parsed.data is guaranteed structurally valid — safe to serialize to Rust
installRustRendererPipeline(JSON.stringify(parsed.data));
```

## Verification

After migration, run:

```bash
npm run typecheck   # Types derived from schemas must match all existing usage
npm run test        # All existing tests pass (schemas produce identical types)
```

The Gate 0 round-trip test (`gpu-ir/__tests__/gate0-hello-triangle.test.ts`) is the strongest check — it deep-equals a DSL-produced payload against a hand-written one. If the Zod types produce different shapes, this test fails.

## What NOT To Do In This Migration

- Do NOT add `.superRefine()` or `.refine()` for semantic checks yet — that's the next step
- Do NOT change any field names, shapes, or optionality — this is a 1:1 mechanical replacement
- Do NOT delete the `ExecutionRoster` type alias — just add `export type ExecutionRoster = z.infer<typeof z.array(RosterEntrySchema).readonly()>`
- Do NOT change the Rust serde types — the JSON wire format must remain identical
