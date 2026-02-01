# Implementation Context: Foundation

## Goal
An agent with ONLY this file can implement the foundation sprint (AST, errors, lexer, parser).

## Module Structure
```
src/patch-dsl/
  ast.ts                # HCL AST types (this sprint)
  errors.ts             # Error types (this sprint)
  lexer.ts              # Tokenizer (this sprint)
  parser.ts             # Parser (this sprint)
  __tests__/
    lexer.test.ts       # Lexer tests (this sprint)
    parser.test.ts      # Parser tests (this sprint)
```

## File 1: ast.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/ast.ts`

**Imports:**
```typescript
export type { Position } from '../expr/ast';
```

**Types to define:**

```typescript
// Reuse Position from expr AST
export type { Position } from '../expr/ast';

// HCL value types (right side of `=`)
export type HclValue =
  | HclNumberValue
  | HclStringValue
  | HclBoolValue
  | HclReferenceValue
  | HclObjectValue
  | HclListValue;

export interface HclNumberValue {
  readonly kind: 'number';
  readonly value: number;
}

export interface HclStringValue {
  readonly kind: 'string';
  readonly value: string;
}

export interface HclBoolValue {
  readonly kind: 'bool';
  readonly value: boolean;
}

export interface HclReferenceValue {
  readonly kind: 'reference';
  readonly parts: readonly string[];  // ["osc", "out"] for osc.out
}

export interface HclObjectValue {
  readonly kind: 'object';
  readonly entries: Record<string, HclValue>;
}

export interface HclListValue {
  readonly kind: 'list';
  readonly items: readonly HclValue[];
}

// HCL block structure
export interface HclBlock {
  readonly type: string;                    // "block", "connect", "patch", etc.
  readonly labels: readonly string[];       // ["Ellipse", "dot"] for block "Ellipse" "dot" {}
  readonly attributes: Record<string, HclValue>;
  readonly children: readonly HclBlock[];   // nested blocks
  readonly pos: Position;
}

// HCL document (top level)
export interface HclDocument {
  readonly blocks: readonly HclBlock[];
}
```

**Pattern to follow**: See `/Users/bmf/code/oscilla-animator-v2/src/expr/ast.ts` (lines 1-60)
- Discriminated unions with `kind` field
- Readonly/immutable types
- Position interface reused

---

## File 2: errors.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/errors.ts`

**Imports:**
```typescript
import type { Position } from './ast';
```

**Types to define:**

```typescript
import type { Position } from './ast';

/**
 * Parse or deserialization error with position information.
 */
export class PatchDslError {
  constructor(
    public readonly message: string,
    public readonly pos: Position,
    public readonly source?: string  // Optional: HCL source context
  ) {}

  toString(): string {
    return `Error at ${this.pos.start}-${this.pos.end}: ${this.message}`;
  }
}

/**
 * Non-fatal warning during deserialization.
 */
export class PatchDslWarning {
  constructor(
    public readonly message: string,
    public readonly pos?: Position
  ) {}

  toString(): string {
    if (this.pos) {
      return `Warning at ${this.pos.start}-${this.pos.end}: ${this.message}`;
    }
    return `Warning: ${this.message}`;
  }
}
```

**Pattern to follow**: Similar to ParseError in src/expr/parser.ts, but simpler (no need for Error subclass)

---

## File 3: lexer.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/lexer.ts`

**Reference pattern**: `/Users/bmf/code/oscilla-animator-v2/src/expr/lexer.ts` (entire file)

**Token enum:**
```typescript
export enum TokenKind {
  // Literals
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  BOOL = 'BOOL',
  IDENT = 'IDENT',

  // Punctuation
  LBRACE = 'LBRACE',      // {
  RBRACE = 'RBRACE',      // }
  LBRACKET = 'LBRACKET',  // [
  RBRACKET = 'RBRACKET',  // ]
  EQUALS = 'EQUALS',      // =
  DOT = 'DOT',            // .
  COMMA = 'COMMA',        // ,

  // Structural
  COMMENT = 'COMMENT',    // # ...
  NEWLINE = 'NEWLINE',    // \n

  // Special
  EOF = 'EOF',
}
```

**Token interface:**
```typescript
export interface Token {
  readonly kind: TokenKind;
  readonly value: string;  // Raw text
  readonly pos: Position;
}
```

**Main function signature:**
```typescript
export function tokenize(input: string): Token[]
```

**Implementation notes:**
- Lexer class (internal) maintains `input: string` and `pos: number`
- Methods: `peek(): string | null`, `next(): string | null`, `skipWhitespace()`, `readNumber()`, `readString()`, `readIdent()`, `readComment()`
- Position tracking: track start offset, emit Token with `{ start, end }` position
- Whitespace handling: skip spaces/tabs/CR, emit NEWLINE for \n
- Comment handling: `#` to end-of-line (skip, do NOT emit as token)
- String escapes: `\"`, `\\`, `\n`, `\t`
- Boolean keywords: `true` and `false` (IDENT vs BOOL decision in readIdent)

