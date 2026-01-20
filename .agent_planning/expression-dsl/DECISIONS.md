# Expression DSL Parser Implementation Decision

**Status:** APPROVED
**Last Updated:** 2026-01-20
**Sprint:** Research (Sprint 1)
**Decision:** Hand-Written Recursive Descent Parser

## Executive Summary

After evaluating three parser implementation approaches, we recommend a **hand-written recursive descent parser** for the Expression DSL.

**Rationale:**
- Zero bundle size impact (no dependencies)
- Full control over error messages
- Type-safe AST construction
- Simple enough grammar to implement cleanly (~400 LOC)
- No build step complexity

## Approaches Evaluated

### Option A: Hand-Written Recursive Descent

#### Description

Implement a custom parser using recursive descent algorithm. This is the classic approach for LL(1) grammars.

#### Implementation Sketch

```typescript
class Parser {
  private tokens: Token[];
  private pos: number = 0;

  parse(): Expr {
    return this.expression();
  }

  private expression(): Expr {
    return this.ternary();
  }

  private ternary(): Expr {
    let expr = this.logical();
    if (this.match('?')) {
      const then = this.expression();
      this.expect(':');
      const else_ = this.expression();
      return { kind: 'ternary', cond: expr, then, else: else_ };
    }
    return expr;
  }

  private logical(): Expr {
    let left = this.compare();
    while (this.match('&&', '||')) {
      const op = this.previous().type;
      const right = this.compare();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  // ... similar for other precedence levels
}
```

#### Pros

- **Zero bundle size**: No external dependencies
- **Full control**: Custom error messages, recovery strategies
- **Type-safe**: TypeScript AST types, no 'any' casts
- **Performance**: Fast, no library overhead
- **Debuggable**: Easy to step through in debugger
- **Maintainable**: Straightforward code, matches grammar structure

#### Cons

- **More code**: ~400 LOC vs ~200 LOC with library
- **Manual error handling**: Must implement error recovery ourselves
- **Testing**: More test cases for parser logic

#### Estimated Complexity

- Lexer: ~100 LOC
- Parser: ~300 LOC
- Error reporting: ~50 LOC
- Tests: ~200 LOC
- **Total: ~650 LOC**

#### Bundle Size Impact

**0 KB** (no dependencies)

---

### Option B: Parser Combinator Library (Parsimmon)

#### Description

Use Parsimmon, a popular parser combinator library for JavaScript/TypeScript. Parsers are composed from small building blocks.

#### Implementation Sketch

```typescript
import P from 'parsimmon';

const ExprParser = P.createLanguage({
  Expr: (r) => r.Ternary,

  Ternary: (r) =>
    P.seq(r.Logical, P.string('?'), r.Expr, P.string(':'), r.Expr)
      .map(([cond, _, then, __, else_]) => ({
        kind: 'ternary' as const,
        cond,
        then,
        else: else_,
      }))
      .or(r.Logical),

  Logical: (r) =>
    r.Compare.sepBy1(P.alt(P.string('&&'), P.string('||')))
      .map((exprs) => /* fold into binary ops */),

  // ... similar for other rules
});
```

#### Pros

- **Concise**: ~200 LOC (half of hand-written)
- **Declarative**: Parser structure matches grammar closely
- **Error recovery**: Built-in error recovery mechanisms
- **Type-safe**: TypeScript definitions available
- **Proven**: Used in production by many projects

#### Cons

- **Bundle size**: ~15-20 KB (minified + gzipped estimate)
- **Learning curve**: Team must learn combinator patterns
- **Less control**: Error messages less customizable
- **Dependency**: External library maintenance risk
- **Debugging**: Harder to step through combinator internals

#### Estimated Complexity

- Parser definition: ~200 LOC
- Error handling: ~50 LOC
- Tests: ~150 LOC
- **Total: ~400 LOC**

#### Bundle Size Impact

**Estimated: 15-20 KB** (minified + gzipped)

*Note: Actual measurement would require installing and building, but Parsimmon is known to be lightweight.*

---

### Option C: Generated Parser (PEG.js or similar)

#### Description

Write grammar in PEG (Parsing Expression Grammar) notation, generate parser code at build time.

#### Implementation Sketch

