# Sprint: unified-varargs - Expression Block Unified Varargs System

Generated: 2026-01-26
Confidence: HIGH: 5, MEDIUM: 1, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Migrate Expression block to unified varargs system where ALL inputs (legacy in0/in1 AND new refs) flow through a single code path, remove obsolete ports in2-in4, and add visual distinction for varargs ports.

## User Requirements (CRITICAL)

1. **Remove in2, in3, in4 ports** - keep in0, in1 as legacy
2. **Add varargs 'refs' input** - new system for block references
3. **HIGHEST PRIORITY**: Migrate in0/in1 onto the NEW system - ONE system, ALL inputs go through it
4. **Update lowering logic** to use canonical addressing
5. **Visually distinguish** new port from old ports (highlight color)

## Core Principle

**SINGLE SOURCE OF TRUTH**: The varargs system becomes the unified input processing path. Legacy inputs (in0/in1) are preserved for backward compatibility but internally processed the same way as varargs refs.

## Scope

**Deliverables:**
1. Expression block port cleanup (remove in2-in4, add refs vararg)
2. Unified lowering - ALL inputs processed through single varargs-style path
3. BlockRefs context wiring through compiler to Expression block
4. UI visual distinction for varargs ports
5. Tests demonstrating unified system

## Work Items

### P0 (Critical) Remove Obsolete Ports [HIGH]

**Description**: Remove in2, in3, in4 from Expression block definition, keeping only in0 and in1 as legacy inputs.

**Acceptance Criteria:**
- [ ] in2, in3, in4 removed from Expression block inputs definition
- [ ] in0, in1 remain with `optional: true`
- [ ] Expression block registers without error
- [ ] Existing tests that only use in0/in1 continue to pass
- [ ] Tests that used in2-in4 removed or updated

**Technical Notes:**
```typescript
// Expression block inputs - AFTER
inputs: {
  in0: { label: 'In 0', type: canonicalType('float'), optional: true, exposedAsPort: true },
  in1: { label: 'In 1', type: canonicalType('float'), optional: true, exposedAsPort: true },
  refs: { /* new vararg port - see P1 */ },
  expression: { /* config parameter unchanged */ },
},
```

**Files:**
- `src/blocks/expression-blocks.ts` (remove in2-in4 definitions)
- `src/blocks/__tests__/expression-blocks.test.ts` (update tests)

---

### P0 (Critical) Add Varargs 'refs' Input [HIGH]

**Description**: Add the varargs input port for block references using the existing varargs infrastructure.

**Acceptance Criteria:**
- [ ] 'refs' input added with `isVararg: true`
- [ ] varargConstraint specifies `payloadType: 'float'`, `cardinalityConstraint: 'any'`
- [ ] Port has `exposedAsPort: true`
- [ ] Block registration validates varargs constraint
- [ ] Port visible in UI (with distinct styling - see P3)

**Technical Notes:**
```typescript
refs: {
  label: 'Block Refs',
  type: canonicalType('float'),  // Base type for validation
  optional: true,
  exposedAsPort: true,
  isVararg: true,
  varargConstraint: {
    payloadType: 'float',
    cardinalityConstraint: 'any',  // Accept Signal or Field
  },
},
```

**Files:**
- `src/blocks/expression-blocks.ts` (add refs port)

---

### P0 (Critical) Unified Lowering - Single Code Path [HIGH]

**HIGHEST PRIORITY** - This is the core architectural change.

**Description**: Rewrite Expression block lowering so ALL inputs (legacy in0/in1 AND varargs refs) flow through a unified processing path. The varargs system IS the system - legacy inputs are convenience aliases.

**Acceptance Criteria:**
- [ ] Single function processes all input types
- [ ] in0/in1 mapped to shorthand names internally (e.g., "in0" → signal)
- [ ] refs varargs processed with canonical addresses as keys
- [ ] Both input types produce unified `Map<string, SigExprId>` for DSL
- [ ] compileExpression receives unified signals map
- [ ] Legacy expressions using "in0" continue to work
- [ ] New expressions using "BlockName.portName" work via refs

**Technical Notes:**

```typescript
lower: ({ ctx, inputsById, varargInputsById, config }) => {
  const exprText = (config?.expression as string | undefined) ?? '';
  if (exprText.trim() === '') {
    return { outSignals: { out: ctx.b.const(ctx.b.floatType(), 0) } };
  }

  // UNIFIED INPUT PROCESSING
  const inputSignals = new Map<string, SigExprId>();
  const inputTypes = new Map<string, CanonicalType>();

  // Step 1: Process legacy inputs (in0, in1) - same as varargs internally
  for (const key of ['in0', 'in1'] as const) {
    const input = inputsById[key];
    if (input && input.k === 'sig') {
      inputSignals.set(key, input.id as SigExprId);
      inputTypes.set(key, getSigType(input.id as SigExprId));
    }
  }

  // Step 2: Process varargs refs - canonical addresses as keys
  const refsVararg = varargInputsById?.refs;
  const refsConnections = ctx.varargConnections?.get('refs');
  if (refsVararg && refsConnections) {
    for (let i = 0; i < refsVararg.length; i++) {
      const value = refsVararg[i];
      const conn = refsConnections[i];
      if (value.k === 'sig' && conn) {
        // Use alias (shorthand) or sourceAddress as the identifier
        const identifier = conn.alias ?? conn.sourceAddress;
        inputSignals.set(identifier, value.id as SigExprId);
        inputTypes.set(identifier, getSigType(value.id as SigExprId));
      }
    }
  }

  // Step 3: Compile expression with unified inputs
  const result = compileExpression(exprText, inputTypes, ctx.b, inputSignals);
  // ... handle result
};
```

