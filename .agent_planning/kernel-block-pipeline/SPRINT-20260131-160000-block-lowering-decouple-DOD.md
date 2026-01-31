# Definition of Done: block-lowering-decouple
Generated: 2026-01-31-160000

## Verification Checklist

### WI-1: Strategy Assessment
- [ ] Decision documented in this topic directory
- [ ] Rationale includes: effort vs benefit analysis, critical path impact
- [ ] If proceeding → WI-2 acceptance criteria apply
- [ ] If deferring → WI-3 acceptance criteria apply

### WI-2: ValueExprBuilder (if proceeding)
- [ ] `ValueExprBuilder` exists with parallel API to IRBuilder
- [ ] At least one block compiles through new builder
- [ ] `npm run test` passes
- [ ] `npm run build` passes

### WI-3: Freeze Lowering (if deferring)
- [ ] `lowerToValueExprs.ts` marked as transitional
- [ ] No new legacy IR variants without documented waiver
- [ ] Existing block authors guided to design for ValueExpr

### Sprint-Level
- [ ] Path to eliminating legacy IR is documented (even if not yet executed)
- [ ] New blocks can be added without understanding legacy IR internals