Grammar file (`expression.pegjs`):
```pegjs
Expression
  = Ternary

Ternary
  = cond:Logical "?" _ then:Expression ":" _ else:Expression {
      return { kind: 'ternary', cond, then, else }
    }
  / Logical

Logical
  = left:Compare _ op:("&&" / "||") _ right:Logical {
      return { kind: 'binary', op, left, right }
    }
  / Compare

// ... similar for other rules
```

Build step:
```json
{
  "scripts": {
    "generate-parser": "pegjs expression.pegjs",
    "build": "npm run generate-parser && tsc && vite build"
  }
}
```

#### Pros

- **Declarative grammar**: Very clear, readable
- **Powerful**: Can handle complex grammars easily
- **Generated code**: No manual parser logic

#### Cons

- **Build step complexity**: Must regenerate on grammar change
- **Large bundle**: Generated parsers are often 30-50 KB
- **Type safety**: Generated code may need manual type annotations
- **Less control**: Error messages from generator, hard to customize
- **Debugging**: Generated code is hard to read/debug
- **Overkill**: Expression DSL grammar is simple, doesn't need PEG power

#### Estimated Complexity

- Grammar definition: ~150 LOC
- Type annotations: ~50 LOC
- Build setup: ~50 LOC
- Tests: ~150 LOC
- **Total: ~400 LOC**

#### Bundle Size Impact

**Estimated: 30-50 KB** (minified + gzipped)

---

## Comparison Matrix

| Criterion | Hand-Written | Parsimmon | PEG.js | Winner |
|-----------|--------------|-----------|--------|--------|
| Bundle Size | 0 KB | ~15-20 KB | ~30-50 KB | **Hand-Written** |
| LOC | ~650 | ~400 | ~400 | Parsimmon / PEG.js |
| Type Safety | ✅ Full | ✅ Good | ⚠️ Manual | **Hand-Written** |
| Error Control | ✅ Full | ⚠️ Limited | ⚠️ Limited | **Hand-Written** |
| Debuggability | ✅ Easy | ⚠️ Harder | ❌ Hard | **Hand-Written** |
| Learning Curve | ✅ Standard | ⚠️ Combinator | ⚠️ PEG + Build | **Hand-Written** |
| Maintenance | ✅ In-house | ⚠️ Dependency | ⚠️ Dependency | **Hand-Written** |
| Grammar Power | ⚠️ LL(1) | ✅ PEG-like | ✅ PEG | Parsimmon / PEG.js |

---

## Decision: Hand-Written Recursive Descent

### Reasons

1. **Zero Bundle Size**: For a web app, avoiding 15-50 KB for a simple parser is worth ~200 extra LOC.

2. **Full Error Control**: Artists need excellent error messages. Hand-written parser allows custom error recovery and suggestions (e.g., Levenshtein distance for "did you mean?").

3. **Type Safety**: TypeScript AST types flow naturally, no need for library type gymnastics.

4. **Grammar Simplicity**: Expression DSL grammar is LL(1) with standard precedence. It's not complex enough to justify a library or generator.

5. **No Build Complexity**: No generation step, no external dependency to maintain.

6. **Team Familiarity**: Recursive descent is a well-known pattern, easier for future maintainers.

7. **Performance**: No library overhead, ~microseconds to parse typical expressions.

### Trade-offs Accepted

1. **More Code**: ~650 LOC vs ~400 LOC with library
   - **Mitigation**: Grammar is simple, code is straightforward

2. **Manual Error Recovery**: Must implement ourselves
   - **Mitigation**: Fail-fast for v1 (simpler), multi-error for v2 if needed

3. **Manual Testing**: More parser test cases
   - **Mitigation**: Parser tests are simple (input → AST or error)

### Implementation Plan

See `SPRINT-20260120-110200-core-impl-PLAN.md` for detailed implementation plan.

**Summary:**
1. Lexer: Tokenize input string
2. Parser: Recursive descent with precedence climbing
3. Error reporting: Position tracking, helpful messages
4. Type checker: Bottom-up type inference
5. IR compiler: AST → sigConst/sigMap/sigZip calls

---

## Alternative Considered: Hybrid Approach

