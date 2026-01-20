# Expression DSL Error Handling Strategy

**Status:** APPROVED
**Last Updated:** 2026-01-20
**Sprint:** Research (Sprint 1)

## Overview

This document specifies how expression compilation errors are reported. The DSL must provide **excellent error messages** because artists will use expressions frequently. Poor errors lead to frustration and lost productivity.

## Design Principles

1. **Actionable**: Error messages explain what's wrong and suggest how to fix it
2. **Precise**: Include position information (line, column, or character offset)
3. **Contextual**: Show relevant code snippet when helpful
4. **Consistent**: Use same format across all error types
5. **User-Focused**: Written for artists, not compiler engineers

## Error Taxonomy

### 1. Syntax Errors

**When:** Parser encounters malformed expression

**Cause:** Grammar violation (missing operand, unclosed paren, invalid token)

**Examples:**

```
Input: "sin(phase * "
Error: Syntax error at position 12: Expected expression after '*'

Input: "phase +"
Error: Syntax error at position 7: Expected expression after '+'

Input: "sin("
Error: Syntax error at position 4: Expected expression, got end of input

Input: "42 @ 3"
Error: Syntax error at position 3: Unexpected character '@'
```

**Error Structure:**

```typescript
interface SyntaxError {
  code: 'ExprSyntaxError';
  message: string;          // "Expected expression after '*'"
  position: Position;       // { start: 12, end: 13 }
  expected?: string[];      // ["expression", "number", "identifier"]
  got?: string;             // "end of input"
}
```

---

### 2. Type Errors

**When:** Type checker finds incompatible types

**Cause:** Operation applied to wrong types, type mismatch, coercion not allowed

**Examples:**

```
Input: "phase + phase"
Error: Type error at position 6 ('+' operator):
  Cannot add phase + phase.
  Suggestion: Use 'phase + float' for offset, or 'wrap(phase + offset)' to wrap.

Input: "x && y" (where x, y are float)
Error: Type error at position 2 ('&&' operator):
  Logical AND requires bool operands, got float && float.
  Suggestion: Did you mean 'x > 0 && y > 0'?

Input: "sin(true)"
Error: Type error at position 0 (function 'sin'):
  Function 'sin' expects numeric type (float, int, or phase), got bool.

Input: "x > 0 ? 1 : true" (ternary)
Error: Type error at position 6 ('? :' operator):
  Ternary branches have incompatible types: int and bool.
  Both branches must have the same type or compatible types.
```

**Error Structure:**

```typescript
interface TypeError {
  code: 'ExprTypeError';
  message: string;          // "Cannot add phase + phase"
  position: Position;       // { start: 6, end: 7 }
  expected?: PayloadType[]; // ['bool']
  got?: PayloadType;        // 'float'
  suggestion?: string;      // "Did you mean 'x > 0 && y > 0'?"
  context?: string;         // Additional explanation
}
```

---

### 3. Undefined Identifier

**When:** Expression references unknown input

**Cause:** Identifier not in input types map

**Examples:**

```
Input: "sin(unknown * 2)" (inputs: phase, radius)
Error: Undefined input 'unknown' at position 4.
  Available inputs: phase, radius
  Suggestion: Did you mean 'phase'?

Input: "phas" (inputs: phase)
Error: Undefined input 'phas' at position 0.
  Available inputs: phase
  Suggestion: Did you mean 'phase'?
```

**Error Structure:**

```typescript
interface UndefinedIdError {
  code: 'ExprUndefinedId';
  message: string;          // "Undefined input 'unknown'"
  position: Position;       // { start: 4, end: 11 }
  identifier: string;       // "unknown"
  available: string[];      // ["phase", "radius"]
  suggestion?: string;      // "Did you mean 'phase'?"
}
```

**Suggestion Heuristic:** Use Levenshtein distance to find closest match:
- Distance 1-2: "Did you mean 'X'?"
- Distance > 2: No suggestion

---

### 4. Undefined Function

**When:** Expression calls unknown function

**Cause:** Function name not in built-in catalog

**Examples:**

```
Input: "foo(x)"
Error: Unknown function 'foo' at position 0.
  Available functions: sin, cos, tan, abs, sqrt, floor, ceil, round, min, max, lerp, mix, smoothstep, clamp, wrap, fract
  Suggestion: Did you mean 'floor'?

Input: "sine(phase)"
Error: Unknown function 'sine' at position 0.
  Suggestion: Did you mean 'sin'?
```

**Error Structure:**

```typescript
interface UndefinedFnError {
  code: 'ExprUndefinedFn';
  message: string;          // "Unknown function 'foo'"
  position: Position;       // { start: 0, end: 3 }
  function: string;         // "foo"
  available: string[];      // List of valid function names
  suggestion?: string;      // "Did you mean 'floor'?"
}
```

