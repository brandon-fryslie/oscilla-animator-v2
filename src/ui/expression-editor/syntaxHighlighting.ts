import { tokenize, TokenKind, type Token } from '../../expr/lexer';

export interface ExpressionSyntaxSpan {
  readonly start: number;
  readonly end: number;
  readonly className: string;
}

export function buildExpressionSyntaxSpans(text: string): readonly ExpressionSyntaxSpan[] {
  const spans: ExpressionSyntaxSpan[] = [];
  const lines = text.split('\n');
  let offset = 0;

  for (const line of lines) {
    const commentIndex = line.indexOf('//');
    const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
    const comment = commentIndex >= 0 ? line.slice(commentIndex) : '';

    spans.push(...tokenizeLineSyntax(code, offset));
    if (comment.length > 0) {
      spans.push({
        start: offset + commentIndex,
        end: offset + line.length,
        className: 'expr-syntax expr-syntax--comment',
      });
    }

    offset += line.length + 1;
  }

  return spans;
}

function tokenizeLineSyntax(line: string, lineOffset: number): readonly ExpressionSyntaxSpan[] {
  if (line.trim().length === 0) {
    return [];
  }

  try {
    const tokens = tokenize(line);
    return tokens
      .filter((token) => token.kind !== TokenKind.EOF)
      .map((token, index) => buildSyntaxSpan(token, tokens[index + 1], lineOffset))
      .filter((span): span is ExpressionSyntaxSpan => span !== null);
  } catch {
    return [];
  }
}

function buildSyntaxSpan(
  token: Token,
  nextToken: Token | undefined,
  lineOffset: number,
): ExpressionSyntaxSpan | null {
  const className = syntaxClassName(token, nextToken);
  if (!className) {
    return null;
  }

  return {
    start: lineOffset + token.pos.start,
    end: lineOffset + token.pos.end,
    className,
  };
}

function syntaxClassName(token: Token, nextToken: Token | undefined): string | null {
  switch (token.kind) {
    case TokenKind.NUMBER:
      return 'expr-syntax expr-syntax--number';
    case TokenKind.IDENT:
      return nextToken?.kind === TokenKind.LPAREN
        ? 'expr-syntax expr-syntax--function'
        : 'expr-syntax expr-syntax--identifier';
    case TokenKind.PLUS:
    case TokenKind.MINUS:
    case TokenKind.STAR:
    case TokenKind.SLASH:
    case TokenKind.PERCENT:
    case TokenKind.LT:
    case TokenKind.GT:
    case TokenKind.LTE:
    case TokenKind.GTE:
    case TokenKind.EQ:
    case TokenKind.NEQ:
    case TokenKind.AND:
    case TokenKind.OR:
    case TokenKind.NOT:
    case TokenKind.QUESTION:
    case TokenKind.COLON:
      return 'expr-syntax expr-syntax--operator';
    case TokenKind.LPAREN:
    case TokenKind.RPAREN:
    case TokenKind.COMMA:
    case TokenKind.DOT:
      return 'expr-syntax expr-syntax--punctuation';
    default:
      return null;
  }
}
