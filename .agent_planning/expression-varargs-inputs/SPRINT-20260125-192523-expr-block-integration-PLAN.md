# Sprint: expr-block-integration - Expression Block Varargs Integration

Generated: 2026-01-25-192523
Updated: 2026-01-26-023153
Confidence: HIGH: 3, MEDIUM: 1, LOW: 0
Status: BLOCKED (awaiting Sprint 2 & 3)
Source: EVALUATION-20260125-181203.md
Prerequisites:
  - SPRINT-20260125-192523-canonical-addressing-PLAN.md [COMPLETED]
  - SPRINT-20260125-192523-varargs-infra-PLAN.md [PENDING]
  - SPRINT-20260125-192523-expr-dsl-extension-PLAN.md [PENDING]

## Sprint Goal

Integrate the canonical addressing, varargs infrastructure, and expression DSL extension into the Expression block, enabling users to reference any float output from any block in the patch directly in expressions.

## Scope

**Deliverables:**
- Updated Expression block definition with varargs input
- Expression block lowering using varargs context
- End-to-end integration tests
- Documentation

## Background

This sprint connects the previous three sprints:
- Sprint 1: Canonical addressing system
- Sprint 2: Varargs input infrastructure
- Sprint 3: Expression DSL block reference syntax

The Expression block currently uses fixed inputs (in0-in4). After this sprint, it will also support varargs inputs that reference arbitrary block outputs.

## Work Items

### P0 (Critical) Expression Block Varargs Input Definition [HIGH]

**Dependencies**: VarargInputDef (Sprint 2)
**Spec Reference**: src/blocks/expression-blocks.ts (lines 29-99)
**Status Reference**: EVALUATION-20260125-181203.md - "Fixed inputs (in0-in4)"

#### Description

Add a varargs input to the Expression block definition. This input accepts references to any float output in the patch.

#### Acceptance Criteria

- [ ] Expression block has new `refs` input with `isVararg: true`
- [ ] Vararg constraint: `payloadType: 'float'`, `cardinalityConstraint: 'any'`
- [ ] Fixed inputs (in0-in4) continue to work (backward compatible)
- [ ] Block definition validates successfully
- [ ] Unit tests for Expression block definition

#### Technical Notes

Add to Expression block definition in `src/blocks/expression-blocks.ts`:

```typescript
inputs: {
  // Fixed input ports (existing - keep for backward compatibility)
  in0: { /* ... existing ... */ },
  // ... in1, in2, in3, in4

  // NEW: Varargs input for block references
  refs: {
    label: 'References',
    type: canonicalType('float'),  // Base type (actual signals come via varargs)
    isVararg: true,
    varargConstraint: {
      payloadType: 'float',
      cardinalityConstraint: 'any',  // Accept both Signal and Field
    },
    exposedAsPort: false,  // Not a traditional wirable port
    hidden: true,          // Hide from normal port UI
  },

  // Config parameter (existing)
  expression: { /* ... existing ... */ },
},
```

---

### P0 (Critical) Expression Block Lowering with Varargs [HIGH]

**Dependencies**: Expression Block Varargs Input, DSL Extension (Sprint 3), Block Lowering Infrastructure (Sprint 2)
**Spec Reference**: src/blocks/expression-blocks.ts (lines 125-196)
**Status Reference**: EVALUATION-20260125-181203.md - "Hardcoded iteration over in0-in4"

#### Description

Update the Expression block's `lower` function to use varargs inputs for block references in addition to fixed inputs.

#### Acceptance Criteria

- [ ] Lower function extracts varargs from `varargInputsById.refs`
- [ ] Builds `blockRefs` signal map from varargs connections
- [ ] Creates AddressRegistry for type checking
- [ ] Passes blockRefs context to `compileExpression()`
- [ ] Expression with block references compiles correctly
- [ ] Mixed usage (in0 + block refs) works
- [ ] Unit tests for lowering with varargs

#### Technical Notes

Update the `lower` function:

```typescript
lower: ({ ctx, inputsById, varargInputsById, config }) => {
  const exprText = (config?.expression as string | undefined) ?? '';

  // Handle empty expression (unchanged)
  if (exprText.trim() === '') {
    // ... existing empty expression handling
  }

  // Step 3 & 4: Build input type map and signal map (existing - for in0-in4)
  const inputs = new Map<string, CanonicalType>();
  const inputSignals = new Map<string, SigExprId>();

  // Process fixed input ports (existing)
  for (const key of ['in0', 'in1', 'in2', 'in3', 'in4'] as const) {
    // ... existing code
  }

  // NEW: Build block reference context from varargs
  let blockRefs: BlockReferenceContext | undefined;
  const refSignals = new Map<string, SigExprId>();

  if (varargInputsById?.refs) {
    const refValues = varargInputsById.refs;
    const varargConnections = ctx.varargConnections?.get('refs') ?? [];

    // Build registry from current patch context
    const registry = ctx.addressRegistry;

    // Map each vararg connection to its signal
    for (let i = 0; i < varargConnections.length && i < refValues.length; i++) {
      const conn = varargConnections[i];
      const value = refValues[i];

      if (value.k === 'sig') {
        // Build the alias for this connection
        const alias = conn.alias ?? conn.sourceAddress;
        refSignals.set(alias, value.id as SigExprId);
      }
    }

    blockRefs = {
      addressRegistry: registry,
      allowedPayloads: ['float'],
      signals: refSignals,
    };
  }

  // Step 5: Compile expression with block refs context
  const result = compileExpression(exprText, inputs, ctx.b, inputSignals, blockRefs);

  // ... rest unchanged
};
```

