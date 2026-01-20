# Definition of Done: Unified Default Source Model

**Sprint**: SPRINT-20260119-200500-unified-defaults
**Generated**: 2026-01-19T20:05:00Z

---

## Acceptance Criteria

### 0. Square Block ✓

- [ ] Square primitive block created in `src/blocks/primitive-blocks.ts`
- [ ] Similar structure to Circle block
- [ ] TypeScript compiles

### 1. Type System ✓

- [ ] `DefaultSource` is unified type: `{ blockType, output, params? }`
- [ ] No `kind` discriminator property
- [ ] No 'none' option
- [ ] `defaultSourceConst(value)` helper exists
- [ ] `defaultSourceTimeRoot(output)` helper exists
- [ ] `defaultSourceRail` and `defaultSourceNone` removed
- [ ] TypeScript compiles (`npm run typecheck`)

### 2. Block Definitions ✓

- [ ] All blocks use new helper functions
- [ ] No references to old `defaultSourceConstant`, `defaultSourceRail`, `defaultSourceNone`
- [ ] `array-blocks.ts` 'element' input uses `defaultSource('Square', 'out')`

### 3. Default Source Pass ✓

- [ ] `pass1-default-sources.ts` handles `blockType === 'TimeRoot'` specially
- [ ] Non-TimeRoot defaults create derived block instances
- [ ] TODO comment at line 97 removed
- [ ] Wiring logic works for both cases

### 4. UI ✓

- [ ] BlockInspector identifies TimeRoot defaults correctly
- [ ] No references to `defaultSource.kind`
- [ ] TimeRoot defaults styled distinctly (italic, different color)

### 5. Tests Pass ✓

- [ ] `npm run typecheck` succeeds
- [ ] `npm test` passes all existing tests
- [ ] Manual test: patch loads and animations work

---

## Verification Commands

```bash
# Check no old patterns remain
grep -r "defaultSourceRail\|defaultSourceNone\|kind.*rail\|kind.*none" src/

# Type check
npm run typecheck

# Run tests
npm test

# Visual test
npm run dev
```

---

## Completion Checklist

| Item | Status | Evidence |
|------|--------|----------|
| DefaultSource type updated | [ ] | src/types/index.ts |
| Old helpers removed | [ ] | grep shows no matches |
| Block definitions updated | [ ] | grep shows no old patterns |
| pass1-default-sources updated | [ ] | No TODO, handles TimeRoot |
| UI updated | [ ] | No kind checks |
| TypeScript compiles | [ ] | npm run typecheck |
| Tests pass | [ ] | npm test |
