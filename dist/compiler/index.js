// Export compiler types (selective to avoid conflicts)
export { compile } from './compile';
// Export IR types (selective to avoid conflicts)
export { createIRBuilder, IRBuilderImpl } from './ir';
// Export block registry (note: has its own LowerContext)
export { getAllBlocks, getBlock, registerBlock } from './blocks';
// Export compiler error types
export { compileError, ok, fail, isOk } from './types';
