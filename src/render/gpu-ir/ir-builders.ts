/**
 * GPU-IR DSL: Builder functions for every ExprIR and StatementIR variant.
 *
 * [LAW:one-source-of-truth] Types are defined in boundary-contract.ts;
 * this module only constructs values assignable to those types.
 */

import type {
  ExprIR,
  StatementIR,
  WgslType,
  BinaryOp as BinaryOpType,
  UnaryOp as UnaryOpType,
  BuiltinMathFunc,
  SymbolId,
  TextureId,
  SamplerId,
  AtomicOp,
} from '../rust/boundary-contract';

// ---------------------------------------------------------------------------
// ExprIR Builders
// ---------------------------------------------------------------------------

export const litF32 = (value: number): ExprIR =>
  ({ type: 'LiteralF32', value }) as const;

export const litU32 = (value: number): ExprIR =>
  ({ type: 'LiteralU32', value }) as const;

export const litI32 = (value: number): ExprIR =>
  ({ type: 'LiteralI32', value }) as const;

export const litBool = (value: boolean): ExprIR =>
  ({ type: 'LiteralBool', value }) as const;

export const construct = (dataType: WgslType, args: readonly ExprIR[]): ExprIR =>
  ({ type: 'Construct', dataType, args }) as const;

export const cast = (targetType: WgslType, expr: ExprIR): ExprIR =>
  ({ type: 'Cast', targetType, expr }) as const;

export const swizzle = (source: ExprIR, mask: string): ExprIR =>
  ({ type: 'Swizzle', source, mask }) as const;

export const indexAccess = (target: ExprIR, index: ExprIR): ExprIR =>
  ({ type: 'IndexAccess', target, index }) as const;

export const intrinsic = (
  name: 'global_invocation_id.x' | 'global_invocation_id.y' | 'global_invocation_id.z' | 'vertex_index' | 'instance_index',
): ExprIR =>
  ({ type: 'Intrinsic', name }) as const;

export const loadGlobal = (symbolId: SymbolId): ExprIR =>
  ({ type: 'LoadGlobal', symbolId }) as const;

export const loadScalar = (symbolId: SymbolId): ExprIR =>
  ({ type: 'LoadScalar', symbolId }) as const;

export const loadField = (symbolId: SymbolId, index: ExprIR): ExprIR =>
  ({ type: 'LoadField', symbolId, index }) as const;

export const textureSample = (textureId: TextureId, samplerId: SamplerId, uv: ExprIR): ExprIR =>
  ({ type: 'TextureSample', textureId, samplerId, uv }) as const;

export const textureLoad = (textureId: TextureId, coords: ExprIR): ExprIR =>
  ({ type: 'TextureLoad', textureId, coords }) as const;

export const atomicLoadField = (symbolId: SymbolId, index: ExprIR): ExprIR =>
  ({ type: 'AtomicLoadField', symbolId, index }) as const;

export const atomicLoadScalar = (symbolId: SymbolId): ExprIR =>
  ({ type: 'AtomicLoadScalar', symbolId }) as const;

export const binop = (op: BinaryOpType, left: ExprIR, right: ExprIR): ExprIR =>
  ({ type: 'BinaryOp', op, left, right }) as const;

export const unaryOp = (op: UnaryOpType, expr: ExprIR): ExprIR =>
  ({ type: 'UnaryOp', op, expr }) as const;

export const callBuiltin = (func: BuiltinMathFunc, args: readonly ExprIR[]): ExprIR =>
  ({ type: 'CallBuiltin', func, args }) as const;

export const ref = (name: string): ExprIR =>
  ({ type: 'VarRef', name }) as const;

// ---------------------------------------------------------------------------
// StatementIR Builders
// ---------------------------------------------------------------------------

export const let_ = (name: string, value: ExprIR): StatementIR =>
  ({ type: 'Let', name, value }) as const;

export const var_ = (name: string, dataType?: WgslType, value?: ExprIR): StatementIR =>
  ({ type: 'Var', name, dataType, value }) as const;

export const assign = (target: ExprIR, value: ExprIR): StatementIR =>
  ({ type: 'Assign', target, value }) as const;

export const storeGlobal = (symbolId: SymbolId, value: ExprIR): StatementIR =>
  ({ type: 'StoreGlobal', symbolId, value }) as const;

export const storeScalar = (symbolId: SymbolId, value: ExprIR): StatementIR =>
  ({ type: 'StoreScalar', symbolId, value }) as const;

export const storeField = (symbolId: SymbolId, index: ExprIR, value: ExprIR): StatementIR =>
  ({ type: 'StoreField', symbolId, index, value }) as const;

export const textureStore_ = (textureId: TextureId, coords: ExprIR, value: ExprIR): StatementIR =>
  ({ type: 'TextureStore', textureId, coords, value }) as const;

export const if_ = (
  condition: ExprIR,
  accept: readonly StatementIR[],
  reject: readonly StatementIR[],
): StatementIR =>
  ({ type: 'If', condition, accept, reject }) as const;

export const for_ = (
  init: StatementIR,
  condition: ExprIR,
  update: StatementIR,
  body: readonly StatementIR[],
): StatementIR =>
  ({ type: 'For', init, condition, update, body }) as const;

export const break_ = (): StatementIR =>
  ({ type: 'Break' }) as const;

export const continue_ = (): StatementIR =>
  ({ type: 'Continue' }) as const;

export const atomicOpField = (
  op: AtomicOp,
  symbolId: SymbolId,
  index: ExprIR,
  value: ExprIR,
  assignResultTo?: string,
): StatementIR =>
  ({ type: 'AtomicOpField', op, symbolId, index, value,
    ...(assignResultTo !== undefined ? { assignResultTo } : {}),
  }) as const;

export const atomicOpScalar = (
  op: AtomicOp,
  symbolId: SymbolId,
  value: ExprIR,
  assignResultTo?: string,
): StatementIR =>
  ({ type: 'AtomicOpScalar', op, symbolId, value,
    ...(assignResultTo !== undefined ? { assignResultTo } : {}),
  }) as const;

// Semantic expression nodes — expanded by Naga translator, collapsed by reverse translator
export const applyVP = (vpSymbol: string, position: ExprIR): ExprIR =>
  ({ type: 'ApplyVP', vpSymbol, position }) as const;

export const applyTransform2D = (
  position: ExprIR, translateX: ExprIR, translateY: ExprIR,
  rotation: ExprIR, scale: ExprIR,
): ExprIR =>
  ({ type: 'ApplyTransform2D', position, translateX, translateY, rotation, scale }) as const;

export const returnVertex = (
  position: ExprIR,
  varyings: Record<string, ExprIR>,
): StatementIR =>
  ({ type: 'ReturnVertex', position, varyings }) as const;

export const returnFragment = (
  outputs: Record<string, ExprIR>,
): StatementIR =>
  ({ type: 'ReturnFragment', outputs }) as const;
