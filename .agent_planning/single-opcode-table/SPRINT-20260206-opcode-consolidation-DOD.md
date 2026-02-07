# Definition of Done: Opcode Consolidation

Sprint: opcode-consolidation
Date: 2026-02-06

## Acceptance Verification Checklist

### Code Quality

- [ ] `evaluatePureFn` in ValueExprMaterializer.ts is under 30 lines
- [ ] No `case 'add':`, `case 'sin':`, etc. in ValueExprMaterializer.ts
- [ ] Single delegation point: `applyOpcode(fn.opcode, args)`
- [ ] Exhaustive switch on `fn.kind` with never pattern
- [ ] Handles all PureFn kinds: opcode, kernel, kernelResolved, expr, composed

### Testing

- [ ] `npm run test` passes with no failures
- [ ] `npm run typecheck` passes with no errors
- [ ] Forbidden-pattern test exists and passes
- [ ] Forbidden-pattern test would fail if duplicate added back

### Behavioral Verification

- [ ] Demo apps render correctly: simple, golden-spiral, mouse-spiral
- [ ] No console errors or warnings from opcode evaluation
- [ ] Hash-based randomId produces same output as before

### Documentation

- [ ] No code comment updates needed (OpcodeInterpreter already documented)
- [ ] This DOD file updated with completion status

## Completion Evidence

```
# Run these commands to verify:
npm run test
npm run typecheck
npm run dev  # Then check demos visually
```

## Sign-off

- [ ] All checklist items verified
- [ ] Commit message: "refactor: consolidate opcode dispatch to single enforcer"
