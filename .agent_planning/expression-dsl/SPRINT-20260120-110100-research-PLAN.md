# Sprint: Research - Expression DSL Design Decisions

Generated: 2026-01-20 11:01:00
Confidence: MEDIUM
Status: RESEARCH REQUIRED
Source: EVALUATION-20260120-110100.md

## Sprint Goal

Resolve design unknowns about parser implementation, type inference strategy, and error handling to raise confidence to HIGH for core implementation sprint.

## Scope

**Deliverables:**
- Parser implementation approach decision (with rationale)
- Type inference rules specification
- Error handling strategy specification
- Grammar specification document
- Dependency decision (library vs hand-written)

**Out of Scope:**
- Actual implementation (deferred to core-implementation sprint)
- UI integration (deferred to integration sprint)

## Work Items

### P0: Parser Implementation Approach Decision

**Dependencies:** None
**Spec Reference:** ESSENTIAL-SPEC.md (I6, I19, I20) • **Status Reference:** EVALUATION-20260120-110100.md "Known Unknowns #1"

#### Description

Decide on the parser implementation approach. The DSL needs a parser that converts expression strings like `"sin(phase * 2) + 0.5"` into an AST. Three main approaches:

1. **Hand-written recursive descent parser** - Maximum control, no dependencies, ~300-500 LOC
2. **Parser combinator library** (e.g., Parsimmon) - Clean code, small dependency, ~200-300 LOC
3. **Generated parser** (e.g., PEG.js) - Declarative grammar, build step complexity

Must evaluate:
- Bundle size impact (critical for web app)
- Code complexity and maintainability
- Error recovery capabilities
- Type safety (TypeScript integration)

#### Acceptance Criteria

- [ ] Document pros/cons of each approach with specific metrics (bundle size, LOC, complexity)
- [ ] Prototype minimal parser with each approach (literal + binary op only)
- [ ] Measure bundle size impact of any library dependencies
- [ ] Document chosen approach with rationale in `expression-dsl/DECISIONS.md`
- [ ] Verify chosen approach can produce good error messages for common mistakes

#### Technical Notes

The grammar is intentionally simple:
```
expr     := ternary
ternary  := logical ("?" expr ":" expr)?
logical  := compare (("&&" | "||") compare)*
compare  := add (("<" | ">" | "<=" | ">=" | "==" | "!=") add)*
add      := mul (("+" | "-") mul)*
mul      := unary (("*" | "/" | "%") unary)*
unary    := ("!" | "-") unary | call
call     := primary ("(" (expr ("," expr)*)? ")")?
primary  := number | identifier | "(" expr ")"
```

Consider: Can we hand-write this in ~300 LOC with good error recovery? Or does a library give us error recovery for free?

#### Unknowns to Resolve

1. Bundle size impact of parser libraries - what's the cost?
2. Type safety with each approach - how well does it integrate with TypeScript?
3. Error recovery - which approach gives the best user feedback?

#### Exit Criteria (to reach next confidence level)

- [ ] Parser approach chosen and documented
- [ ] Prototype validates approach works for our grammar
- [ ] No blocking concerns about bundle size, complexity, or error handling

---

### P0: Type Inference Strategy Specification

**Dependencies:** None
**Spec Reference:** ESSENTIAL-SPEC.md Type System • **Status Reference:** EVALUATION-20260120-110100.md "Known Unknowns #3"

#### Description

Define precise type inference rules for the expression DSL. The type checker must:
- Infer types bottom-up from literals and inputs
- Handle polymorphic literals (e.g., `0` could be int, float, phase, or unit)
- Validate type compatibility for operations
- Produce actionable type errors

Key questions:
- Do we require explicit input types or infer from connections?
- How do we handle polymorphic literals (`0`, `1`, `true`)?
- What coercions are allowed (int→float, float→phase, etc.)?
- How do we type ternary operator (`cond ? a : b`)?

#### Acceptance Criteria

- [ ] Document type inference rules in `expression-dsl/TYPE-RULES.md`
- [ ] Specify handling for each PayloadType (float, int, bool, phase, unit, vec2, color)
- [ ] Define allowed type coercions with rationale
- [ ] Specify polymorphic literal resolution strategy
- [ ] Document type checking algorithm (unification-based or constraint-based)
- [ ] Provide 10+ example expressions with expected types or type errors

#### Technical Notes

Existing system types (from ESSENTIAL-SPEC.md):
- PayloadType: `'float' | 'int' | 'bool' | 'phase' | 'unit' | 'vec2' | 'color'`
- SignalType: `{ payload: PayloadType; extent: Extent }`

For v1, focus on scalar types (float, int, bool, phase, unit). Defer vec2/color to future.

Type checking must happen at block lowering time, using input port types from the graph.

#### Unknowns to Resolve

1. Polymorphic literal strategy - explicit annotation or infer from context?
2. Coercion rules - which type conversions are safe and useful?
3. Type error messages - how do we explain type mismatches clearly?

#### Exit Criteria (to reach next confidence level)

- [ ] Type rules documented and unambiguous
- [ ] No open questions about type checking behavior
- [ ] Examples validate rules cover common use cases

---

### P0: Error Handling Strategy Specification

**Dependencies:** None
**Spec Reference:** ESSENTIAL-SPEC.md I19 (Error taxonomy) • **Status Reference:** EVALUATION-20260120-110100.md "Known Unknowns #2"

#### Description

