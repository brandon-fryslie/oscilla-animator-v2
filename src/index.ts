// Oscilla Animator v2
// Clean rewrite with single code path

export * from './types';
export * from './graph';
export { compile, type CompileResult, type CompileFailure, type CompileError } from './compiler';
export type { ValueExpr, TimeModel, Step } from './compiler/ir';
export { getAllBlockTypes, getBlockDefinition, type BlockDef } from './blocks/registry';
