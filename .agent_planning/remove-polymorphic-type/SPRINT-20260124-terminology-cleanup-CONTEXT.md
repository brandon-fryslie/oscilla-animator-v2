# Implementation Context: terminology-cleanup

Generated: 2026-01-24

## Background

The Oscilla v2 type system originally used `???` as a polymorphic placeholder type that was resolved during compilation. This has been fully replaced by the "payload-generic" metadata system where blocks explicitly declare their allowed payload types via `BlockPayloadMetadata`.

**Migration timeline:**
- Sprint 1: Built `BlockPayloadMetadata` infrastructure in registry.ts
- Sprint 2: Migrated Const block to use explicit `allowedPayloads`
- Sprint 3: Migrated all other payload-generic blocks
- Sprint 4: Removed `???` from `PayloadType` union
- **This Sprint**: Rename files/functions to match new terminology

## Files to Modify

### Primary Target
```
src/graph/passes/pass0-polymorphic-types.ts
→ src/graph/passes/pass0-payload-resolution.ts
```

### Import Sites
```
src/graph/passes/index.ts:12  - import statement
src/graph/passes/index.ts:56  - function call
src/graph/passes/index.ts:80  - re-export
```

### Comment Updates
```
src/graph/passes/index.ts:5   - "Pass 0: Polymorphic type resolution"
src/blocks/signal-blocks.ts:20 - "resolved by pass0-polymorphic-types"
src/blocks/field-blocks.ts:19  - "resolved by pass0-polymorphic-types"
```

## Function Rename

```typescript
// Before
export function pass0PolymorphicTypes(patch: Patch): Patch

// After
export function pass0PayloadResolution(patch: Patch): Patch
```

## Search-Replace Pattern

1. `pass0PolymorphicTypes` → `pass0PayloadResolution`
2. `pass0-polymorphic-types` → `pass0-payload-resolution`
3. "Polymorphic type resolution" → "Payload type resolution"
4. "polymorphic-types" (in file references) → "payload-resolution"

## Testing Strategy

No new tests required. Existing tests validate behavior.
Run full test suite to catch any missed references.

## Git Workflow

```bash
# Rename file
git mv src/graph/passes/pass0-polymorphic-types.ts src/graph/passes/pass0-payload-resolution.ts

# Update references (manual edit)

# Verify
npm run typecheck && npm run test

# Commit
git add -A
git commit -m "refactor(types): rename polymorphic→payload-generic terminology"
```
