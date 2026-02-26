import { tokenize, TokenKind } from './lexer';

export interface ExpressionProgramWarning {
  readonly code: 'W_EXPR_VAR_REASSIGNED';
  readonly line: number;
  readonly variable: string;
  readonly message: string;
}

export interface ExpressionProgramAssignment {
  readonly line: number;
  readonly variable: string;
  readonly expression: string;
}

export interface ExtractedExpressionProgram {
  readonly assignments: readonly ExpressionProgramAssignment[];
  readonly output: string | null;
  readonly warnings: readonly ExpressionProgramWarning[];
}

interface ProgramLine {
  readonly line: number;
  readonly text: string;
  readonly absoluteOffset: number;
}

export class ExpressionProgramError extends Error {
  readonly absolutePosition?: number;
  readonly line?: number;

  constructor(message: string, options: { absolutePosition?: number; line?: number } = {}) {
    super(message);
    this.name = 'ExpressionProgramError';
    this.absolutePosition = options.absolutePosition;
    this.line = options.line;
  }
}

const ASSIGNMENT_RE = /^([A-Za-z_](?:[A-Za-z0-9_]|-(?=[A-Za-z_]))*)\s*=(?![=])\s*(.+)$/;

function stripSingleLineComment(input: string): string {
  const idx = input.indexOf('//');
  return idx === -1 ? input : input.slice(0, idx);
}

function collectProgramLines(exprText: string): ProgramLine[] {
  const rawLines = exprText.split(/\r?\n/);
  const lines: ProgramLine[] = [];
  let absoluteOffset = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const withoutComment = stripSingleLineComment(raw);
    const trimmed = withoutComment.trim();
    if (trimmed.length > 0) {
      const relative = withoutComment.indexOf(trimmed);
      lines.push({
        line: i + 1,
        text: trimmed,
        absoluteOffset: absoluteOffset + Math.max(0, relative),
      });
    }
    absoluteOffset += raw.length + 1;
  }

  return lines;
}

function extractRelativePosition(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const match = err.message.match(/position\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function inlineVariables(
  expression: string,
  env: ReadonlyMap<string, string>,
  line: ProgramLine,
): string {
  let tokens;
  try {
    tokens = tokenize(expression);
  } catch (err) {
    const relative = extractRelativePosition(err);
    throw new ExpressionProgramError(
      err instanceof Error ? err.message : String(err),
      {
        line: line.line,
        absolutePosition: relative === null ? line.absoluteOffset : line.absoluteOffset + relative,
      },
    );
  }

  const rewritten: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === TokenKind.EOF) break;

    if (token.kind === TokenKind.IDENT) {
      const replacement = env.get(token.value);
      if (replacement !== undefined) {
        rewritten.push(`(${replacement})`);
        continue;
      }
    }

    rewritten.push(token.value);
  }

  return rewritten.join('');
}

/**
 * Non-throwing parse used by UI surfaces.
 * Gathers assignment metadata + reassignment warnings.
 */
export function extractExpressionProgram(exprText: string): ExtractedExpressionProgram {
  const lines = collectProgramLines(exprText);
  const warnings: ExpressionProgramWarning[] = [];
  const assignments: ExpressionProgramAssignment[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const match = line.text.match(ASSIGNMENT_RE);
    if (!match) continue;

    const variable = match[1];
    const expression = match[2].trim();
    assignments.push({ line: line.line, variable, expression });

    if (seen.has(variable)) {
      warnings.push({
        code: 'W_EXPR_VAR_REASSIGNED',
        line: line.line,
        variable,
        message: `Variable '${variable}' reassigned; latest assignment is used.`,
      });
    }
    seen.add(variable);
  }

  return {
    assignments,
    output: lines.length > 0 ? lines[lines.length - 1].text : null,
    warnings,
  };
}

/**
 * Compile-time extraction for multiline expression programs.
 *
 * Rules:
 * - Each non-empty, non-comment line before the final line must be an assignment.
 * - Final line is the output expression (or assignment, where RHS is output).
 * - Assignments are pure aliases and are inlined into subsequent lines.
 */
export function lowerExpressionProgram(exprText: string): {
  readonly expression: string;
  readonly warnings: readonly ExpressionProgramWarning[];
} {
  const lines = collectProgramLines(exprText);
  if (lines.length === 0) {
    return { expression: '', warnings: [] };
  }

  const warnings: ExpressionProgramWarning[] = [];
  const env = new Map<string, string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLast = i === lines.length - 1;
    const match = line.text.match(ASSIGNMENT_RE);

    if (!isLast && !match) {
      throw new ExpressionProgramError(
        `Line ${line.line} must be an assignment. Only the final line can be a bare output expression.`,
        { line: line.line, absolutePosition: line.absoluteOffset },
      );
    }

    if (match) {
      const variable = match[1];
      const rhs = match[2].trim();
      if (rhs.length === 0) {
        throw new ExpressionProgramError(
          `Line ${line.line}: assignment for '${variable}' is missing a right-hand expression.`,
          { line: line.line, absolutePosition: line.absoluteOffset },
        );
      }

      const expandedRhs = inlineVariables(rhs, env, line);

      if (env.has(variable)) {
        warnings.push({
          code: 'W_EXPR_VAR_REASSIGNED',
          line: line.line,
          variable,
          message: `Variable '${variable}' reassigned; latest assignment is used.`,
        });
      }
      env.set(variable, expandedRhs);

      if (isLast) {
        return { expression: expandedRhs, warnings };
      }
      continue;
    }

    const output = inlineVariables(line.text, env, line);
    return { expression: output, warnings };
  }

  throw new ExpressionProgramError('Expression program could not determine an output expression.');
}