**Suggestion Heuristic:** Same as identifier (Levenshtein distance).

---

### 5. Arity Mismatch

**When:** Function called with wrong number of arguments

**Cause:** Argument count doesn't match function signature

**Examples:**

```
Input: "sin(x, y)"
Error: Arity error at position 0 (function 'sin'):
  Function 'sin' expects 1 argument, got 2.

Input: "min(x)"
Error: Arity error at position 0 (function 'min'):
  Function 'min' expects 2 arguments, got 1.

Input: "clamp(x, 0)"
Error: Arity error at position 0 (function 'clamp'):
  Function 'clamp' expects 3 arguments (x, min, max), got 2.
```

**Error Structure:**

```typescript
interface ArityError {
  code: 'ExprArityError';
  message: string;          // "Function 'sin' expects 1 argument, got 2"
  position: Position;       // { start: 0, end: 3 }
  function: string;         // "sin"
  expected: number;         // 1
  got: number;              // 2
  signature?: string;       // "sin(x: float) → float"
}
```

---

## Error Recovery Strategy

### Phase 1 (v1): Fail-Fast

**Strategy:** Report first error, stop compilation.

**Rationale:**
- Simpler implementation
- Clear mental model for users
- Type errors can cascade (fixing first may fix others)

**Behavior:**
1. Lexer encounters first error → report, stop
2. Parser encounters first error → report, stop
3. Type checker encounters first error → report, stop

**User Experience:**
- User fixes error
- Re-compiles expression
- Sees next error (if any)

**Pros:**
- Simple to implement
- No cascading errors
- Clear error focus

**Cons:**
- User must iterate to find all errors
- Slower workflow for multi-error cases

---

### Phase 2 (Future): Multi-Error Collection

**Strategy:** Collect multiple errors, report all at once.

**Rationale:**
- Better UX: see all problems at once
- Faster iteration: fix multiple issues in one pass

**Challenges:**
- Parser recovery: how to continue after syntax error?
- Cascading type errors: one type error can cause many downstream errors
- Error prioritization: which errors to show first?

**Implementation Plan:**
1. Lexer: collect all invalid tokens
2. Parser: insert error nodes, continue parsing
3. Type checker: mark error nodes as `unknown` type, continue checking