**Example pattern** (from src/expr/lexer.ts lines 70-286):
```typescript
class Lexer {
  private input: string;
  private pos: number;

  constructor(input: string) {
    this.input = input;
    this.pos = 0;
  }

  private peek(): string | null {
    return this.pos < this.input.length ? this.input[this.pos] : null;
  }

  private next(): string | null {
    return this.pos < this.input.length ? this.input[this.pos++] : null;
  }

  // ... readNumber, readString, readIdent, etc.
}

export function tokenize(input: string): Token[] {
  const lexer = new Lexer(input);
  const tokens: Token[] = [];
  // ... loop until EOF
  return tokens;
}
```

---

## File 4: parser.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/parser.ts`

**Reference pattern**: `/Users/bmf/code/oscilla-animator-v2/src/expr/parser.ts` (entire file, ~400 lines)

**Main function signature:**
```typescript
export interface ParseResult {
  readonly document: HclDocument;
  readonly errors: PatchDslError[];
}

export function parse(tokens: Token[]): ParseResult
```

**Grammar (from plan):**
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

**Implementation structure:**
```typescript
class Parser {
  private tokens: Token[];
  private pos: number;
  private errors: PatchDslError[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
    this.errors = [];
  }

  private peek(): Token {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : /* EOF token */;
  }

  private next(): Token { /* ... */ }

  private match(kind: TokenKind): boolean { /* ... */ }

  private consume(kind: TokenKind): Token | null {
    // If match, advance and return token; else record error
  }

  private expect(kind: TokenKind, context: string): Token | null {
    const tok = this.consume(kind);
    if (!tok) {
      this.errors.push(new PatchDslError(`Expected ${kind} in ${context}`, this.peek().pos));
    }
    return tok;
  }

  // Recovery: skip to next RBRACE or NEWLINE
  private recoverToBlockEnd(): void { /* ... */ }
  private recoverToNewline(): void { /* ... */ }

  // Grammar productions
  parseDocument(): HclDocument { /* ... */ }
  parseBlock(): HclBlock | null { /* ... */ }
  parseAttribute(): { key: string; value: HclValue } | null { /* ... */ }
  parseValue(): HclValue | null { /* ... */ }
  parseReference(): HclReferenceValue | null { /* ... */ }
  parseObject(): HclObjectValue | null { /* ... */ }
  parseList(): HclListValue | null { /* ... */ }
}

export function parse(tokens: Token[]): ParseResult {
  const parser = new Parser(tokens);
  const document = parser.parseDocument();
  return { document, errors: parser.errors };
}
```

**Error recovery strategy:**
- On unexpected token: push error, skip to recovery point
- Recovery points: RBRACE (end of block), NEWLINE (end of attribute)
- Continue parsing after recovery (produce partial AST)

**Pattern reference**: src/expr/parser.ts implements similar recursive descent with error handling

---

## File 5: __tests__/lexer.test.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/__tests__/lexer.test.ts`

**Test structure** (using Vitest):
```typescript
import { describe, it, expect } from 'vitest';
import { tokenize, TokenKind } from '../lexer';

describe('lexer', () => {
  it('tokenizes simple block', () => {
    const input = 'block "Ellipse" "dot" {}';
    const tokens = tokenize(input);
    expect(tokens[0].kind).toBe(TokenKind.IDENT);
    expect(tokens[0].value).toBe('block');
    expect(tokens[1].kind).toBe(TokenKind.STRING);
    expect(tokens[1].value).toBe('Ellipse');
    // ... more assertions
  });

  it('tokenizes numbers', () => {
    const tokens = tokenize('123 45.67');
    expect(tokens[0].kind).toBe(TokenKind.NUMBER);
    expect(tokens[0].value).toBe('123');
    expect(tokens[1].kind).toBe(TokenKind.NUMBER);
    expect(tokens[1].value).toBe('45.67');
  });

  it('tokenizes booleans', () => {
    const tokens = tokenize('true false');
    expect(tokens[0].kind).toBe(TokenKind.BOOL);
    expect(tokens[0].value).toBe('true');
    expect(tokens[1].kind).toBe(TokenKind.BOOL);
    expect(tokens[1].value).toBe('false');
  });

  it('skips comments', () => {
    const tokens = tokenize('# comment\nblock');
    expect(tokens[0].kind).toBe(TokenKind.NEWLINE);
    expect(tokens[1].kind).toBe(TokenKind.IDENT);
  });

  it('tracks position', () => {
    const tokens = tokenize('abc');
    expect(tokens[0].pos).toEqual({ start: 0, end: 3 });
  });

  it('handles string escapes', () => {
    const tokens = tokenize('"hello\\nworld"');
    expect(tokens[0].kind).toBe(TokenKind.STRING);
    expect(tokens[0].value).toBe('hello\nworld');
  });

  // Add more edge cases: EOF, invalid chars, etc.
});
```

**Pattern reference**: See src/expr/__tests__/lexer.test.ts (if exists) or similar test patterns in codebase

---

## File 6: __tests__/parser.test.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/__tests__/parser.test.ts`

