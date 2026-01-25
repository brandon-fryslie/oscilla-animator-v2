# Plan: Consolidate Port Key Utilities

## Problem Statement

Port key generation is duplicated across the codebase with inconsistent formats:

| Location | Format | Purpose |
|----------|--------|---------|
| `pass1-type-constraints.ts` | `${blockIndex}:${portName}:${direction}` | Compiler type resolution |
| `pass6-block-lowering.ts` | `${blockIndex}:${portName}:${direction}` | IR lowering |
| `DebugService.ts` | `${blockId}:${portName}` | Debug value lookup |
| `mapDebugEdges.ts` | `${blockId}:${portName}` | Debug edge mapping |
| `debug-viz/types.ts` | `p:${blockId}\0${portName}` | Debug key serialization |
| `ContinuityState.ts` | `${semantic}:${instanceId}:${portName}` | State continuity (different concept) |

The TODO at `mapDebugEdges.ts:206` explicitly requests a canonical `portKey` function.

## Analysis

There are actually **two distinct port key concepts**:

### 1. Compiler PortKey (with direction)
- Type: `PortKey = \`${number}:${string}:${'in' | 'out'}\``
- Used by: `pass1-type-constraints.ts`, `pass6-block-lowering.ts`
- Purpose: Uniquely identify a port during compilation (input vs output matters)
- Key components: `blockIndex` (number), `portName` (string), `direction` ('in' | 'out')

### 2. Debug PortKey (without direction)
- Type: Implicit string `\`${string}:${string}\``
- Used by: `DebugService.ts`, `mapDebugEdges.ts`
- Purpose: Identify a port for value inspection (typically outputs)
- Key components: `blockId` (string), `portName` (string)

### 3. Debug Serialization Key (with prefix)
- Already well-structured in `debug-viz/types.ts` as `serializeKey()`
- Uses `p:` prefix and NUL separator for bijective serialization
- This is intentionally different (for Map/Set keys with guaranteed uniqueness)

### 4. Continuity StableTargetId (unrelated)
- `${semantic}:${instanceId}:${portName}` - different concept entirely
- Used for state persistence across hot-swaps
- Should NOT be consolidated with port keys

## Solution Design

### Single Source of Truth

Create `src/core/port-keys.ts` with both key types:

```typescript
// =============================================================================
// Compiler Port Key (includes direction)
// =============================================================================

/**
 * Typed key for identifying a port during compilation.
 * Format: "blockIndex:portName:direction"
 *
 * Used by type constraint solving and block lowering.
 */
export type CompilerPortKey = `${number}:${string}:${'in' | 'out'}`;

/**
 * Create a compiler port key (type-safe).
 */
export function compilerPortKey(
  blockIndex: number,
  portName: string,
  direction: 'in' | 'out'
): CompilerPortKey {
  return `${blockIndex}:${portName}:${direction}` as CompilerPortKey;
}

// =============================================================================
// Debug Port Key (no direction)
// =============================================================================

/**
 * Typed key for identifying a port for debug/inspection.
 * Format: "blockId:portName"
 *
 * Used by debug services for value lookup. Typically refers to output ports
 * since those are what carry values worth inspecting.
 */
export type DebugPortKey = `${string}:${string}`;

/**
 * Create a debug port key.
 */
export function debugPortKey(blockId: string, portName: string): DebugPortKey {
  return `${blockId}:${portName}` as DebugPortKey;
}
```

### Migration Strategy

1. **Create new file** `src/core/port-keys.ts`
2. **Update compiler passes** to import from new location
   - `pass1-type-constraints.ts`: Export `CompilerPortKey` type, use `compilerPortKey()` fn
   - `pass6-block-lowering.ts`: Remove local `portKey()`, import from `port-keys.ts`
3. **Update debug services** to use `debugPortKey()`
   - `DebugService.ts`: Replace inline string interpolation
   - `mapDebugEdges.ts`: Replace inline string interpolation, remove TODO
4. **Keep `serializeKey()` in `debug-viz/types.ts`** - it serves a different purpose (bijective serialization with prefix)
5. **Do NOT touch `ContinuityState.ts`** - `computeStableTargetId()` is unrelated

## Implementation Steps

### Step 1: Create port-keys.ts
- Create `src/core/port-keys.ts` with both key types and functions
- Add tests in `src/core/__tests__/port-keys.test.ts`

### Step 2: Migrate pass1-type-constraints.ts
- Re-export `CompilerPortKey` as `PortKey` for backward compatibility (used by pass6)
- Replace local `portKey()` function with import of `compilerPortKey`
- Alternatively, create local alias: `const portKey = compilerPortKey;`

### Step 3: Migrate pass6-block-lowering.ts
- Remove local `portKey()` function (lines 30-33)
- Import `compilerPortKey` from `port-keys.ts`
- Keep importing `PortKey` type from `pass1-type-constraints.ts` (it re-exports)

### Step 4: Migrate DebugService.ts
- Import `debugPortKey` from `port-keys.ts`
- Replace `\`${key.blockId}:${key.portName}\`` with `debugPortKey(key.blockId, key.portName)`
- Replace `\`${blockId}:${portName}\`` with `debugPortKey(blockId, portName)`

### Step 5: Migrate mapDebugEdges.ts
- Import `debugPortKey` from `port-keys.ts`
- Replace inline key construction
- Remove the TODO comment

### Step 6: Update tests
- Any tests that construct port keys inline should use the utility functions

## Files Changed

| File | Change |
|------|--------|
| `src/core/port-keys.ts` | **NEW** - Port key utilities |
| `src/core/__tests__/port-keys.test.ts` | **NEW** - Unit tests |
| `src/compiler/passes-v2/pass1-type-constraints.ts` | Replace local fn, re-export type |
| `src/compiler/passes-v2/pass6-block-lowering.ts` | Remove local fn, import utility |
| `src/services/DebugService.ts` | Use `debugPortKey()` |
| `src/services/mapDebugEdges.ts` | Use `debugPortKey()`, remove TODO |

## Non-Goals

- **NOT changing `debug-viz/types.ts`** - `serializeKey()` is intentionally different
- **NOT changing `ContinuityState.ts`** - `computeStableTargetId()` is a different concept
- **NOT changing the key format** - This is purely a refactor for DRY, not a format change

## Verification

1. `npm run typecheck` passes
2. `npm run test` passes
3. All port key usages trace back to the two canonical functions
4. No remaining inline `${blockId}:${portName}` patterns (except in port-keys.ts)

## Risk Assessment

**Low risk** - This is a pure refactor with no behavioral changes:
- Same string formats produced
- Type aliases maintain backward compatibility
- All call sites updated mechanically
