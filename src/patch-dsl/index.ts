/**
 * Patch DSL Public API
 *
 * HCL parsing infrastructure for Patch serialization/deserialization.
 * Sprint 1: Core HCL parsing only (no Patch conversion yet).
 */

// AST types
export type {
  Position,
  HclValue,
  HclNumberValue,
  HclStringValue,
  HclBoolValue,
  HclReferenceValue,
  HclObjectValue,
  HclListValue,
  HclBlock,
  HclDocument,
} from './ast';

// Error types
export { PatchDslError, PatchDslWarning } from './errors';

// Lexer
export { tokenize, TokenKind, type Token } from './lexer';

// Parser
export { parse, type ParseResult } from './parser';
