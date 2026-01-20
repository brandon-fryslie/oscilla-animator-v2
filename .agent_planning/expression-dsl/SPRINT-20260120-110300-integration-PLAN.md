# Sprint: Integration - Expression Block and UI

Generated: 2026-01-20 11:03:00
Confidence: HIGH (after core implementation completes)
Status: BLOCKED (depends on core-impl sprint)
Source: EVALUATION-20260120-110100.md

## Sprint Goal

Create the user-facing Expression block that integrates the DSL compiler with the block system and UI. Artists can now type expressions directly into blocks.

## Scope

**Deliverables:**
- Expression block implementation
- Expression input UI component
- Integration with block registry
- End-to-end tests
- User documentation

**Out of Scope:**
- Advanced UI (autocomplete, syntax highlighting) - future enhancement
- Vec2/color expressions - deferred
- Custom functions - deferred

## Prerequisites

**MUST complete core implementation sprint first:**
- ✅ compileExpression() API exists and works
- ✅ All unit tests pass
- ✅ Documentation complete

## Work Items

### P0: Expression Block Implementation

**Dependencies:** compileExpression API (from core-impl sprint)
**Spec Reference:** ESSENTIAL-SPEC.md Block System • **Status Reference:** EVALUATION-20260120-110100.md "Integration Points #1"

#### Description

Implement the Expression block that artists use. This block:
- Has a text input for the expression string
- Has dynamic inputs based on identifiers in the expression
- Compiles expression to IR during lowering
- Produces a signal output

The Expression block is just a thin wrapper around `compileExpression()`.

#### Acceptance Criteria

- [ ] Create `src/blocks/expression-block.ts`
- [ ] Register block with type `'Expression'`, category `'signal'`
- [ ] Block has expression string as config parameter (not a port)
- [ ] Block has dynamic inputs based on parsed identifiers
- [ ] Block output type matches expression result type
- [ ] Lower function calls `compileExpression()` and returns SigExprId
- [ ] Handle compilation errors gracefully (convert to CompileError)
- [ ] Include 10+ tests for block lowering
- [ ] Test error cases (syntax error, type error, etc.)

#### Technical Notes

Block definition structure:
```typescript
registerBlock({
  type: 'Expression',
  label: 'Expression',
  category: 'signal',
  description: 'Evaluate mathematical expression',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    // Dynamic inputs based on expression
    // For expression "sin(phase * 2)", this would be:
    // phase: { type: signalType('phase'), exposedAsPort: true }
  },
  outputs: {
    out: { type: signalType('???') }  // Polymorphic, resolved from expression
  },
  lower: ({ ctx, inputsById, config }) => {
    const exprString = config?.expression as string;
    if (!exprString) {
      throw new Error('Expression block requires expression string');
    }

    // Get input types from connected ports
    const inputTypes = new Map<string, SignalType>();
    for (const [name, port] of Object.entries(ctx.inputsById)) {
      inputTypes.set(name, port.type);
    }

    // Compile expression
    const result = compileExpression(exprString, inputTypes, ctx.b);
    if (!result.ok) {
      throw result.error;  // Convert to CompileError
    }

    const sigId = result.value;
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot }
      }
    };
  }
});
```

**Challenge: Dynamic Inputs**

The block inputs depend on the expression string. Options:

**Option A: Pre-parse for inputs (recommended)**
- Parse expression before lowering to determine required inputs
- Register inputs dynamically in block definition
- Complexity: Moderate

**Option B: Require explicit input declaration**
- User declares inputs separately from expression
- Expression uses declared inputs
- Complexity: Low, but less intuitive UX

**Recommendation:** Start with Option B (explicit inputs), add Option A in future enhancement.

---

### P0: Expression Input UI Component

**Dependencies:** Expression block
**Spec Reference:** N/A • **Status Reference:** EVALUATION-20260120-110100.md "Gaps Summary"

#### Description

Create UI component for editing expression strings in the block inspector. Should be a text input with validation feedback.

For v1, keep it simple:
- Multiline text input
- Shows compilation errors inline
- No autocomplete (future enhancement)

#### Acceptance Criteria

- [ ] Create `src/ui/components/params/ExpressionInput.tsx`
- [ ] Component accepts: value (string), onChange, inputTypes
- [ ] Shows multiline text input
- [ ] Validates expression on change
- [ ] Displays syntax/type errors inline with position
- [ ] Errors show helpful message and suggestion
- [ ] Integration test with Block Inspector
- [ ] Styling matches existing param controls

#### Technical Notes

Component structure:
```typescript
interface ExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  inputTypes: Map<string, SignalType>;  // Available inputs
}

export function ExpressionInput({ value, onChange, inputTypes }: ExpressionInputProps) {
  const [error, setError] = useState<string | null>(null);

  const handleChange = (newValue: string) => {
    onChange(newValue);

    // Validate expression
    const builder = new MockIRBuilder();  // For validation only
    const result = compileExpression(newValue, inputTypes, builder);

    if (!result.ok) {
      setError(result.error.message);
    } else {
      setError(null);
    }
  };

  return (
    <Box>
      <TextField
        multiline
        rows={3}
        value={value}
        onChange={e => handleChange(e.target.value)}
        error={!!error}
        helperText={error}
        fullWidth
      />
    </Box>
  );
}
```

**Note:** Validation uses a mock IRBuilder since we're not actually compiling, just checking syntax/types.

---

### P0: End-to-End Integration Tests

**Dependencies:** Expression block, UI component
**Spec Reference:** N/A • **Status Reference:** EVALUATION-20260120-110100.md "Gaps Summary"

#### Description

Create comprehensive integration tests that exercise the full stack: UI → block → DSL → IR → runtime.

