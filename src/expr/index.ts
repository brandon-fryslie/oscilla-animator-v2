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
 *   new Map([['phase', signalType('phase')]]),
 *   builder
 * );
 * if (result.ok) {
 *   const sigId = result.value;
 *   // Use sigId in block lowering
 * } else {
 *   // Handle compilation errors
 *   console.error(result.error.message);
 * }
 * ```
 */

import type { SignalType, PayloadType } from '../core/canonical-types';
import type { IRBuilder } from '../compiler/ir/IRBuilder';
import type { SigExprId } from '../compiler/ir/types';
import { tokenize } from './lexer';
import { parse, ParseError } from './parser';
import { typecheck, TypeError } from './typecheck';
import { compile, type CompileContext } from './compile';

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
  | { ok: true; value: SigExprId }
  | { ok: false; error: ExpressionCompileError };

/**
 * Compile expression string to IR signal expression.
 *
 * @param exprText Expression string (e.g., "sin(phase * 2) + 0.5")
 * @param inputs Input type environment (maps input names to signal types)
 * @param builder IRBuilder instance
 * @param inputSignals Compiled input signal IDs (maps input names to SigExprIds)
 * @returns Compiled signal ID or error
 *
 * @example
 * ```typescript
 * const inputs = new Map([
 *   ['phase', signalType('phase')],
 *   ['radius', signalType(FLOAT)],
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
  inputs: ReadonlyMap<string, SignalType>,
  builder: IRBuilder,
  inputSignals: ReadonlyMap<string, SigExprId>
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
    const sigId = compile(typedAst, ctx);

    return { ok: true, value: sigId };
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
function extractPayloadTypes(inputs: ReadonlyMap<string, SignalType>): ReadonlyMap<string, PayloadType> {
  const typeMap = new Map<string, PayloadType>();
  for (const [name, signalType] of inputs.entries()) {
    typeMap.set(name, signalType.payload);
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
  InputSuggestion,
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
