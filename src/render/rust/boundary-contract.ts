/**
 * WASM Renderer Canonical Boundary Contract
 *
 * [LAW:one-source-of-truth] All JSON payloads that cross JS→Rust/WASM renderer
 * boundaries are defined, validated, and normalized here.
 *
 * Spec authority: design-docs/WASM-Boundary-Spec.md
 */

// ---------------------------------------------------------------------------
// Type Aliases
// ---------------------------------------------------------------------------

export type SymbolId = string;
export type DomainId = string;
export type TextureId = string;
export type ShapeId = string;
export type SamplerId = string;
export type StreamId = string;
export type WebGpuTopology = 'point-list' | 'line-list' | 'line-strip' | 'triangle-list' | 'triangle-strip';

export type WgslType =
  | 'f32' | 'i32' | 'u32' | 'bool'
  | 'vec2<f32>' | 'vec2<i32>' | 'vec2<u32>'
  | 'vec3<f32>' | 'vec3<i32>' | 'vec3<u32>'
  | 'vec4<f32>' | 'vec4<i32>' | 'vec4<u32>'
  | 'mat3x3<f32>' | 'mat4x4<f32>';

// ---------------------------------------------------------------------------
// Phase 1: Pipeline Install Payload
// ---------------------------------------------------------------------------

export interface PipelineInstallPayload {
  readonly manifest: MemoryManifest;
  readonly roster: ExecutionRoster;
}

// ---------------------------------------------------------------------------
// Memory Manifest
// ---------------------------------------------------------------------------

export interface MemoryManifest {
  readonly preserveStateOnRecompile: boolean;
  readonly globals: Record<SymbolId, GlobalSpec>;
  readonly arenaScalars: Record<SymbolId, ArenaScalarSpec>;
  readonly domains: Record<DomainId, InstanceDomainSpec>;
  readonly textures: Record<TextureId, TextureSpec>;
  readonly shapeBank: Record<ShapeId, StaticGeometrySpec>;
  readonly dataStreams: Record<StreamId, DataStreamSpec>;
  readonly samplers: Record<SamplerId, SamplerSpec>;
}

export interface GlobalSpec {
  readonly type: 'f32' | 'u32' | 'i32' | 'vec2' | 'vec3' | 'vec4' | 'mat4x4';
  readonly isDynamic: boolean;
  readonly defaultValue: number | readonly number[];
}

export interface ArenaScalarSpec {
  readonly type: 'f32' | 'u32' | 'i32' | 'atomic<u32>' | 'atomic<i32>';
  readonly clearValue: number;
}

export interface InstanceDomainSpec {
  readonly capacity: number;
  readonly activeLanesSymbol: SymbolId;
  readonly fields: Record<SymbolId, FieldSpec>;
}

export interface FieldSpec {
  readonly type: 'f32' | 'u32' | 'i32' | 'atomic<u32>' | 'atomic<i32>';
  readonly clearValue: number;
}

export interface TextureSpec {
  readonly dimension: '1d' | '2d' | '3d' | 'cube';
  readonly width: number | { readonly relativeTo: 'canvas'; readonly scale: number };
  readonly height?: number | { readonly relativeTo: 'canvas'; readonly scale: number };
  readonly depthOrArrayLayers?: number;
  readonly format: string;
  readonly usage: readonly ('storage' | 'sampled' | 'render_attachment')[];
  readonly externalSource?: 'video' | 'canvas' | 'image_bitmap';
}

export interface StaticGeometrySpec {
  readonly topology: WebGpuTopology;
  readonly vertexLayout: {
    readonly stride: number;
    readonly attributes: Record<string, {
      readonly format: 'float32x2' | 'float32x3' | 'float32x4';
      readonly shaderLocation: number;
    }>;
  };
  readonly vertexData: readonly number[];
  readonly indexData?: readonly number[];
}

export interface DataStreamSpec {
  readonly type: 'f32' | 'u32';
  readonly length: number;
}

export interface SamplerSpec {
  readonly magFilter: 'nearest' | 'linear';
  readonly minFilter: 'nearest' | 'linear';
  readonly addressModeU: 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
  readonly addressModeV: 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
}

// ---------------------------------------------------------------------------
// Execution Roster
// ---------------------------------------------------------------------------

export type ExecutionRoster = readonly RosterEntry[];
export type RosterEntry = ComputePassSpec | RenderPassSpec | SystemPassSpec;