---

### P0 (Critical) LowerCtx Extension for Varargs Context [HIGH]

**Dependencies**: Varargs Normalization (Sprint 2), Canonical Addressing (Sprint 1)
**Spec Reference**: src/blocks/registry.ts LowerCtx (lines 20-41)
**Status Reference**: EVALUATION-20260125-181203.md

#### Description

Extend the `LowerCtx` interface to provide varargs context needed by blocks like Expression. This includes the address registry and resolved vararg connections.

#### Acceptance Criteria

- [ ] `LowerCtx.addressRegistry: AddressRegistry` added
- [ ] `LowerCtx.varargConnections: Map<string, ResolvedVarargConnection[]>` added
- [ ] Block lowering pass populates these fields
- [ ] Fields are optional for non-varargs blocks
- [ ] Unit tests verify context is passed correctly

#### Technical Notes

Extend LowerCtx in `src/blocks/registry.ts`:

```typescript
export interface LowerCtx {
  readonly blockIdx: BlockIndex;
  readonly blockType: string;
  readonly instanceId: string;
  readonly label?: string;
  readonly inTypes: readonly CanonicalType[];
  readonly outTypes: readonly CanonicalType[];
  readonly b: IRBuilder;
  readonly seedConstId: number;
  readonly instance?: InstanceId;
  readonly inferredInstance?: InstanceId;

  // NEW: Varargs support
  /** Address registry for resolving block references */
  readonly addressRegistry?: AddressRegistry;
  /** Resolved vararg connections by port ID */
  readonly varargConnections?: ReadonlyMap<string, readonly ResolvedVarargConnection[]>;
}
```

---

### P1 (High) End-to-End Integration Test [MEDIUM]

**Dependencies**: All previous items
**Spec Reference**: None - test coverage
**Status Reference**: EVALUATION-20260125-181203.md - "Feature does not exist"

#### Description

Create comprehensive end-to-end tests that verify the complete workflow from patch construction through compilation and execution.

#### Acceptance Criteria

- [ ] Test: Expression referencing single block output
- [ ] Test: Expression referencing multiple block outputs
- [ ] Test: Expression mixing fixed inputs and block references
- [ ] Test: Expression with block reference in complex formula
- [ ] Test: Error handling for invalid block reference
- [ ] Test: Error handling for non-float block reference
- [ ] Test: Cardinality propagation (signal vs field)
- [ ] All tests pass in CI

#### Technical Notes

Create `src/blocks/__tests__/expression-varargs.test.ts`:

```typescript
describe('Expression Block with Varargs', () => {
  describe('single block reference', () => {
    it('compiles Circle1.radius reference', () => {
      // 1. Build patch with Circle and Expression
      const builder = new PatchBuilder();
      const circleId = builder.addBlock('Circle', {}, { displayName: 'Circle1' });
      const exprId = builder.addBlock('Expression', { expression: 'Circle1.radius * 2' });

      // 2. Add vararg connection
      builder.addVarargConnection(
        exprId,
        'refs',
        `blocks.${circleId}.outputs.radius`,
        0
      );

      // 3. Compile
      const patch = builder.build();
      const result = compilePatch(patch);

      // 4. Verify compilation succeeds
      expect(result.errors).toHaveLength(0);
      expect(result.program).toBeDefined();
    });
  });

  describe('multiple block references', () => {
    it('compiles expression with two references', () => {
      // Expression: Circle1.radius + Osc1.out
      // ...
    });
  });

  describe('mixed inputs', () => {
    it('uses both in0 and block reference', () => {
      // Expression: in0 * Circle1.radius
      // ...
    });
  });

  describe('error cases', () => {
    it('rejects non-float reference', () => {
      // Try to reference color output
      // ...
    });

    it('rejects unknown block', () => {
      // Reference UnknownBlock.port
      // ...
    });
  });
});
```

## Dependencies

- **Depends on Sprint 1**: AddressRegistry for resolving references
- **Depends on Sprint 2**: VarargInputDef, varargInputsById, LowerArgs extension
- **Depends on Sprint 3**: Expression DSL block reference syntax

## Risks

| Risk | Mitigation |
|------|------------|
| Circular reference in expression | Graph ordering handles dependencies |
| Performance with many vararg refs | Lazy evaluation, efficient registry |
| UI complexity for varargs | Deferred to future UI sprint |

## Exit Criteria

This sprint is complete when:
1. Expression block accepts varargs input for block references
2. Expressions like `Circle1.radius * 2` compile and run
3. Mixed usage (in0 + block refs) works
4. All tests pass
5. Existing patches continue to work unchanged
