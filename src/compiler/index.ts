// Export compiler types (selective to avoid conflicts)
export { compile } from './compile';
export type { CompileResult, CompileFailure } from './compile';

// Export IR types (selective to avoid conflicts)
export { createIRBuilder, IRBuilderImpl } from './ir';
export type { IRBuilder, IRProgram, SigExpr, FieldExpr, EventExpr, Step, TimeModel, DomainDef } from './ir';
export type { TypeDesc, SigExprId, FieldExprId, EventExprId, DomainId, SlotId, ValueSlot } from './ir';

// Export block registry (note: has its own LowerContext)
export { getAllBlocks, getBlock, registerBlock } from './blocks';
export type { BlockDef, PortDef, ValueRef } from './blocks';

// Export compiler error types
export { compileError, ok, fail, isOk } from './types';
export type { CompileError, CompileResult as CompilerResult } from './types';