export interface ComputePassSpec {
  readonly type: 'Compute';
  readonly passId: string;
  readonly sourceBlockIds: readonly string[];
  readonly workgroupSize: readonly [number, number, number];
  readonly dispatch:
    | { readonly mode: 'Domain'; readonly domainId: DomainId }
    | { readonly mode: 'Texture'; readonly textureId: TextureId }
    | { readonly mode: 'Exact'; readonly x: number; readonly y: number; readonly z: number };
  readonly dependencies: {
    readonly requiresGlobals: boolean;
    readonly domains: Record<DomainId, 'read' | 'read_write'>;
    readonly textures: Record<TextureId, 'read' | 'write' | 'read_write'>;
  };
  readonly ast: readonly StatementIR[];
}

export interface RenderPassSpec {
  readonly type: 'Render';
  readonly passId: string;
  readonly sourceBlockIds: readonly string[];
  readonly targets: {
    readonly colors: readonly {
      readonly textureId: TextureId | 'canvas';
      readonly loadOp: 'load' | 'clear';
      readonly clearColor?: readonly [number, number, number, number];
    }[];
    readonly depthStencil?: {
      readonly textureId: TextureId;
      readonly depthLoadOp?: 'load' | 'clear';
      readonly depthClearValue?: number;
      readonly stencilLoadOp?: 'load' | 'clear';
      readonly stencilClearValue?: number;
    };
  };
  readonly drawCalls: readonly DrawCallSpec[];
}

export interface DrawCallSpec {
  readonly intentId: string;
  readonly source:
    | {
        readonly type: 'Domain';
        readonly domainId: DomainId;
        readonly sourceKind: 'Topology' | 'Parametric' | 'Field' | 'SolverResource';
        readonly shapeId: ShapeId;
      }
    | { readonly type: 'FullScreenQuad' };
  readonly pipelineState: PipelineStateSpec;
  readonly dependencies: {
    readonly requiresGlobals: boolean;
    readonly cameraRef?: SymbolId;
    readonly domains: Record<DomainId, 'read'>;
    readonly textures: Record<TextureId, 'sampled'>;
  };
  readonly vertexAst: readonly StatementIR[];
  readonly fragmentAst: readonly StatementIR[];
}

export interface PipelineStateSpec {
  readonly blendMode: 'opaque' | 'alpha' | 'additive' | 'multiply';
  readonly cullMode: 'none' | 'front' | 'back';
  readonly depthWrite: boolean;
  readonly depthCompare: 'less' | 'always' | 'equal' | 'greater';
  readonly stencilReadMask?: number;
  readonly stencilWriteMask?: number;
  readonly stencilFront?: StencilFaceState;
  readonly stencilBack?: StencilFaceState;
}

export interface StencilFaceState {
  readonly compare: 'always' | 'never' | 'equal' | 'not-equal' | 'less' | 'less-equal' | 'greater' | 'greater-equal';
  readonly failOp: StencilOp;
  readonly depthFailOp: StencilOp;
  readonly passOp: StencilOp;
}

export type StencilOp = 'keep' | 'zero' | 'replace' | 'invert'
  | 'increment-clamp' | 'decrement-clamp' | 'increment-wrap' | 'decrement-wrap';

export interface SystemPassSpec {
  readonly type: 'System_DrawPrep';
  readonly passId: string;
  readonly sourceBlockIds: readonly string[];
  readonly activeLanesSymbol: SymbolId;
  readonly vertexCount: number;
}

// ---------------------------------------------------------------------------
// Math IR: ExprIR
// ---------------------------------------------------------------------------

export type BuiltinMathFunc =
  | 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan' | 'atan2' | 'exp' | 'log' | 'pow' | 'sqrt'
  | 'abs' | 'min' | 'max' | 'clamp' | 'mix' | 'step' | 'smoothstep'
  | 'sign' | 'fract' | 'ceil' | 'floor' | 'round'
  | 'length' | 'distance' | 'dot' | 'cross' | 'normalize' | 'reflect' | 'refract'
  | 'fwidth' | 'dpdx' | 'dpdy'
  | 'hash_u32' | 'noise_simplex_2d' | 'noise_simplex_3d';

export type BinaryOp =
  | '+' | '-' | '*' | '/' | '%'
  | '==' | '!=' | '<' | '>' | '<=' | '>='
  | '&&' | '||'
  | '&' | '|' | '^' | '<<' | '>>';

export type UnaryOp = '!' | '-' | '~';

