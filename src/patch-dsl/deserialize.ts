/**
 * HCL → Patch Deserializer
 *
 * Main entry point for converting HCL text to Patch objects.
 * Orchestrates: Lex → Parse → AST→Patch conversion.
 */

import type { Patch } from '../graph/Patch';
import { tokenize } from './lexer';
import { parse } from './parser';
import { patchFromAst } from './patch-from-ast';
import { PatchDslError, type PatchDslWarning } from './errors';

/**
 * Result of HCL deserialization.
 */
export interface DeserializeResult {
  readonly patch: Patch;
  readonly errors: PatchDslError[];
  readonly warnings: PatchDslWarning[];
}

/**
 * Deserialize HCL text to Patch.
 *
 * Error handling:
 * - Collects all errors and warnings
 * - Returns partial patch even if errors occur
 * - Never throws exceptions (catches lexer/parser exceptions)
 *
 * @param hcl - HCL text
 * @returns Patch with errors/warnings
 */
export function deserializePatchFromHCL(hcl: string): DeserializeResult {
  const errors: PatchDslError[] = [];
  const warnings: PatchDslWarning[] = [];

  try {
    // Phase 1: Lex → Parse
    const tokens = tokenize(hcl);
    const parseResult = parse(tokens);
    errors.push(...parseResult.errors);

    // Phase 2: AST → Patch
    const result = patchFromAst(parseResult.document);
    errors.push(...result.errors);
    warnings.push(...result.warnings);

    return {
      patch: result.patch,
      errors,
      warnings,
    };
  } catch (e) {
    // Lexer or parser threw an exception (e.g., unterminated string, unexpected character)
    const errorMessage = e instanceof Error ? e.message : String(e);
    errors.push(new PatchDslError(`Parse failed: ${errorMessage}`, { start: 0, end: 0 }));

    // Return empty patch
    const emptyPatch: Patch = { blocks: new Map(), edges: [] };
    return {
      patch: emptyPatch,
      errors,
      warnings,
    };
  }
}