Define how expression compilation errors are reported to users. The DSL must provide excellent error messages because artists will use it frequently.

Error categories:
1. **Syntax errors** - malformed expressions
2. **Type errors** - type mismatches
3. **Undefined identifier** - reference to unknown input
4. **Undefined function** - call to unknown function
5. **Arity mismatch** - wrong number of arguments

Must decide:
- Fail-fast or collect multiple errors?
- Error recovery for partial compilation?
- Error message format (position, snippet, suggestion)?
- Integration with existing diagnostic system?

#### Acceptance Criteria

- [ ] Document error taxonomy in `expression-dsl/ERRORS.md`
- [ ] Define error message format with position information
- [ ] Specify error recovery strategy (fail-fast vs multi-error)
- [ ] Provide examples of each error category with good/bad messages
- [ ] Verify error format integrates with existing CompileError type
- [ ] Document how errors appear in UI (inline vs panel)

#### Technical Notes

Existing error infrastructure (from compiler/types.ts):
```typescript
interface CompileError {
  code: CompileErrorCode | string;
  message: string;
  where?: { blockId?: string; port?: string; edgeId?: string };
  details?: Record<string, unknown>;
}
```

Expression errors should use this format for consistency.

Consider: Should we show a preview of the compiled IR for valid subexpressions to help debugging?

#### Unknowns to Resolve

1. Error recovery - can we partially compile to help user debug?
2. UI integration - where/how do expression errors appear?
3. Error prioritization - which error to show first if multiple exist?

#### Exit Criteria (to reach next confidence level)

- [ ] Error handling strategy documented
- [ ] Error messages validated with example user scenarios
- [ ] Integration path with diagnostic system clear

---

### P1: Grammar Specification Document

**Dependencies:** Parser approach decision
**Spec Reference:** ESSENTIAL-SPEC.md I26 (Architecture Laws) • **Status Reference:** EVALUATION-20260120-110100.md "Gaps Summary"

#### Description

Create the canonical grammar specification document. This is the ONE SOURCE OF TRUTH for expression syntax. Grammar is frozen - changes require spec update.

Must document:
- Complete EBNF grammar
- Operator precedence table
- Supported functions and signatures
- Literal syntax
- Identifier rules
- Examples

#### Acceptance Criteria

- [ ] Create `src/expr/GRAMMAR.md` with complete EBNF notation
- [ ] Document operator precedence table (matches JavaScript/C)
- [ ] List all supported functions with signatures
- [ ] Provide 20+ example expressions with expected parses
- [ ] Include negative examples (invalid syntax)
- [ ] Mark grammar as FROZEN with change process

#### Technical Notes

Grammar should match user expectations from math/JavaScript:
- Standard operator precedence (PEMDAS)
- C-style operators (`==`, `!=`, `&&`, `||`, `!`, ternary)
- Function call syntax `fn(arg1, arg2, ...)`

Supported functions (initial set):
- Math: `sin`, `cos`, `tan`, `abs`, `sqrt`, `floor`, `ceil`, `round`, `min`, `max`
- Interpolation: `mix`, `lerp`, `smoothstep`, `clamp`
- Phase: `wrap`, `fract`

#### Unknowns to Resolve

None - grammar is specified by user requirements

#### Exit Criteria (to reach next confidence level)

- [ ] Grammar document complete and reviewed
- [ ] Examples validate grammar covers requirements
- [ ] No ambiguities in grammar rules

---

### P2: Built-in Functions Catalog

**Dependencies:** Grammar specification
**Spec Reference:** N/A • **Status Reference:** EVALUATION-20260120-110100.md "Integration Points"

#### Description

Catalog all built-in functions the DSL will support. Each function needs:
- Name
- Signature (arg types → result type)
- Semantic description
- IR lowering strategy (which OpCode or IRBuilder method)

This catalog feeds into both type checker and IR compiler.

#### Acceptance Criteria

- [ ] Create `src/expr/FUNCTIONS.md` with function catalog
- [ ] Document each function: name, signature, description, IR mapping
- [ ] Verify all functions map to existing OpCodes or IRBuilder methods
- [ ] Group functions by category (math, interpolation, etc.)
- [ ] Identify any functions that need new OpCodes (flag for future work)

#### Technical Notes

Most functions should map directly to existing OpCodes (from compiler/ir/types.ts):
- `sin` → `OpCode.Sin`
- `cos` → `OpCode.Cos`
- `+` → `OpCode.Add`
- etc.

For functions not in OpCode, check if IRBuilder has a method (e.g., `mix` might be `(1-t)*a + t*b`).

#### Unknowns to Resolve

None - functions are standard math operations

#### Exit Criteria (to reach next confidence level)

- [ ] Function catalog complete
- [ ] All functions verified to have IR mapping
- [ ] No missing OpCodes or IRBuilder capabilities

---

## Dependencies

**None** - This is a research sprint with no implementation dependencies.

## Risks

1. **Parser library adds significant bundle size** → Mitigation: Measure before committing, consider hand-written if >10KB
2. **Type inference rules too complex** → Mitigation: Start simple (explicit types), iterate
3. **Error messages unclear to artists** → Mitigation: User testing with example errors

## Success Criteria

This sprint is complete when:
1. Parser approach chosen and prototyped
2. Type inference rules documented unambiguously
3. Error handling strategy specified
4. Grammar documented and frozen
5. Function catalog complete
6. All unknowns resolved → Core implementation sprint can proceed at HIGH confidence