export type ExprIR =
  // Primitive literals
  | { readonly type: 'LiteralF32'; readonly value: number }
  | { readonly type: 'LiteralU32'; readonly value: number }
  | { readonly type: 'LiteralI32'; readonly value: number }
  | { readonly type: 'LiteralBool'; readonly value: boolean }
  // Composite constructors & casts
  | { readonly type: 'Construct'; readonly dataType: WgslType; readonly args: readonly ExprIR[] }
  | { readonly type: 'Cast'; readonly targetType: WgslType; readonly expr: ExprIR }
  | { readonly type: 'Swizzle'; readonly source: ExprIR; readonly mask: string }
  | { readonly type: 'IndexAccess'; readonly target: ExprIR; readonly index: ExprIR }
  // Hardware intrinsics
  | { readonly type: 'Intrinsic'; readonly name: 'global_invocation_id.x' | 'global_invocation_id.y' | 'global_invocation_id.z' | 'vertex_index' | 'instance_index' }
  // Symbolic memory reads
  | { readonly type: 'LoadGlobal'; readonly symbolId: SymbolId }
  | { readonly type: 'LoadScalar'; readonly symbolId: SymbolId }
  | { readonly type: 'LoadField'; readonly symbolId: SymbolId; readonly index: ExprIR }
  // Texture reads
  | { readonly type: 'TextureSample'; readonly textureId: TextureId; readonly samplerId: SamplerId; readonly uv: ExprIR }
  | { readonly type: 'TextureLoad'; readonly textureId: TextureId; readonly coords: ExprIR }
  // Atomic reads
  | { readonly type: 'AtomicLoadField'; readonly symbolId: SymbolId; readonly index: ExprIR }
  | { readonly type: 'AtomicLoadScalar'; readonly symbolId: SymbolId }
  // Operators
  | { readonly type: 'BinaryOp'; readonly op: BinaryOp; readonly left: ExprIR; readonly right: ExprIR }
  | { readonly type: 'UnaryOp'; readonly op: UnaryOp; readonly expr: ExprIR }
  // Built-in math
  | { readonly type: 'CallBuiltin'; readonly func: BuiltinMathFunc; readonly args: readonly ExprIR[] }
  // Variable reference
  | { readonly type: 'VarRef'; readonly name: string };

// ---------------------------------------------------------------------------
// Math IR: StatementIR
// ---------------------------------------------------------------------------

export type AtomicOp = 'Add' | 'Sub' | 'Max' | 'Min' | 'And' | 'Or' | 'Xor' | 'Exchange';

export type StatementIR =
  // Declarations
  | { readonly type: 'Let'; readonly name: string; readonly value: ExprIR }
  | { readonly type: 'Var'; readonly name: string; readonly dataType?: WgslType; readonly value?: ExprIR }
  | { readonly type: 'Assign'; readonly target: ExprIR; readonly value: ExprIR }
  // Symbolic memory writes
  | { readonly type: 'StoreScalar'; readonly symbolId: SymbolId; readonly value: ExprIR }
  | { readonly type: 'StoreField'; readonly symbolId: SymbolId; readonly index: ExprIR; readonly value: ExprIR }
  | { readonly type: 'TextureStore'; readonly textureId: TextureId; readonly coords: ExprIR; readonly value: ExprIR }
  // Control flow
  | { readonly type: 'If'; readonly condition: ExprIR; readonly accept: readonly StatementIR[]; readonly reject: readonly StatementIR[] }
  | { readonly type: 'For'; readonly init: StatementIR; readonly condition: ExprIR; readonly update: StatementIR; readonly body: readonly StatementIR[] }
  | { readonly type: 'Break' }
  | { readonly type: 'Continue' }
  // Atomic mutations
  | { readonly type: 'AtomicOpField'; readonly op: AtomicOp; readonly symbolId: SymbolId; readonly index: ExprIR; readonly value: ExprIR; readonly assignResultTo?: string }
  | { readonly type: 'AtomicOpScalar'; readonly op: AtomicOp; readonly symbolId: SymbolId; readonly value: ExprIR; readonly assignResultTo?: string }
  // Shader terminals
  | { readonly type: 'ReturnVertex'; readonly position: ExprIR; readonly varyings: Record<string, ExprIR> }
  | { readonly type: 'ReturnFragment'; readonly outputs: Record<string, ExprIR> };

// ---------------------------------------------------------------------------
// Install Receipt
// ---------------------------------------------------------------------------

export interface InstallReceipt {
  readonly status: 'success' | 'error';
  readonly compilationTimeMs: number;
  readonly globalOffsetMap: Record<SymbolId, number>;
  readonly framePayloadLength: number;
  readonly diagnostics: readonly CompilationDiagnostic[];
}

export interface CompilationDiagnostic {
  readonly severity: 'fatal' | 'error' | 'warning';
  readonly phase: 'manifest_allocation' | 'ast_lowering' | 'wgsl_validation' | 'pipeline_creation';
  readonly blockId?: string;
  readonly symbolId?: SymbolId;
  readonly message: string;
}