Tests should verify:
- Expression block integrates with graph
- Expressions compile to correct IR
- Runtime executes expression correctly
- Errors propagate to UI

#### Acceptance Criteria

- [ ] Create `src/blocks/__tests__/expression-integration.test.ts`
- [ ] Test: Create Expression block, compile patch, verify IR
- [ ] Test: Expression with single input (e.g., "phase * 2")
- [ ] Test: Expression with multiple inputs (e.g., "a + b")
- [ ] Test: Expression with function call (e.g., "sin(phase)")
- [ ] Test: Expression with ternary (e.g., "x > 0 ? 1 : -1")
- [ ] Test: Syntax error produces CompileError
- [ ] Test: Type error produces CompileError
- [ ] Test: Runtime execution produces correct values
- [ ] All tests pass

#### Technical Notes

Example integration test:
```typescript
test('expression block compiles and executes', () => {
  // Create patch with Expression block
  const patch = createPatch();
  const exprBlock = addBlock(patch, {
    type: 'Expression',
    config: { expression: 'sin(phase * 2)' },
    inputs: {
      phase: { type: signalType('phase') }
    }
  });

  // Connect phase input
  const phaseSource = addBlock(patch, { type: 'PhaseA' });
  addEdge(patch, phaseSource.outputs.out, exprBlock.inputs.phase);

  // Compile patch
  const compiled = compilePatch(patch);
  expect(compiled.ok).toBe(true);

  // Verify IR structure
  const ir = compiled.value;
  expect(ir.signalExprs).toContainEqual(
    expect.objectContaining({
      kind: 'zip',
      fn: expect.objectContaining({ op: OpCode.Sin })
    })
  );

  // Execute runtime
  const runtime = createRuntime(ir);
  runtime.tick(0);

  // Verify output value
  const outputSlot = exprBlock.outputs.out.slot;
  const value = runtime.readSlot(outputSlot);
  expect(value).toBeCloseTo(0);  // sin(0 * 2) = 0
});
```

---

### P1: User Documentation

**Dependencies:** All implementation complete
**Spec Reference:** N/A • **Status Reference:** EVALUATION-20260120-110100.md "Gaps Summary"

#### Description

Create user-facing documentation explaining how to use the Expression block. This is for artists, not developers.

Documentation should cover:
- What is the Expression block?
- How to use it
- Expression syntax (simplified)
- Available functions
- Common examples
- Troubleshooting errors

#### Acceptance Criteria

- [ ] Create `docs/user/expression-block.md` or integrate into existing docs
- [ ] Explain what Expression block does (simple math in text)
- [ ] Provide syntax quick reference (operators, functions)
- [ ] Include 10+ examples (simple to complex)
- [ ] Explain common errors and how to fix
- [ ] Include screenshots of Expression block in use
- [ ] Link to full grammar/function docs for advanced users

#### Technical Notes

Documentation structure:

**1. Overview:**
- "Type math expressions directly instead of wiring blocks"
- Use cases: Simple calculations, quick prototyping

**2. Quick Start:**
- Example: "Create Expression block, type `phase * 2`, connect phase input"

**3. Syntax:**
- Arithmetic: +, -, *, /, %
- Comparison: <, >, <=, >=, ==, !=
- Logic: &&, ||, !
- Ternary: cond ? a : b
- Functions: sin, cos, mix, etc.

**4. Examples:**
- `phase * 2` - Double phase
- `sin(phase) * radius` - Oscillating radius
- `x > 0.5 ? 1 : 0` - Threshold
- `mix(a, b, phase)` - Blend values

**5. Troubleshooting:**
- "Syntax error: ..." → Fix syntax
- "Type error: ..." → Check types
- "Undefined input 'x'" → Connect x input

---

### P2: Block Library Integration

**Dependencies:** Expression block
**Spec Reference:** N/A • **Status Reference:** EVALUATION-20260120-110100.md "Integration Points"

#### Description

Ensure Expression block appears in block library UI and can be instantiated by users. Verify it integrates with existing block picker/palette.

#### Acceptance Criteria

- [ ] Expression block appears in block library under 'signal' category
- [ ] Block can be added to patch via UI
- [ ] Block inspector shows expression input
- [ ] Block inspector shows dynamic inputs
- [ ] Block can be wired to other blocks
- [ ] Expression compilation errors appear in diagnostics panel
- [ ] Manual testing: Create patch with Expression block, verify it works

#### Technical Notes

This is mostly verification, not new code. The expression block should "just work" with existing UI infrastructure.

Test checklist:
- [ ] Open block library, find Expression under signal category
- [ ] Drag Expression block onto canvas
- [ ] Select block, see expression input in inspector
- [ ] Type expression, see inputs appear/update
- [ ] Connect inputs, verify compilation succeeds
- [ ] Type invalid expression, see error in diagnostics
- [ ] Run patch, verify expression executes correctly

---

## Dependencies

**External:**
- None

**Internal:**
- Core implementation sprint MUST complete first
- compileExpression API (from src/expr)
- Block registry (exists)
- UI param controls (exists)
- Block inspector (exists)

## Risks

1. **Dynamic inputs UX is confusing** → Mitigation: Start with explicit inputs, iterate based on feedback
2. **Expression errors hard to understand** → Mitigation: Invest in good error messages (done in research sprint)
3. **UI validation performance** → Mitigation: Debounce validation, use mock builder

## Success Criteria

This sprint is complete when:
1. Expression block implemented and registered
2. Expression input UI functional
3. Integration tests pass
4. User documentation written
5. Block appears in library and works in UI
6. Artists can use Expression block to create patches
7. End-to-end: Type expression → compiles → executes → produces correct output