**Cascading Prevention:**
- Limit errors per category (e.g., max 5 type errors)
- Mark error nodes as `unknown` type (don't propagate bad types)
- Prioritize "root cause" errors over cascading errors

**Deferred to future** based on user feedback.

---

## Error Message Format

### Position Information

**Character Offsets** (not line/column, since expressions are single-line):

```typescript
interface Position {
  start: number;  // Character offset (0-indexed)
  end: number;    // Character offset after last char
}
```

**Example:**
```
Input: "sin(phase * )"
             ^
Position: { start: 12, end: 13 }
```

### Error Message Template

```
<ErrorType> at position <start> (<context>):
  <message>
  [Suggestion: <suggestion>]
  [Available: <options>]
```

**Example:**
```
Type error at position 6 ('+' operator):
  Cannot add phase + phase.
  Suggestion: Use 'phase + float' for offset.
```

---

## Integration with Existing Error System

### CompileError Format

From `src/compiler/types.ts`:

```typescript
interface CompileError {
  code: CompileErrorCode | string;
  message: string;
  where?: { blockId?: string; port?: string; edgeId?: string };
  details?: Record<string, unknown>;
}
```

### Conversion Function

```typescript
function toCompileError(
  err: ExpressionError,
  blockId: string
): CompileError {
  return {
    code: err.code,
    message: formatErrorMessage(err),
    where: {
      blockId,
      port: 'expression',  // Expression config parameter
    },
    details: {
      position: err.position,
      suggestion: err.suggestion,
      // ... other fields
    },
  };
}

function formatErrorMessage(err: ExpressionError): string {
  const pos = `position ${err.position.start}`;
  switch (err.code) {
    case 'ExprSyntaxError':
      return `Syntax error at ${pos}: ${err.message}`;
    case 'ExprTypeError':
      return `Type error at ${pos}: ${err.message}`;
    case 'ExprUndefinedId':
      return `Undefined input '${err.identifier}' at ${pos}. Available: ${err.available.join(', ')}`;
    case 'ExprUndefinedFn':
      return `Unknown function '${err.function}' at ${pos}.${err.suggestion ? ' ' + err.suggestion : ''}`;
    case 'ExprArityError':
      return `Function '${err.function}' expects ${err.expected} argument${err.expected === 1 ? '' : 's'}, got ${err.got}`;
  }
}
```

---

## UI Integration

### Where Errors Appear

**Option A: Inline in Inspector Panel**

When Expression block is selected:
- Inspector shows expression config field
- Error appears below expression text input
- Red border around text input

**Pros:** Immediate feedback at edit location

**Cons:** Space-constrained

---

**Option B: Diagnostics Panel**

Errors appear in DiagnosticConsole (existing system):
- Authoring stream for expression errors
- Click error to focus block
- Shows full error message with position

**Pros:** Consistent with other compile errors, more space

**Cons:** Not immediate (requires looking at panel)

---

**Option C: Both**

Inline: Show error icon + short message

Diagnostics Panel: Full error with suggestion

**Recommendation:** Option C for best UX.

---

### Visual Highlighting

In expression text input:
- Underline error span (red squiggle)
- Tooltip on hover shows full error message
- Position information enables precise highlighting

**Implementation:**
```tsx
<TextField
  value={expression}
  error={!!compileError}
  helperText={compileError?.message}
  // TODO: Add CodeMirror for syntax highlighting + error spans
/>
```

**Future:** Use CodeMirror or similar for rich text editing with inline error spans.

---

## Error Message Guidelines

### Writing Good Error Messages

**DO:**
- Use clear, simple language
- Explain what's wrong AND why
- Suggest a fix when obvious
- Include relevant context
- Be consistent across error types

**DON'T:**
- Use jargon ("unification failed", "AST malformed")
- Blame the user ("You used the wrong type")
- Be vague ("Something went wrong")
- Overexplain (keep it concise)

---

### Examples: Good vs Bad

**Good:**
```
Type error: Cannot add phase + phase.
Suggestion: Use 'phase + float' for offset.
```

**Bad:**
```
Type error: Operator '+' not defined for PayloadType::Phase × PayloadType::Phase.
```

---

**Good:**
```
Undefined input 'phas'. Did you mean 'phase'?
Available inputs: phase, radius
```

**Bad:**
```
Identifier 'phas' not found in environment.
```

---

**Good:**
```
Function 'sin' expects 1 argument, got 2.
Signature: sin(x: float) → float
```

**Bad:**
```
Arity mismatch: expected 1, got 2.
```

---

## Testing Strategy

### Unit Tests

For each error type:
1. Trigger error condition
2. Verify error code, message, position
3. Check suggestion correctness

### Test Cases

```typescript
describe('Error Handling', () => {
  it('reports syntax error for missing operand', () => {
    const result = compileExpression('phase +', {});
    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('ExprSyntaxError');
    expect(result.error.message).toContain('Expected expression');
    expect(result.error.position.start).toBe(7);
  });

  it('reports type error for phase + phase', () => {
    const result = compileExpression('phase + phase', { phase: 'phase' });
    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('ExprTypeError');
    expect(result.error.message).toContain('Cannot add phase + phase');
    expect(result.error.position.start).toBe(6); // '+' operator
  });

  it('suggests similar identifier', () => {
    const result = compileExpression('phas', { phase: 'phase' });
    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('ExprUndefinedId');
    expect(result.error.suggestion).toContain('Did you mean \'phase\'?');
  });

  it('reports arity error', () => {
    const result = compileExpression('sin(x, y)', { x: 'float', y: 'float' });
    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('ExprArityError');
    expect(result.error.expected).toBe(1);
    expect(result.error.got).toBe(2);
  });
});
```

### Integration Tests

Test error UI integration:
1. Create Expression block
2. Enter invalid expression
3. Verify error appears in inspector
4. Verify error appears in DiagnosticConsole
5. Verify red underline in text input

---

## Error Recovery (Future)

For v2, consider partial compilation:

**Scenario:** Expression has syntax error, but user wants to see partial result.

**Approach:**
1. Parse up to error point
2. Insert error placeholder node
3. Continue parsing after error
4. Type check valid portions
5. Compile valid portions, leave error nodes as NaN or 0

**Use Case:** User types `sin(phase * `, wants to see sine wave before completing expression.

**Implementation:**
- Error nodes have type `unknown`
- Compiler emits `sigConst(0)` or `sigConst(NaN)` for error nodes
- User sees partial result + error message

**Deferred to v2** based on user feedback.

---

## Related Documents

- `src/expr/GRAMMAR.md` - Grammar specification
- `.agent_planning/expression-dsl/TYPE-RULES.md` - Type inference rules
- `src/expr/FUNCTIONS.md` - Function catalog
- `src/compiler/types.ts` - CompileError type
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.md` - Diagnostics system

---

## Version History

- **2026-01-20**: Initial specification (v1.0)
  - Fail-fast error strategy
  - 5 error categories
  - Clear, actionable messages
  - Integration with CompileError system