**Test structure**:
```typescript
import { describe, it, expect } from 'vitest';
import { parse } from '../parser';
import { tokenize } from '../lexer';

function parseHcl(input: string) {
  return parse(tokenize(input));
}

describe('parser', () => {
  it('parses empty document', () => {
    const result = parseHcl('');
    expect(result.document.blocks).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('parses simple block', () => {
    const input = 'block "Ellipse" "dot" {}';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks).toHaveLength(1);
    expect(result.document.blocks[0].type).toBe('block');
    expect(result.document.blocks[0].labels).toEqual(['Ellipse', 'dot']);
  });

  it('parses attributes', () => {
    const input = 'block "Test" { foo = 42 }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].attributes.foo).toEqual({ kind: 'number', value: 42 });
  });

  it('parses nested blocks', () => {
    const input = 'block "A" { block "B" {} }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].children).toHaveLength(1);
  });

  it('parses references', () => {
    const input = 'connect { from = osc.out }';
    const result = parseHcl(input);
    expect(result.document.blocks[0].attributes.from).toEqual({
      kind: 'reference',
      parts: ['osc', 'out']
    });
  });

  it('parses objects', () => {
    const input = 'block "A" { color = { r = 1, g = 0.5 } }';
    const result = parseHcl(input);
    expect(result.document.blocks[0].attributes.color.kind).toBe('object');
  });

  it('parses lists', () => {
    const input = 'block "A" { items = [1, 2, 3] }';
    const result = parseHcl(input);
    expect(result.document.blocks[0].attributes.items.kind).toBe('list');
  });

  it('recovers from parse errors', () => {
    const input = 'block "A" { invalid syntax }\nblock "B" {}';
    const result = parseHcl(input);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.document.blocks.length).toBeGreaterThan(0);  // Partial parse
  });

  // Add more: nested values, complex objects, malformed input, etc.
});
```

---

## Key Patterns to Follow

### 1. Immutability
All AST types use `readonly` modifiers. Follow src/expr/ast.ts pattern.

### 2. Position Tracking
Every token and AST node has Position. Lexer tracks start/end offsets. Parser preserves them.

### 3. Error Recovery
Parser collects errors in array, does NOT throw on first error. Skips to recovery points and continues.

### 4. Discriminated Unions
Use `kind` field for type discrimination (HclValue variants). TypeScript exhaustiveness checking works.

### 5. Token Stream Pattern
Lexer produces token array. Parser consumes it with peek/next/consume helpers. No streaming/generators.

---

## HCL Grammar (Complete)

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

**Notes:**
- Comma is optional between object entries (newline is sufficient)
- Nested blocks are allowed anywhere in body
- NEWLINE tokens separate attributes but are not strictly required (RBRACE also ends attribute parsing)

---

## Example HCL Input (For Testing)

```hcl
patch "Test" {
  block "Ellipse" "dot" {
    rx = 0.02
    ry = 0.02
  }

  block "Const" "color" {
    value = { r = 1.0, g = 0.5, b = 0.0, a = 1.0 }
  }

  connect {
    from = dot.shape
    to = render.shape
  }
}
```

Expected AST:
- 1 patch block with 3 children (2 block blocks, 1 connect block)
- First block: type="block", labels=["Ellipse","dot"], attributes={rx:0.02, ry:0.02}
- Second block: type="block", labels=["Const","color"], attributes={value:{kind:'object',...}}
- Third block: type="connect", attributes={from:{kind:'reference',parts:['dot','shape']}, to:{...}}

---

## Gotchas

1. **NEWLINE significance**: Newlines separate attributes, but RBRACE also ends attribute parsing. Don't require NEWLINE after every attribute.

2. **Comment handling**: Comments are lexed but NOT emitted as tokens (skipped). Parser never sees them.

3. **Boolean vs IDENT**: Lexer must recognize `true` and `false` as BOOL tokens, not IDENT.

4. **String escapes**: Must handle `\"`, `\\`, `\n`, `\t` in readString(). Convert escape sequences to actual characters.

5. **Reference vs object**: `{ foo = bar }` is an object, `foo.bar` is a reference. Parser distinguishes by looking for `=` after first IDENT.

6. **Empty collections**: `{}` is valid empty object, `[]` is valid empty list. Don't require at least one element.

7. **Trailing commas**: Optional. Allow `[1, 2, 3,]` and `{ a = 1, b = 2, }`.

---

## Execution Order

1. Implement ast.ts (30 min)
2. Implement errors.ts (15 min)
3. Implement lexer.ts + lexer.test.ts (2 hours)
   - Run tests continuously: `npx vitest run src/patch-dsl/__tests__/lexer.test.ts`
4. Implement parser.ts + parser.test.ts (3 hours)
   - Run tests continuously: `npx vitest run src/patch-dsl/__tests__/parser.test.ts`
5. Verify: All tests pass, sample HCL parses correctly

---

## Success Criteria

- [ ] All TypeScript files compile with no errors
- [ ] `npx vitest run src/patch-dsl/__tests__/lexer.test.ts` — all tests pass
- [ ] `npx vitest run src/patch-dsl/__tests__/parser.test.ts` — all tests pass
- [ ] Sample HCL from plan parses to correct AST
- [ ] Malformed HCL produces partial AST + error list (no exceptions thrown)
