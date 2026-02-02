# Fix: Expression Block Vararg Address Resolution

## Problem

When the autocomplete inserts an output suggestion and wires a vararg connection, compilation fails:
```
Vararg connection references invalid address: blocks.b2.outputs.elements
Vararg connection references invalid address: blocks.b4.outputs.out
```

## Root Cause

**Two mismatches** between address generation and address resolution:

| | SuggestionProvider generates | AddressRegistry expects |
|--|--|--|
| **Version prefix** | `blocks.b2...` (none) | `v1:blocks...` (versioned) |
| **Block identifier** | `b2` (raw blockId) | canonical name from displayName (e.g., `circle1`) |

The SuggestionProvider (`src/expr/suggestions.ts:323`) builds addresses with:
```typescript
const sourceAddress = `blocks.${block.id}.outputs.${portId}`;
```

But the AddressRegistry (`src/graph/address-registry.ts:70-74`) indexes using:
```typescript
const outAddr = getOutputAddress(block, portId);  // uses canonicalName
byCanonical.set(addressToString(outAddr), resolved);  // prefixes with "v1:"
```

Where `addressToString` produces `v1:blocks.{canonicalName}.outputs.{portId}`.

## Fix

**One change in one place** — fix the SuggestionProvider to generate correct canonical addresses using the existing `getOutputAddress` + `addressToString` functions. This is the single source of truth for address string format.

### File: `src/expr/suggestions.ts`

**Before** (line 323):
```typescript
const sourceAddress = `blocks.${block.id}.outputs.${portId}`;
```

**After**:
```typescript
const sourceAddress = addressToString(getOutputAddress(block, portId as PortId));
```

This produces `v1:blocks.{canonicalName}.outputs.{portId}` — exactly what the AddressRegistry indexes and the compiler validates against.

### Imports needed:
```typescript
import { addressToString } from '../types/canonical-address';
import { getOutputAddress } from '../graph/addressing';
import type { PortId } from '../types';
```

## Why This Is The Right Fix

- **Single source of truth**: Uses `addressToString(getOutputAddress(...))` — the canonical address generation path used everywhere else (demos, registry, compiler).
- **Single enforcer**: The compiler's `normalize-varargs.ts` validates via `registry.resolve()`, and this fix ensures we generate what the registry indexes.
- **No new abstractions**: Just wire existing functions together correctly.
- **No dual format**: Eliminates the ad-hoc `blocks.${block.id}...` format that exists only in SuggestionProvider.

## Verification

1. Typecheck passes
2. Existing tests pass (no test references the broken format)
3. Manual: Add Expression block, use autocomplete to insert an output, verify compilation succeeds
