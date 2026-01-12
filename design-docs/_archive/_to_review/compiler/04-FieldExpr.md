
9) Field expressions (lazy Fields)

9.1 FieldExpr representation

Fields are not arrays. They are expression handles referencing a DAG.

export interface FieldExprTable {
  // Optional at compile time. Runtime may build expressions on the fly.
  exprs: Record<ExprId, FieldExprIR>;
}

export type FieldExprIR =
  | { kind: "const"; id: ExprId; type: TypeDesc; valueConstId: string }
  | { kind: "inputSlot"; id: ExprId; type: TypeDesc; slot: ValueSlot }        // field comes from a node output
  | { kind: "map"; id: ExprId; type: TypeDesc; src: ExprId; fn: PureFnRef }
  | { kind: "zip"; id: ExprId; type: TypeDesc; a: ExprId; b: ExprId; fn: PureFnRef }
  | { kind: "select"; id: ExprId; type: TypeDesc; cond: ExprId; t: ExprId; f: ExprId }
  | { kind: "busCombine"; id: ExprId; type: TypeDesc; busIndex: BusIndex; terms: ExprId[]; combine: CombineSpec }
  | { kind: "transform"; id: ExprId; type: TypeDesc; src: ExprId; chain: TransformChainRef }
  | { kind: "sampleSignal"; id: ExprId; type: TypeDesc; signalSlot: ValueSlot; strategy: SampleStrategy };

9.2 Materialization plan

Materialization is an explicit runtime step (scheduled). It produces typed buffers.

export interface MaterializationIR {
  id: string;
  expr: ExprId;
  domainSlot: ValueSlot;         // Domain handle (element IDs, count, etc.)
  outBufferSlot: ValueSlot;      // BufferRef or typed array handle
  layout: BufferLayout;          // AoS/SoA, stride, etc
  cacheKey: CacheKeySpec;        // explains reuse policy
}

export type BufferLayout =
  | { kind: "scalar"; elementType: "f32" | "u32" | "i32" }
  | { kind: "vec2"; elementType: "f32" }
  | { kind: "vec3"; elementType: "f32" }
  | { kind: "vec4"; elementType: "f32" }
  | { kind: "colorRGBA"; elementType: "u8" | "f32" }
  | { kind: "custom"; desc: string };

Rules
	•	Materialization is the only place arrays/buffers appear.
	•	A renderer may request multiple materializations (pos/size/color/etc).
	•	Debug can request materialization too.
