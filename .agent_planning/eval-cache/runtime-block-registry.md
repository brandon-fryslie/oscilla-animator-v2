# Runtime Findings: Block Registry

**Last Updated:** 2026-01-12 02:17:30
**Source:** work-evaluator evaluation of block-registry-unification

## Registry Structure

### Location
- **Canonical:** `src/blocks/registry.ts`
- **Re-exports:** `src/compiler/ir/index.ts` (LowerResult, LowerCtx, LowerArgs)

### Core Components
1. **BlockDef interface** - Unified definition with metadata + lowering
2. **registerBlock() function** - Single registration point with validation
3. **Private registry Map** - `Map<string, BlockDef>`
4. **Public accessors:**
   - `getBlockDefinition(type)` - Get single block
   - `BLOCK_DEFS_BY_TYPE` - Direct Map access (readonly)
   - `getAllBlockTypes()` - All type strings
   - `getAllBlockDefs()` - All definitions
   - `hasBlockDefinition(type)` - Existence check
   - `getBlockCategories()` - Unique categories
   - `getBlockTypesByCategory(category)` - Filtered by category
   - `searchBlockTypes(query)` - Search by type/label/description

### Registration Pattern
All block files follow this pattern:
```typescript
import { registerBlock } from './registry';

registerBlock({
  type: 'BlockTypeName',
  label: 'Human Label',
  category: 'category',
  form: 'primitive',
  capability: 'pure',
  inputs: [...],
  outputs: [...],
  params: {...},
  lower: (args) => { /* IR lowering */ }
});
```

### Built-in Protections
1. **Duplicate prevention:** `registerBlock()` throws if type already registered
2. **Port ID uniqueness:** Validates input/output IDs are unique per block
3. **Type safety:** All fields strongly typed via BlockDef interface

## Consumer Integration

### Compiler Integration
- **Pass6 (block-lowering):** Uses `getBlockDefinition()` and `BLOCK_DEFS_BY_TYPE`
- **Type imports:** LowerCtx, LowerArgs, LowerResult available from registry or ir/index

### UI Integration  
- **BlockLibrary:** Uses `getBlockCategories()`, `getBlockTypesByCategory()`, `BlockDef` type
- **BlockInspector:** Uses `BlockDef` type for block metadata display

### No Duplicates
Verified ZERO alternate registries:
- `src/compiler/blocks/` - DELETED
- `src/ui/registry/blockTypes.ts` - DELETED
- `src/compiler/ir/lowerTypes.ts` - Contains ONLY compiler types, no block registry

## Block Files (10 total)
1. color-blocks.ts (4 blocks)
2. domain-blocks.ts (2 blocks)
3. field-blocks.ts (1 block)
4. field-operations-blocks.ts (9 blocks)
5. geometry-blocks.ts (3 blocks)
6. identity-blocks.ts (2 blocks)
7. math-blocks.ts (5 blocks)
8. render-blocks.ts (2 blocks)
9. signal-blocks.ts (2 blocks)
10. time-blocks.ts (2 blocks)

**Total:** 32 registered blocks (as of 2026-01-12)

## Known Issues

### Pass8 Import Cleanup Needed
File: `src/compiler/passes-v2/pass8-link-resolution.ts`
- Imports `getBlockType` from `../ir/lowerTypes` but function doesn't exist
- Imports `LowerCtx` from `../ir/lowerTypes` but type is in `blocks/registry`
- No build errors (possibly unused imports)
- Recommendation: Update imports to use `blocks/registry` directly

## Verification Commands

```bash
# Verify single registry location
ls -la src/blocks/registry.ts

# Verify deleted files
ls src/compiler/blocks/ 2>&1          # Should fail
ls src/ui/registry/blockTypes.ts 2>&1 # Should fail

# Count registrations
grep -r "registerBlock" src/ | grep -v ".test." | wc -l

# Check for imports from deleted locations
grep -r "from.*compiler/blocks" src/ --include="*.ts" | grep -v "ir/"
grep -r "from.*ui/registry/blockTypes" src/ --include="*.ts"
```
