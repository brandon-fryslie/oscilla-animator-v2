# Sprint: Foundation - Patch DSL Core Infrastructure
Generated: 2026-02-01-163000
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260201-162800.md

## Sprint Goal
Establish the foundational infrastructure for HCL parsing: AST types, error reporting, lexer (tokenizer), and recursive descent parser with error recovery.

## Scope
**Deliverables:**
- HCL AST type definitions (ast.ts) — Pure data structures, no Patch dependencies
- Error types with position info (errors.ts) — PatchDslError, PatchDslWarning
- Lexer (lexer.ts + tests) — Tokenize HCL text following src/expr/lexer.ts pattern
- Parser (parser.ts + tests) — Recursive descent parser with error recovery

**Non-Goals (Deferred):**
- Patch conversion logic (Sprint 2)
- Integration with PatchPersistence (Sprint 3)
- UI integration (out of scope)

## Work Items

### P0 (Critical): HCL AST Type Definitions (HIGH confidence)

**Dependencies**: None
**Spec Reference**: Plan Phase 1 (lines 34-61) • **Status Reference**: EVALUATION-20260201-162800.md lines 119-136

#### Description
Define immutable TypeScript types for the HCL abstract syntax tree. These are pure data structures representing parsed HCL documents (blocks, attributes, values) with position information for error reporting. Must NOT include any Patch-specific types — this is a generic HCL AST.

#### Acceptance Criteria
- [ ] `HclValue` discriminated union defined with 6 variants: number, string, bool, reference, object, list
- [ ] `HclBlock` interface defined with type, labels, attributes, children, and position
- [ ] `HclDocument` interface defined with blocks array
- [ ] `Position` interface imported from src/expr/ast.ts and reused
- [ ] All types are readonly/immutable (readonly keyword on arrays/maps)
- [ ] File compiles with no errors and exports all types via index.ts

#### Technical Notes
- Follow src/expr/ast.ts pattern: immutable, discriminated unions with `kind` field
- Position type is already defined in src/expr/ast.ts — reuse it
- HclValue.reference stores `parts: string[]` (e.g., `["osc", "out"]` for `osc.out`)
- HclBlock.labels stores block labels as strings (e.g., `["Ellipse", "dot"]` for `block "Ellipse" "dot" {}`)

---

### P0 (Critical): Error Types (HIGH confidence)

**Dependencies**: None
**Spec Reference**: Plan Phase 2 • **Status Reference**: EVALUATION-20260201-162800.md lines 408-410

#### Description
Define error and warning types for HCL parsing and deserialization. Must include position information for user-facing error messages. Follows the pattern of ParseError in src/expr/parser.ts.

#### Acceptance Criteria
- [ ] `PatchDslError` class defined with message, position, and optional source context
- [ ] `PatchDslWarning` class defined with message and position
- [ ] Position type imported from ast.ts
- [ ] Error types support serialization (plain objects, no methods)
- [ ] File compiles and exports all types via index.ts

#### Technical Notes
- Keep errors simple: message string + Position is sufficient
- Warning vs Error: Warnings allow partial deserialization, errors block it
- Position allows editor to highlight the problematic HCL source

---

### P0 (Critical): Lexer (Tokenizer) (HIGH confidence)

**Dependencies**: ast.ts (Position type), errors.ts
**Spec Reference**: Plan Phase 2 (lines 63-76) • **Status Reference**: EVALUATION-20260201-162800.md lines 263-271, 411-416

#### Description
Implement HCL tokenizer following the src/expr/lexer.ts pattern. Converts HCL text into a stream of tokens with position information. Must handle comments, strings, numbers, identifiers, and all HCL punctuation.

