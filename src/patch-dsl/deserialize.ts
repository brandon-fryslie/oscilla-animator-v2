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
import type { PatchDslError, PatchDslWarning } from './errors';

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
 * - Never throws exceptions
 *
 * @param hcl - HCL text
 * @returns Patch with errors/warnings
 */
export function deserializePatchFromHCL(hcl: string): DeserializeResult {
  // Phase 1: Lex → Parse
  const tokens = tokenize(hcl);
  const parseResult = parse(tokens);
  const errors: PatchDslError[] = [...parseResult.errors];
  const warnings: PatchDslWarning[] = [];

  // Phase 2: AST → Patch
  const result = patchFromAst(parseResult.document);
  errors.push(...result.errors);
  warnings.push(...result.warnings);

  return {
    patch: result.patch,
    errors,
    warnings,
  };
}
