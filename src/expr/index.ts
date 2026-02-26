/**
 * Expression DSL Public API
 *
 * Single entry point for compiling expression strings to IR.
 * Hides all internal complexity (lexer, parser, type checker, compiler).
 *
 * Usage:
 * ```typescript
 * const result = compileExpression(
 *   "sin(phase * 2) + 0.5",
 *   new Map([['phase', canonicalType('phase')]]),
 *   builder
 * );
 * if (result.ok) {
 *   const exprId = result.value;
 *   // Use exprId in block lowering
 * } else {
 *   // Handle compilation errors
 *   console.error(result.error.message);
 * }
 * ```
 */

import type { CanonicalType, PayloadType } from '../core/canonical-types';
import type { BlockIRBuilder } from '../compiler/ir/BlockIRBuilder';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { AddressResolver } from '../graph/address-registry';
import { tokenize } from './lexer';
import { parse, ParseError } from './parser';
import { typecheck, TypeError } from './typecheck';
import { compile, type CompileContext } from './compile';
import {
  lowerExpressionProgram,
  ExpressionProgramError,
  type ExpressionProgramWarning,
} from './program';

/**
 * Block reference context for member access support (e.g., circle_1.radius).
 * When provided, enables block.port syntax in expressions.
 */
export interface BlockRefsContext {
  readonly addressRegistry: AddressResolver;
  readonly allowedPayloads: readonly PayloadType[];
  readonly valuesByShorthand: ReadonlyMap<string, ValueExprId>;
}

/**
 * Compilation error (unified format for all error types).
 */
export interface ExpressionCompileError {
  readonly code: 'ExprSyntaxError' | 'ExprTypeError' | 'ExprCompileError';
  readonly message: string;
  readonly position?: { start: number; end: number };
  readonly suggestion?: string;
}

/**
 * Result type for compilation.
 */
export type CompileResult =
  | { ok: true; value: ValueExprId; warnings?: readonly ExpressionProgramWarning[] }
  | { ok: false; error: ExpressionCompileError };

/**
 * Compile expression string to an IR value expression.
 *
 * @param exprText Expression string (e.g., "sin(phase * 2) + 0.5")
 * @param inputs Input type environment (maps input names to value types)
 * @param builder BlockIRBuilder instance
 * @param inputExprs Compiled input IDs (maps input names to ValueExprIds)
 * @param blockRefs Optional block reference context for member access (e.g., circle_1.radius)
 * @returns Compiled ValueExprId or error
 *
 * @example
 * ```typescript
 * const inputs = new Map([
 *   ['phase', canonicalType('phase')],
 *   ['radius', canonicalType(FLOAT)],
 * ]);
 * const inputExprs = new Map([
 *   ['phase', phaseExprId],
 *   ['radius', radiusExprId],
 * ]);
 * const result = compileExpression(
 *   "sin(phase) * radius",
 *   inputs,
 *   builder,
 *   inputExprs
 * );
 * ```
 */
export function compileExpression(
  exprText: string,
  inputs: ReadonlyMap<string, CanonicalType>,
  builder: BlockIRBuilder,
  inputExprs: ReadonlyMap<string, ValueExprId>,
  blockRefs?: BlockRefsContext
): CompileResult {
  try {
    const loweredProgram = lowerExpressionProgram(exprText);

    // Step 1: Tokenize
    const tokens = tokenize(loweredProgram.expression);

    // Step 2: Parse
    const ast = parse(tokens);

    // Step 3: Type check (with optional block reference context)
    const inputTypes = extractPayloadTypes(inputs);
    const typedAst = typecheck(ast, {
      inputs: inputTypes,
      blockRefs: blockRefs ? {
        addressRegistry: blockRefs.addressRegistry,
        allowedPayloads: blockRefs.allowedPayloads,
      } : undefined,
    });

    // Step 4: Compile to IR
    const ctx: CompileContext = {
      builder,
      inputs: inputExprs,
      blockRefs: blockRefs?.valuesByShorthand,
    };
    const exprId = compile(typedAst, ctx);

    return {
      ok: true,
      value: exprId,
      warnings: loweredProgram.warnings,
    };
  } catch (err) {
    if (err instanceof ExpressionProgramError) {
      const absolute = err.absolutePosition;
      return {
        ok: false,
        error: {
          code: 'ExprSyntaxError',
          message: err.message,
          position: absolute === undefined ? undefined : { start: absolute, end: absolute },
        },
      };
    }

    // Convert internal errors to public ExpressionCompileError
    if (err instanceof ParseError) {
      return {
        ok: false,
        error: {
          code: 'ExprSyntaxError',
          message: err.message,
          position: err.pos,
          suggestion: err.expected ? `Expected: ${err.expected.join(', ')}` : undefined,
        },
      };
    }

    if (err instanceof TypeError) {
      return {
        ok: false,
        error: {
          code: 'ExprTypeError',
          message: err.message,
          position: err.pos,
          suggestion: err.suggestion,
        },
      };
    }

    // Unknown error (should not happen if all errors are caught)
    return {
      ok: false,
      error: {
        code: 'ExprCompileError',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * Extract payload types from value types.
 */
function extractPayloadTypes(inputs: ReadonlyMap<string, CanonicalType>): ReadonlyMap<string, PayloadType> {
  const typeMap = new Map<string, PayloadType>();
  for (const [name, canonicalType] of inputs.entries()) {
    typeMap.set(name, canonicalType.payload);
  }
  return typeMap;
}

// Re-export types that may be useful for callers
export type { ExprNode, Position } from './ast';

// Re-export suggestion types and service
export type {
  Suggestion,
  SuggestionType,
  FunctionSuggestion,
  ConstantSuggestion,
  BlockSuggestion,
  PortSuggestion,
  FunctionSignature,
} from './suggestions';
export { SuggestionProvider, getFunctionSignatures } from './suggestions';
export { getExpressionConstants, resolveExpressionConstant } from './constants';

// Swizzle utilities (for advanced use cases)
export {
  isValidSwizzle,
  swizzleResultType,
  validateSwizzle,
  componentIndex,
} from './swizzle';
