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
import type { IRBuilder } from '../compiler/ir/IRBuilder';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { AddressRegistry } from '../graph/address-registry';
import { tokenize } from './lexer';
import { parse, ParseError } from './parser';
import { typecheck, TypeError } from './typecheck';
import { compile, type CompileContext } from './compile';

/**
 * Block reference context for member access support (e.g., circle_1.radius).
 * When provided, enables block.port syntax in expressions.
 */
export interface BlockRefsContext {
  readonly addressRegistry: AddressRegistry;
  readonly allowedPayloads: readonly PayloadType[];
  readonly signalsByShorthand: ReadonlyMap<string, ValueExprId>;
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
  | { ok: true; value: ValueExprId }
  | { ok: false; error: ExpressionCompileError };

/**
 * Compile expression string to IR signal expression.
 *
 * @param exprText Expression string (e.g., "sin(phase * 2) + 0.5")
 * @param inputs Input type environment (maps input names to signal types)
 * @param builder IRBuilder instance
 * @param inputSignals Compiled input signal IDs (maps input names to ValueExprIds)
 * @returns Compiled signal ID or error
 *
 * @example
 * ```typescript
 * const inputs = new Map([
 *   ['phase', canonicalType('phase')],
 *   ['radius', canonicalType(FLOAT)],
 * ]);
 * const inputSignals = new Map([
 *   ['phase', phaseSignalId],
 *   ['radius', radiusSignalId],
 * ]);
 * const result = compileExpression(
 *   "sin(phase) * radius",
 *   inputs,
 *   builder,
 *   inputSignals
 * );
 * ```
 */
export function compileExpression(
  exprText: string,
  inputs: ReadonlyMap<string, CanonicalType>,
  builder: IRBuilder,
  inputSignals: ReadonlyMap<string, ValueExprId>
): CompileResult {
  try {
    // Step 1: Tokenize
    const tokens = tokenize(exprText);

    // Step 2: Parse
    const ast = parse(tokens);

    // Step 3: Type check
    const inputTypes = extractPayloadTypes(inputs);
    const typedAst = typecheck(ast, { inputs: inputTypes });

    // Step 4: Compile to IR
    const ctx: CompileContext = {
      builder,
      inputs: inputSignals,
    };
    const exprId = compile(typedAst, ctx);

    return { ok: true, value: exprId };
  } catch (err) {
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
 * Extract payload types from signal types.
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
  BlockSuggestion,
  PortSuggestion,
  FunctionSignature,
} from './suggestions';
export { SuggestionProvider, getFunctionSignatures } from './suggestions';

// Swizzle utilities (for advanced use cases)
export {
  isValidSwizzle,
  swizzleResultType,
  validateSwizzle,
  componentIndex,
} from './swizzle';
