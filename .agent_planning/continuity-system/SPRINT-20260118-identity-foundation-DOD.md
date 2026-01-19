# Sprint: identity-foundation - Definition of Done

> **Sprint**: identity-foundation
> **Generated**: 2026-01-18

---

## Acceptance Criteria Checklist

### Types (src/compiler/ir/types.ts)

- [ ] `GaugeSpec` discriminated union exported
  - Variants: `add`, `mul`, `affine`, `phaseOffset01`

- [ ] `ContinuityPolicy` discriminated union exported
  - Variants: `none`, `preserve`, `slew`, `crossfade`, `project`
  - `crossfade` includes `curve` field
  - `project` includes `post` and `tauMs` fields

- [ ] `DomainInstance` interface exported
  - `count: number`
  - `elementId: Uint32Array`
  - `identityMode: 'stable' | 'none'`
  - `posHintXY?: Float32Array`

- [ ] `InstanceDecl` extended
  - `identityMode: 'stable' | 'none'`
  - `elementIdSeed?: number`

### DomainIdentity Module (src/runtime/DomainIdentity.ts)

- [ ] File exists and is properly typed
- [ ] `generateElementIds(count, seed?)` exported
- [ ] `createStableDomainInstance(count, seed?, posHintXY?)` exported
- [ ] `createUnstableDomainInstance(count)` exported

### IRBuilder (src/compiler/ir/IRBuilder.ts)

- [ ] `createInstance()` accepts `identityMode` parameter
- [ ] Default value is `'stable'`

### Array Block Integration

- [ ] Array block calls `createInstance()` with `identityMode: 'stable'`

### Tests

- [ ] Unit tests exist at `src/runtime/__tests__/DomainIdentity.test.ts`
- [ ] All tests pass: `npm test`
- [ ] Type check passes: `npm run typecheck`

---

## Verification Commands

```bash
# Type check
npm run typecheck

# Run tests
npm test -- --testPathPattern=DomainIdentity

# Verify exports
npx tsc --noEmit && grep -r "DomainInstance\|GaugeSpec\|ContinuityPolicy" src/compiler/ir/types.ts
```

---

## Exit Criteria

Sprint is complete when:
1. All checklist items above are checked
2. `npm run typecheck` passes with zero errors
3. `npm test` passes with zero failures
4. Code review approved (if applicable)
