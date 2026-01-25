# Implementation Context: Storage Key Bump

## Quick Facts

- **File**: `src/main.ts`
- **Line**: 558
- **Change**: Single string value update
- **Current Value**: `'oscilla-v2-patch-v9'`
- **New Value**: `'oscilla-v2-patch-v10'`
- **Impact**: Forces localStorage reset on app load

## Why This Fixes The Bug

The block refactoring in commit `4243c1d` renamed field operation blocks:
- `FieldSin` → `Sin`
- `FieldCos` → `Cos`
- Removed `FieldAdd`, `FieldMultiply`, `FieldScale`

Old demo patches stored in localStorage under key `v9` contained references like:
```json
{
  "blocks": [
    { "type": "FieldSin", ... },
    { "type": "FieldAdd", ... }
  ]
}
```

When the app tries to load `v9` patches, it looks for these blocks in the registry. They don't exist → UnknownPort error during compilation.

By bumping to `v10`:
1. App looks for key `oscilla-v2-patch-v10` in localStorage
2. Doesn't find it (old data was under `v9`)
3. Clears `v9` entry and resets to factory demos
4. New demos use correct block names (`Sin`, `Cos`, etc.)
5. Patches compile successfully

## Storage Key Pattern

The storage key convention in this project is:
```
oscilla-v2-patch-v<N>
```

Increment `<N>` whenever:
- Patch schema changes
- Block registry changes incompatibly
- Block names/types change
- Port signatures change

This is a **migration-free approach**: old data is discarded, fresh state loaded.

## Testing Points

1. **Fresh Install**: New users get factory demos, no errors
2. **Upgrade Path**: Users with `v9` data see fresh demos after reload
3. **New Patches**: Created after this fix should work normally
4. **Block Registry**: Current block registry has Sin, Cos, FromDomainId, etc.

## Related Code

- **Patch Loading**: `src/main.ts` - `loadPatches()` function
- **Storage Persistence**: `savePatchesToStorage()` in `diagnosticsStore`
- **Block Registry**: `src/blocks/block-registry.ts`
- **Field Operations**: `src/blocks/field-operations-blocks.ts`
- **Port Validation**: `src/graph/passes/pass2-adapters.ts:132-149`

## Edge Cases Handled

1. **User has manually saved patches**: They'll be lost (acceptable - patches were non-functional anyway)
2. **Browser cache**: Cleared automatically when storage key changes
3. **Multiple tabs**: All tabs will use same `v10` key after reload
