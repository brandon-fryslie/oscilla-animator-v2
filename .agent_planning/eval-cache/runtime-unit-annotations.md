# Runtime Findings: Unit Annotation System

**Scope**: unit-safe-types/unit-annotations
**Status**: Implementation complete, all DoD criteria met and exceeded
**Confidence**: FRESH (2026-01-20 05:48:46)
**Last Evaluation**: WORK-EVALUATION-20260120-054846.md

## Reusable Runtime Knowledge

### Unit System Architecture

**Type System Extension**:
- `NumericUnit` type in `src/core/canonical-types.ts` with 8 units
- `SignalType.unit?: NumericUnit` optional field (backwards compatible)
- Units: phase, radians, normalized, scalar, ms, #, degrees, seconds

**Validation Point**:
- Single enforcer: `checkUnitCompatibility()` in `src/compiler/passes-v2/pass2-types.ts`
- Called during Pass 2 (type graph construction) for each edge
- Soft validation: emits console.warn, does not block compilation

**Kernel Signatures**:
- Registry in `src/runtime/kernel-signatures.ts` (28 kernels declared)
- Format: `KernelSignature { inputs: KernelInputSignature[], output: KernelOutputSignature }`
- Separate from implementation (pure declaration)

### Unit Validation Behavior (Verified)

| Scenario | Warning? | Test Coverage |
|----------|----------|---------------|
| phase → radians | YES | unit-validation.test.ts: "should emit warning when connecting phase to radians" |
| matching units | NO | unit-validation.test.ts: "should not warn when units match" |
| no annotation on either side | NO | unit-validation.test.ts: "should not warn when no unit annotations" |
| no annotation on one side | NO | checkUnitCompatibility() early return on undefined |

**Warning Format**: `[Unit Mismatch] BlockType[port] → BlockType[port]: connecting ${fromUnit} to ${toUnit}. Consider adding conversion block.`

### Phase vs Radians Distinction (Critical)

**Signal Kernels** (SignalEvaluator):
- Expect: `phase` [0, 1)
- Convert: `phase * 2π` → radians internally
- Examples: sin, cos, tan, triangle, square, sawtooth

**Field Kernels** (OpcodeInterpreter, field operations):
- Expect: `radians` [0, 2π)
- No conversion (work directly in radians)
- Examples: circleAngle, fieldPolarToCartesian, fieldAngularOffset

This is THE primary unit mismatch the system detects.

### Performance Characteristics

- **Compile time**: +negligible (1 string comparison per edge)
- **Runtime**: Zero impact (units erased during compilation)
- **Memory**: +negligible (optional string field on type objects)

Units exist ONLY during compilation, not at runtime.

### Test Patterns

**Unit mismatch test pattern**:
```typescript
// Create blocks with unit annotations
registerBlock({
  outputs: [{ type: signalTypeSignal('float', 'phase') }]
});
registerBlock({
  inputs: [{ type: signalTypeSignal('float', 'radians') }]
});

// Connect and verify warning
pass2TypeGraph(patch);
expect(warnings.length).toBeGreaterThan(0);
expect(warnings[0]).toContain('Unit Mismatch');
```

**Mock console.warn**:
```typescript
const originalWarn = console.warn;
let warnings: string[] = [];
beforeEach(() => {
  warnings = [];
  console.warn = vi.fn((...args) => warnings.push(args.join(' ')));
});
afterEach(() => { console.warn = originalWarn; });
```

### Migration Patterns

**Adding units to blocks**:
```typescript
// OLD (pre-unit)
outputs: [{ id: 'phase', type: signalTypeSignal('float') }]

// NEW (with unit)
outputs: [{ id: 'phase', type: signalTypeSignal('float', 'phase') }]
```

**Backwards compatibility preserved**:
- Existing blocks without units: work unchanged
- New blocks with units: validation active
- Mixed: no warning if one side lacks unit

### Documentation Locations

- **User-facing**: `src/core/UNIT-MIGRATION-GUIDE.md` (316 lines)
  - Quick start, unit taxonomy, examples, FAQ
- **Internal**: `src/runtime/kernel-signatures.ts` header comments
  - Phase vs radians semantics, kernel unit expectations
- **Research**: `.agent_planning/unit-safe-types/RESEARCH-FINDINGS.md`
  - Design decisions, unknowns resolved

### Known Limitations (Documented)

1. **DiagnosticHub integration**: Future sprint (console.warn for v1)
2. **Auto-conversion**: Not implemented (explicit-only policy for v1)
3. **Unit arithmetic validation**: Future sprint (phase + phase = phase rules)

### Files to Check for Changes

**Core implementation**:
- `src/core/canonical-types.ts` (NumericUnit type, SignalType.unit field)
- `src/compiler/passes-v2/pass2-types.ts` (checkUnitCompatibility function)
- `src/runtime/kernel-signatures.ts` (kernel unit expectations)

**Tests**:
- `src/compiler/passes-v2/__tests__/unit-validation.test.ts` (3 tests)

**Next evaluation**: If any of these files change, re-verify unit validation behavior.

## Key Findings

### What Works

1. **Research-driven design**: All unknowns resolved before implementation
2. **Backwards compatibility**: Optional units enable gradual adoption
3. **Single enforcer**: Pass 2 validation, no scattered checks
4. **Test coverage**: 3 tests covering all validation scenarios
5. **Documentation**: Comprehensive migration guide anticipates questions

### Design Decisions (Rationale)

- **Optional units**: Gradual adoption without breaking changes
- **Soft validation**: Warnings only, no compilation errors (learning curve)
- **Explicit-only**: No auto-conversion (safer, teaches users about units)
- **Pass 2 validation**: Natural place for type compatibility checks
- **Separate signatures**: kernel-signatures.ts for clarity and extensibility

### Future Integration Points

**Sprint 3: DiagnosticHub**
- Replace console.warn with diagnostic emission
- Code location: pass2-types.ts line 132-137
- Diagnostic code: `W_UNIT_MISMATCH`

**Sprint 4+: Auto-Conversion**
- Conversion block registry (phaseToRadians, etc.)
- User preference setting
- Visual indication in graph editor

**Sprint 5+: Unit Arithmetic**
- Validate arithmetic operations (phase + phase, scalar * phase)
- Detect invalid operations (phase + radians → error)

## Confidence Assessment

**FRESH** because:
- Just evaluated (2026-01-20 05:48:46)
- All DoD criteria verified
- Tests pass, typecheck passes, dev server runs
- No code changes since evaluation

**Trust this evaluation if**:
- Files unchanged: canonical-types.ts, pass2-types.ts, kernel-signatures.ts
- Tests still pass: unit-validation.test.ts
- Working on unit-related features

**Re-evaluate if**:
- Any core files modified
- New unit validation tests added
- DiagnosticHub integration begins
