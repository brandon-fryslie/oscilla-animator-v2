# Definition of Done: Foundation
Generated: 2026-02-01-163000
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260201-163000-foundation-PLAN.md

## Acceptance Criteria

### HCL AST Type Definitions
- [ ] `HclValue` discriminated union defined with 6 variants: number, string, bool, reference, object, list
- [ ] `HclBlock` interface defined with type, labels, attributes, children, and position
- [ ] `HclDocument` interface defined with blocks array
- [ ] `Position` interface imported from src/expr/ast.ts and reused
- [ ] All types are readonly/immutable (readonly keyword on arrays/maps)
- [ ] File compiles with no errors and exports all types via index.ts

### Error Types
- [ ] `PatchDslError` class defined with message, position, and optional source context
- [ ] `PatchDslWarning` class defined with message and position
- [ ] Position type imported from ast.ts
- [ ] Error types support serialization (plain objects, no methods)
- [ ] File compiles and exports all types via index.ts

### Lexer (Tokenizer)
- [ ] `TokenKind` enum defined with all required token types: IDENT, NUMBER, STRING, BOOL, LBRACE, RBRACE, LBRACKET, RBRACKET, EQUALS, DOT, COMMA, COMMENT, NEWLINE, EOF
- [ ] `Token` interface defined with kind, value (raw text), and position
- [ ] `tokenize(input: string): Token[]` function implemented
- [ ] Position tracking accurate (start/end offsets for each token)
- [ ] Comment handling: `#` to end-of-line (comments are skipped, not emitted as tokens)
- [ ] String literal handling: double-quoted strings with escape sequences (\n, \t, \\, \")
- [ ] Number literal handling: integers and floats (scientific notation optional)
- [ ] Boolean literal handling: `true` and `false` keywords
- [ ] All tests pass (lexer.test.ts): edge cases (EOF, invalid chars), position tracking, all token types

### Parser (Recursive Descent)
- [ ] `parse(tokens: Token[]): HclDocument` function implemented
- [ ] Grammar implemented correctly (see PLAN.md)
- [ ] Error recovery implemented: on parse error, collect error and skip to next recovery point (`}` or NEWLINE)
- [ ] All errors collected in errors array (returned alongside AST)
- [ ] Position information preserved in all AST nodes
- [ ] All tests pass (parser.test.ts): valid HCL, nested blocks, malformed input, error recovery

## Overall Sprint Success Criteria
- [ ] All files compile without TypeScript errors
- [ ] All tests pass: `npx vitest run src/patch-dsl/__tests__/lexer.test.ts src/patch-dsl/__tests__/parser.test.ts`
- [ ] Sample HCL document can be tokenized and parsed to AST
- [ ] Malformed HCL produces partial AST + error list (no thrown exceptions)
- [ ] No dependencies on Patch types (pure HCL infrastructure)

## Verification Command
```bash
npx vitest run src/patch-dsl/__tests__/lexer.test.ts src/patch-dsl/__tests__/parser.test.ts
```
