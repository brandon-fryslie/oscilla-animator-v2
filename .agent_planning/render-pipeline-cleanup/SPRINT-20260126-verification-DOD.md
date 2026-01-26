# Definition of Done: verification Sprint

## Completion Criteria

### ms5.8: Complete v1→v2 migration

- [ ] `grep -r "v1" src/render src/runtime/RenderAssembler.ts` returns only comments/docs
- [ ] No numeric shape encoding (0, 1) in render paths
- [ ] No dual code paths for v1/v2 compatibility
- [ ] Audit summary written to evaluation
- [ ] Bead closed with verification evidence

### ms5.11: Intrinsics documentation

- [ ] `.claude/rules/compiler/intrinsics.md` reviewed against `src/runtime/Materializer.ts`
- [ ] All 5 intrinsics documented accurately
- [ ] Layout-based behavior for position/radius documented
- [ ] No outdated or misleading information
- [ ] Bead unblocked and closed

## Verification Commands

```bash
# Search for v1 references in render code
grep -rn "v1" src/render src/runtime/RenderAssembler.ts

# Search for legacy shape encoding
grep -rn "shape.*=.*[01]" src/runtime src/render

# Check intrinsics implementation
grep -A20 "fillBufferIntrinsic" src/runtime/Materializer.ts
```

## Exit Criteria

Sprint complete when:
1. Audit finds no blocking issues (clean state confirmed)
2. Documentation matches implementation
3. Beads ms5.8 and ms5.11 closed