#### Acceptance Criteria
- [ ] `TokenKind` enum defined with all required token types: IDENT, NUMBER, STRING, BOOL, LBRACE, RBRACE, LBRACKET, RBRACKET, EQUALS, DOT, COMMA, COMMENT, NEWLINE, EOF
- [ ] `Token` interface defined with kind, value (raw text), and position
- [ ] `tokenize(input: string): Token[]` function implemented
- [ ] Position tracking accurate (start/end offsets for each token)
- [ ] Comment handling: `#` to end-of-line (comments are skipped, not emitted as tokens)
- [ ] String literal handling: double-quoted strings with escape sequences (\n, \t, \\, \")
- [ ] Number literal handling: integers and floats (scientific notation optional)
- [ ] Boolean literal handling: `true` and `false` keywords
- [ ] All tests pass (lexer.test.ts): edge cases (EOF, invalid chars), position tracking, all token types

#### Technical Notes
- Copy structure from src/expr/lexer.ts: Lexer class with input, pos, peek(), next() methods
- Use regex for identifier validation: `[a-zA-Z_][a-zA-Z0-9_]*`
- Use regex for number validation: `[0-9]+(\.[0-9]+)?`
- Whitespace (space, tab, CR) is skipped; newline is significant (emitted as NEWLINE token)
- Error on unexpected characters (throw LexError with position)

#### Unknowns to Resolve
None — pattern exists in src/expr/lexer.ts

---

### P0 (Critical): Parser (Recursive Descent) (HIGH confidence)

**Dependencies**: lexer.ts, ast.ts, errors.ts
**Spec Reference**: Plan Phase 3 (lines 78-94) • **Status Reference**: EVALUATION-20260201-162800.md lines 272-279, 417-421

#### Description
Implement recursive descent parser that converts token stream to HCL AST. Must include error recovery (skip to next `}` or newline on parse error) to produce partial ASTs from malformed HCL. Follows src/expr/parser.ts pattern.

#### Acceptance Criteria
- [ ] `parse(tokens: Token[]): HclDocument` function implemented
- [ ] Grammar implemented correctly (see grammar below)
- [ ] Error recovery implemented: on parse error, collect error and skip to next recovery point (`}` or NEWLINE)
- [ ] All errors collected in errors array (returned alongside AST)
- [ ] Position information preserved in all AST nodes
- [ ] All tests pass (parser.test.ts): valid HCL, nested blocks, malformed input, error recovery

#### Technical Notes
**Grammar:**
```
document     := block*
block        := IDENT label* LBRACE body RBRACE
label        := STRING
body         := (attribute | block)*
attribute    := IDENT EQUALS value
value        := NUMBER | STRING | BOOL | reference | object | list
reference    := IDENT (DOT IDENT)*
object       := LBRACE (IDENT EQUALS value (COMMA? IDENT EQUALS value)*)? RBRACE
list         := LBRACKET (value (COMMA value)*)? RBRACKET
```

**Implementation pattern** (from src/expr/parser.ts):
- Parser class with tokens array and current position
- Helper methods: peek(), match(kind), consume(kind), expect(kind)
- Recursive methods for each grammar production: parseBlock(), parseValue(), parseReference(), etc.
- Error recovery: on unexpected token, record error and skip to recovery point

**Error recovery strategy:**
- On attribute parse error: skip to next NEWLINE or RBRACE
- On block parse error: skip to matching RBRACE
- On value parse error: return null value, record error, continue

#### Unknowns to Resolve
None — pattern exists in src/expr/parser.ts

---

## Dependencies
**External:**
- src/expr/ast.ts (Position type)
- src/expr/lexer.ts (pattern reference)
- src/expr/parser.ts (pattern reference)

**Internal (within sprint):**
- ast.ts → errors.ts (Position type)
- lexer.ts depends on ast.ts (Position)
- parser.ts depends on lexer.ts, ast.ts, errors.ts

## Risks
**None** — All work is greenfield with clear reference patterns. Lexer and parser follow established patterns from src/expr/ with simpler grammar (no operator precedence).

## Notes
- This sprint establishes pure HCL infrastructure with NO Patch dependencies
- All items are HIGH confidence because patterns exist and grammar is complete
- Estimated effort: ~6 hours (ast: 0.5h, errors: 0.25h, lexer: 2h, parser: 3h, tests: included)
