// Core IR types
export * from './types';
export * from './Indices';
// Patch transformation types (compiler passes)
export * from './patches';
export { registerBlockType, getBlockType, hasBlockType, getAllBlockTypes, } from './lowerTypes';
// IR builder
// The concrete class from builder.ts is used directly by compile.ts
export { IRBuilder } from './builder';
export { IRBuilderImpl, createIRBuilder } from './IRBuilderImpl';
// Signal expression types
export * from './signalExpr';