**Idea:** Use Parsimmon for rapid prototyping, then rewrite hand-written if bundle size is an issue.

**Rejected:** Introduces churn, better to start with final approach.

---

## Validation

### Bundle Size Verification

After core implementation sprint:
1. Build project: `npm run build`
2. Check `dist/` bundle sizes
3. Verify no parser library added to bundle

**Target:** Expression DSL adds < 5 KB to bundle (compressed AST + parser code).

### Error Message Quality

User testing with example expressions:
1. Intentional errors (syntax, type, undefined)
2. Verify error messages are clear and actionable
3. Collect feedback on suggestion quality

### Performance

Benchmark typical expressions:
- Simple: `phase * 2` → expect < 0.1 ms
- Complex: `clamp(lerp(a, b, smoothstep(0, 1, phase)), 0, 1)` → expect < 1 ms

**Target:** < 1 ms for 99th percentile.

---

## References

### Hand-Written Parser Resources

- **Crafting Interpreters** (Bob Nystrom): Chapter on recursive descent parsing
- **Dragon Book**: Classic compiler reference
- **Pratt Parsing**: Precedence climbing technique

### Similar Implementations

- JavaScript expression evaluators
- Math parsers (e.g., math.js)
- Formula parsers (spreadsheet-like)

### Code Examples

Minimal recursive descent parser in TypeScript:
```typescript
// Lexer
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    const char = input[pos];

    if (/\s/.test(char)) {
      pos++;
      continue;
    }

    if (/\d/.test(char)) {
      let num = '';
      const start = pos;
      while (pos < input.length && /\d|\./.test(input[pos])) {
        num += input[pos++];
      }
      tokens.push({ type: 'number', value: parseFloat(num), start });
      continue;
    }

    if (/[a-zA-Z_]/.test(char)) {
      let id = '';
      const start = pos;
      while (pos < input.length && /[a-zA-Z0-9_]/.test(input[pos])) {
        id += input[pos++];
      }
      tokens.push({ type: 'identifier', value: id, start });
      continue;
    }

    // Operators...
    tokens.push({ type: char, value: char, start: pos++ });
  }

  return tokens;
}

// Parser
class Parser {
  private tokens: Token[];
  private pos: number = 0;

  parse(input: string): Expr {
    this.tokens = tokenize(input);
    this.pos = 0;
    return this.expression();
  }

  private expression(): Expr {
    return this.additive();
  }

  private additive(): Expr {
    let left = this.multiplicative();

    while (this.peek()?.type === '+' || this.peek()?.type === '-') {
      const op = this.advance();
      const right = this.multiplicative();
      left = { kind: 'binary', op: op.type, left, right };
    }

    return left;
  }

  private multiplicative(): Expr {
    let left = this.primary();

    while (this.peek()?.type === '*' || this.peek()?.type === '/') {
      const op = this.advance();
      const right = this.primary();
      left = { kind: 'binary', op: op.type, left, right };
    }

    return left;
  }

  private primary(): Expr {
    const token = this.advance();

    if (token.type === 'number') {
      return { kind: 'literal', value: token.value };
    }

    if (token.type === 'identifier') {
      return { kind: 'identifier', name: token.value };
    }

    if (token.type === '(') {
      const expr = this.expression();
      this.expect(')');
      return expr;
    }

    throw new Error(`Unexpected token: ${token.type}`);
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: string): Token {
    const token = this.advance();
    if (token.type !== type) {
      throw new Error(`Expected '${type}', got '${token.type}'`);
    }
    return token;
  }
}
```

This minimal example is ~100 LOC and handles literals, identifiers, binary operators, and parentheses. Full implementation will be ~400 LOC with all operators, functions, error recovery.

---

## Related Documents

- `src/expr/GRAMMAR.md` - Grammar specification
- `.agent_planning/expression-dsl/TYPE-RULES.md` - Type inference rules
- `.agent_planning/expression-dsl/ERRORS.md` - Error handling strategy
- `SPRINT-20260120-110200-core-impl-PLAN.md` - Core implementation plan

---

## Version History

- **2026-01-20**: Initial decision (v1.0)
  - Evaluated 3 approaches
  - Chose hand-written recursive descent
  - Rationale: bundle size, error control, simplicity