**Files:**
- `src/blocks/expression-blocks.ts` (rewrite lowering)
- `src/blocks/registry.ts` (ensure LowerCtx has varargConnections)

---

### P1 (High) Wire BlockRefs Context Through Compiler [HIGH]

**Description**: Ensure the block lowering context provides varargConnections metadata so Expression block can map aliases to signals.

**Acceptance Criteria:**
- [ ] LowerCtx interface has `varargConnections?: Map<string, readonly VarargConnection[]>`
- [ ] Block lowering pass (pass6) populates varargConnections from patch
- [ ] VarargConnection includes alias and sourceAddress
- [ ] Expression block can access connection metadata during lowering

**Technical Notes:**
- LowerCtx already defined in registry.ts
- Need to pass varargConnections from patch through compile pipeline
- pass6-block-lowering.ts builds LowerArgs, must include this

**Files:**
- `src/blocks/registry.ts` (verify/update LowerCtx)
- `src/compiler/passes-v2/pass6-block-lowering.ts` (populate varargConnections)
- `src/compiler/compile.ts` (thread varargConnections through)

---

### P2 (Medium) Expression DSL BlockRefs Integration [MEDIUM]

**Description**: Update compileExpression to optionally accept and use blockRefs context for member access expressions (Block.port syntax).

**Acceptance Criteria:**
- [ ] compileExpression signature accepts optional blockRefs parameter
- [ ] blockRefs passed to type checker context
- [ ] blockRefs passed to compile context
- [ ] Member access expressions (Block.port) resolve via blockRefs
- [ ] Tests verify member access compilation

**Technical Notes:**
```typescript
// src/expr/index.ts
export function compileExpression(
  source: string,
  inputs: Map<string, CanonicalType>,
  builder: IRBuilder,
  inputSignals: Map<string, SigExprId>,
  blockRefs?: BlockReferenceContext,  // NEW optional parameter
): ExpressionResult { /* ... */ }
```

**Unknowns to Resolve:**
- How to provide AddressRegistry to Expression block during lowering?
- Does pass6 already have access to normalized patch for registry building?

**Exit Criteria:**
- Expression like `Circle.radius * 2` compiles when Circle.radius is in refs vararg

**Files:**
- `src/expr/index.ts` (add blockRefs parameter)
- `src/expr/typecheck.ts` (receive blockRefs in context)
- `src/expr/compile.ts` (receive blockRefs in context)

---

### P3 (High) UI Visual Distinction for Varargs Ports [HIGH]

**Description**: Add visual styling to distinguish varargs ports from regular ports in the graph editor.

**Acceptance Criteria:**
- [ ] Theme color defined for varargs ports (e.g., purple `#9d4edd`)
- [ ] Varargs ports render with distinct border/background color
- [ ] Clear visual difference between in0/in1 (regular) and refs (varargs)
- [ ] No functional change to port interaction

**Technical Notes:**
```typescript
// src/ui/theme.ts
export const colors = {
  // ... existing colors
  varargPort: '#9d4edd',  // Purple - distinct from primary teal
};

// In port rendering, check if port.isVararg and apply style
```

**Files:**
- `src/ui/theme.ts` (add varargPort color)
- `src/ui/reactFlowEditor/CustomNode.tsx` or port rendering component (apply style)

---

### P4 (High) Integration Tests [HIGH]

**Description**: Comprehensive tests verifying the unified system works end-to-end.

**Acceptance Criteria:**
- [ ] Test: Legacy expression using in0 compiles and runs
- [ ] Test: Legacy expression using in0 + in1 compiles and runs
- [ ] Test: Expression with refs vararg compiles and runs
- [ ] Test: Mixed usage (in0 + refs) compiles and runs
- [ ] Test: Member access syntax (Block.port) works with refs
- [ ] Test: Error for unconnected reference in expression
- [ ] All existing expression tests pass

**Files:**
- `src/blocks/__tests__/expression-blocks.test.ts`
- `src/blocks/__tests__/expression-varargs-integration.test.ts` (new)

## Dependencies

- Canonical addressing system (Sprint 1) - ✅ COMPLETED
- Varargs infrastructure in Patch/Registry - ✅ COMPLETED
- Expression DSL member access AST - ✅ COMPLETED

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking existing patches using in2-in4 | Document migration, provide clear error messages |
| Compiler context threading complexity | Incremental approach - wire varargConnections first |
| UI rendering changes scope creep | Keep styling minimal - color only, no layout changes |

## Exit Criteria

This sprint is complete when:
1. Expression block has only in0, in1 (legacy) and refs (varargs) ports
2. ALL inputs flow through unified processing in lowering
3. Legacy expressions continue to work unchanged
4. New block reference syntax works via refs vararg
5. Varargs ports visually distinct in UI
6. All tests pass
7. No regressions in existing functionality
