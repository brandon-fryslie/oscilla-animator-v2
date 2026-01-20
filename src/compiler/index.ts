// Export compiler types (selective to avoid conflicts)
export { compile } from './compile';
export type { CompileResult, CompileFailure } from './compile';

// Export IR types (selective to avoid conflicts)
export { createIRBuilder, IRBuilderImpl } from './ir';
export type { IRBuilder, SigExpr, FieldExpr, EventExpr, Step, TimeModel } from './ir';
export type { SigExprId, FieldExprId, EventExprId, SlotId, ValueSlot, InstanceId } from './ir';

// NOTE: Block registry is now at src/blocks/registry.ts
// It's already exported from src/index.ts
// Don't re-export here to avoid duplication

// Export compiler error types
export { compileError, ok, fail, isOk } from './types';
export type { CompileError, CompileResult as CompilerResult } from './types';
