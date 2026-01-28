# Block Registry Unification Evaluation

**Generated:** 2026-01-11
**Topic:** Single Block Registry
**Verdict:** CONTINUE - Clear path forward, no blocking ambiguities

## Current State: THREE Block Registries Exist

### Registry 1: `src/blocks/registry.ts` (Metadata Registry)
**Purpose:** Block metadata for UI and type validation
- **Interface:** `BlockDef` with `type`, `label`, `category`, `form`, `capability`, `inputs`, `outputs`, `params`
- **Functions:** `registerBlock()`, `getBlockDefinition()`, `getAllBlockTypes()`, `hasBlockDefinition()`
- **Consumers:**
  - `pass2-types.ts` - extracts CanonicalType
  - `pass5-scc.ts` - block lookup
  - `pass6-block-lowering.ts` - port contracts
  - `pass8-link-resolution.ts` - block definitions
  - `resolveWriters.ts` - input definitions

### Registry 2: `src/compiler/ir/lowerTypes.ts` (IR Lowering Registry)
**Purpose:** IR lowering specifications for compilation
- **Interface:** `BlockTypeDecl` with `type`, `inputs`, `outputs`, `lower` function
- **Functions:** `registerBlockType()`, `getBlockType()`, `hasBlockType()`, `getAllBlockTypes()`
- **Consumers:**
  - `pass6-block-lowering.ts` - gets lowering function
  - All `src/blocks/*.ts` files - register lowering specs

### Registry 3: `src/compiler/blocks/registry.ts` (Legacy Compiler Registry)
**Purpose:** Compiler-specific block definitions with lowering
- **Interface:** `BlockDef` with `kind`, `inputs`, `outputs`, `lower` function
- **Functions:** `registerBlock()`, `getBlock()`, `getAllBlocks()` + helpers
- **Consumers:**
  - `src/index.ts` - exports `getAllBlocks`, `getBlock`, `BlockDef`
  - `src/compiler/blocks/**/*.ts` - individual block implementations
  - `rail/index.ts`, `bus/index.ts` - register blocks here

### Registry 4: `src/ui/registry/blockTypes.ts` (DEAD - Commented Out)
**Purpose:** Would have been UI-specific block catalog
**Status:** Entirely commented out, but 3 files still import from it:
- `src/ui/components/BlockLibrary.tsx`
- `src/ui/components/BlockInspector.tsx`
- `src/ui/components/__tests__/BlockLibrary.test.tsx`

## The Duplication Problem

Every block must register TWICE:
```typescript
// In src/blocks/time-blocks.ts
registerBlock({...});           // → src/blocks/registry.ts
registerBlockType({...});       // → src/compiler/ir/lowerTypes.ts
```

Additionally, blocks in `src/compiler/blocks/` register a THIRD time with different structure:
```typescript
// In src/compiler/blocks/time/InfiniteTimeRoot.ts
registerBlock({kind: 'InfiniteTimeRoot', ...});  // → src/compiler/blocks/registry.ts
```

This violates: **ONE SOURCE OF TRUTH** - Every concept has exactly one authoritative representation.

## Key Conflicts

1. **Two `BlockDef` types** with incompatible fields:
   - `src/blocks/registry.ts`: uses `type` field
   - `src/compiler/blocks/registry.ts`: uses `kind` field

2. **Two `registerBlock` functions** with different signatures

3. **Two lowering patterns**:
   - `BlockLower` from `src/compiler/blocks/registry.ts`
   - `lower` function from `src/compiler/ir/lowerTypes.ts`

4. **Broken UI imports** - commented out file causes build failures

## What Must Be Unified

| Concern | Currently Split Across | Unified Location |
|---------|----------------------|------------------|
| Block type name | all 3 registries | ONE registry |
| Input/output ports | all 3 registries | ONE registry |
| Port types (CanonicalType) | registries 1 & 2 | ONE registry |
| UI metadata (label, category, desc) | registry 1 | ONE registry |
| IR lowering function | registries 2 & 3 | ONE registry |
| Block form/capability | registry 1 | ONE registry |

## Recommended Approach: Merge Into `src/blocks/registry.ts`

**Rationale:**
1. It's already in the logical location (`src/blocks/`)
2. Compiler passes already import from it
3. Has the richest metadata (UI concerns + types)
4. Just needs to add the `lower` function

**The unified BlockDef:**
```typescript
interface BlockDef {
  // Identity
  readonly type: string;

  // UI metadata
  readonly label: string;
  readonly category: string;
  readonly description?: string;

  // Compilation metadata
  readonly form: BlockForm;
  readonly capability: Capability;

  // Port definitions (with CanonicalType)
  readonly inputs: readonly InputDef[];
  readonly outputs: readonly OutputDef[];

  // Block parameters
  readonly params?: Record<string, unknown>;

  // IR lowering (added from lowerTypes.ts)
  readonly lower: (args: LowerArgs) => LowerResult;
}
```

## Files That Must Change

### DELETE (after merging)
- `src/compiler/blocks/registry.ts` - legacy compiler registry
- `src/compiler/blocks/time/InfiniteTimeRoot.ts` - duplicate block
- `src/compiler/blocks/signal/*.ts` - duplicate blocks
- `src/compiler/blocks/domain/*.ts` - duplicate blocks
- `src/compiler/blocks/render/*.ts` - duplicate blocks
- `src/compiler/blocks/bus/index.ts` - uses legacy registry
- `src/compiler/blocks/rail/index.ts` - uses legacy registry
- `src/compiler/blocks/index.ts` - re-exports legacy registry
- `src/ui/registry/blockTypes.ts` - dead code

### UPDATE
- `src/blocks/registry.ts` - add `lower` field to BlockDef
- `src/blocks/*.ts` - merge `registerBlockType` calls into `registerBlock`
- `src/index.ts` - export from `src/blocks/registry.ts` instead
- `src/compiler/passes-v2/pass6-block-lowering.ts` - use unified registry
- `src/ui/components/BlockLibrary.tsx` - use unified registry
- `src/ui/components/BlockInspector.tsx` - use unified registry
- `src/ui/components/__tests__/BlockLibrary.test.tsx` - use unified registry

## Dependencies Identified

1. Must update `src/blocks/registry.ts` FIRST (add `lower` field)
2. Then merge `registerBlockType` calls into block files
3. Then update consumers to use unified registry
4. Then delete legacy registries
5. Finally fix UI components

## Build Status (Current)

Build currently fails with 19 errors:
- 4 errors in `field-operations-blocks.ts` (type issues)
- 1 error in `pass3-time.ts` (missing return)
- 14 errors related to commented-out `blockTypes.ts`

The blockTypes.ts errors will be fixed by this unification.

## Risks

1. **Bus/Rail blocks** use legacy registry with different `lower` signature - need careful migration
2. **LowerContext differences** between registries - need adapter or unified type
3. **Test files** may need updates

## Open Questions (NONE - All Resolved)

All paths are clear. No user input needed to proceed.
