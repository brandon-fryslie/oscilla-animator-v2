# Implementation Context: canonical-addressing

Generated: 2026-01-25-192523
Plan: SPRINT-20260125-192523-canonical-addressing-PLAN.md

## File Locations

### New Files to Create

1. **`src/types/canonical-address.ts`** - Core types and functions
2. **`src/types/__tests__/canonical-address.test.ts`** - Unit tests

### Files to Modify

1. **`src/types/index.ts`** - Add exports for new types

## CanonicalAddress Type System

### Type Definition

Create `src/types/canonical-address.ts`:

```typescript
import type { BlockId, PortId } from './index';

/**
 * Canonical address for any addressable element in an Oscilla patch.
 * Format: blocks.<blockId>.[outputs|inputs|params].<portId|paramId>
 */
export type CanonicalAddress =
  | { readonly kind: 'block'; readonly blockId: BlockId }
  | { readonly kind: 'output'; readonly blockId: BlockId; readonly portId: PortId }
  | { readonly kind: 'input'; readonly blockId: BlockId; readonly portId: PortId }
  | { readonly kind: 'param'; readonly blockId: BlockId; readonly paramId: string };
```

### String Format

```
blocks.<blockId>                       -> { kind: 'block', blockId }
blocks.<blockId>.outputs.<portId>      -> { kind: 'output', blockId, portId }
blocks.<blockId>.inputs.<portId>       -> { kind: 'input', blockId, portId }
blocks.<blockId>.params.<paramId>      -> { kind: 'param', blockId, paramId }
```

### addressToString Implementation

```typescript
export function addressToString(addr: CanonicalAddress): string {
  switch (addr.kind) {
    case 'block':
      return `blocks.${addr.blockId}`;
    case 'output':
      return `blocks.${addr.blockId}.outputs.${addr.portId}`;
    case 'input':
      return `blocks.${addr.blockId}.inputs.${addr.portId}`;
    case 'param':
      return `blocks.${addr.blockId}.params.${addr.paramId}`;
  }
}
```

### parseAddress Implementation

```typescript
const ADDRESS_REGEX = /^blocks\.([^.]+)(?:\.(outputs|inputs|params)\.([^.]+))?$/;

export function parseAddress(str: string): CanonicalAddress | null {
  const match = str.match(ADDRESS_REGEX);
  if (!match) return null;

  const [, blockId, segment, portOrParam] = match;

  if (!segment) {
    return { kind: 'block', blockId: blockId as BlockId };
  }

  switch (segment) {
    case 'outputs':
      return { kind: 'output', blockId: blockId as BlockId, portId: portOrParam as PortId };
    case 'inputs':
      return { kind: 'input', blockId: blockId as BlockId, portId: portOrParam as PortId };
    case 'params':
      return { kind: 'param', blockId: blockId as BlockId, paramId: portOrParam };
    default:
      return null;
  }
}
```

### Type Guards

```typescript
export function isBlockAddress(addr: CanonicalAddress): addr is Extract<CanonicalAddress, { kind: 'block' }> {
  return addr.kind === 'block';
}

export function isOutputAddress(addr: CanonicalAddress): addr is Extract<CanonicalAddress, { kind: 'output' }> {
  return addr.kind === 'output';
}

// ... similar for isInputAddress, isParamAddress
```

## Address Generation

### Existing Types to Use

From `src/graph/Patch.ts`:
```typescript
// Line 60-71
export interface InputPort {
  readonly id: string;
  readonly defaultSource?: DefaultSource;
  readonly combineMode?: CombineMode;
}

export interface OutputPort {
  readonly id: string;
}

// Line 85-101
export interface Block {
  readonly id: BlockId;
  readonly inputPorts: ReadonlyMap<string, InputPort>;
  readonly outputPorts: ReadonlyMap<string, OutputPort>;
  // ...
}

// Line 152-155
export interface Patch {
  readonly blocks: ReadonlyMap<BlockId, Block>;
  readonly edges: readonly Edge[];
}
```

### Generation Functions

```typescript
export function getBlockAddress(blockId: BlockId): CanonicalAddress {
  return { kind: 'block', blockId };
}

export function getOutputAddress(blockId: BlockId, portId: PortId): CanonicalAddress {
  return { kind: 'output', blockId, portId };
}

export function getAllAddresses(patch: Patch): CanonicalAddress[] {
  const addresses: CanonicalAddress[] = [];
  for (const [blockId, block] of patch.blocks) {
    addresses.push({ kind: 'block', blockId });
    for (const [portId] of block.inputPorts) {
      addresses.push({ kind: 'input', blockId, portId: portId as PortId });
    }
    for (const [portId] of block.outputPorts) {
      addresses.push({ kind: 'output', blockId, portId: portId as PortId });
    }
    // Params require registry lookup - see below
  }
  return addresses;
}
```

## Address Resolution

### ResolvedAddress Type

```typescript
import type { Block, InputPort, OutputPort, Patch } from '../graph/Patch';
import type { CanonicalType } from '../core/canonical-types';

export type ResolvedAddress =
  | { readonly kind: 'block'; readonly block: Block }
  | { readonly kind: 'output'; readonly block: Block; readonly port: OutputPort; readonly type: CanonicalType }
  | { readonly kind: 'input'; readonly block: Block; readonly port: InputPort; readonly type: CanonicalType }
  | { readonly kind: 'param'; readonly block: Block; readonly paramId: string; readonly value: unknown };
```

### Resolution Implementation

```typescript
import { requireBlockDef } from '../blocks/registry';

export function resolveAddress(patch: Patch, addressStr: string): ResolvedAddress | null {
  const addr = parseAddress(addressStr);
  if (!addr) return null;

  const block = patch.blocks.get(addr.blockId);
  if (!block) return null;

  switch (addr.kind) {
    case 'block':
      return { kind: 'block', block };

    case 'output': {
      const port = block.outputPorts.get(addr.portId);
      if (!port) return null;
      const def = requireBlockDef(block.type);
      const outputDef = def.outputs[addr.portId];
      if (!outputDef) return null;
      return { kind: 'output', block, port, type: outputDef.type };
    }

    case 'input': {
      const port = block.inputPorts.get(addr.portId);
      if (!port) return null;
      const def = requireBlockDef(block.type);
      const inputDef = def.inputs[addr.portId];
      if (!inputDef) return null;
      return { kind: 'input', block, port, type: inputDef.type };
    }

    case 'param': {
      const value = block.params[addr.paramId];
      return { kind: 'param', block, paramId: addr.paramId, value };
    }
  }
}
```

## User-Friendly Aliases

### Alias Format

```
<displayName>.<portId>   e.g., Circle1.radius
<blockId>.<portId>       fallback when displayName is null
```

### Alias Resolution

```typescript
export function resolveAlias(patch: Patch, alias: string): CanonicalAddress | null {
  const dotIndex = alias.indexOf('.');
  if (dotIndex === -1) return null;

  const blockRef = alias.slice(0, dotIndex);
  const portId = alias.slice(dotIndex + 1);

  // Find block by displayName or blockId
  let matchingBlockId: BlockId | null = null;
  let ambiguous = false;

  for (const [blockId, block] of patch.blocks) {
    if (block.displayName === blockRef || blockId === blockRef) {
      if (matchingBlockId !== null) {
        ambiguous = true;
        break;
      }
      matchingBlockId = blockId;
    }
  }

  if (ambiguous || !matchingBlockId) return null;

  // Check if it's an output (default) or input
  const block = patch.blocks.get(matchingBlockId)!;
  if (block.outputPorts.has(portId)) {
    return { kind: 'output', blockId: matchingBlockId, portId: portId as PortId };
  }
  if (block.inputPorts.has(portId)) {
    return { kind: 'input', blockId: matchingBlockId, portId: portId as PortId };
  }

  return null;
}
```

## AddressRegistry Class

```typescript
export class AddressRegistry {
  private readonly byCanonical: Map<string, ResolvedAddress>;
  private readonly byAlias: Map<string, CanonicalAddress>;

  private constructor(
    byCanonical: Map<string, ResolvedAddress>,
    byAlias: Map<string, CanonicalAddress>
  ) {
    this.byCanonical = byCanonical;
    this.byAlias = byAlias;
  }

  static buildFromPatch(patch: Patch): AddressRegistry {
    const byCanonical = new Map<string, ResolvedAddress>();
    const byAlias = new Map<string, CanonicalAddress>();
    const displayNameCounts = new Map<string, number>();

    // First pass: count displayNames for ambiguity detection
    for (const block of patch.blocks.values()) {
      if (block.displayName) {
        displayNameCounts.set(
          block.displayName,
          (displayNameCounts.get(block.displayName) ?? 0) + 1
        );
      }
    }

    // Second pass: build indices
    for (const [blockId, block] of patch.blocks) {
      const blockDef = requireBlockDef(block.type);

      // Block address
      const blockAddr: CanonicalAddress = { kind: 'block', blockId };
      byCanonical.set(addressToString(blockAddr), { kind: 'block', block });

      // Output addresses
      for (const [portId, port] of block.outputPorts) {
        const addr: CanonicalAddress = { kind: 'output', blockId, portId: portId as PortId };
        const outputDef = blockDef.outputs[portId];
        if (outputDef) {
          byCanonical.set(addressToString(addr), {
            kind: 'output', block, port, type: outputDef.type
          });

          // Alias (only if displayName is unambiguous)
          const alias = block.displayName && displayNameCounts.get(block.displayName) === 1
            ? `${block.displayName}.${portId}`
            : `${blockId}.${portId}`;
          byAlias.set(alias, addr);
        }
      }

      // Input addresses (similar pattern)
      for (const [portId, port] of block.inputPorts) {
        const addr: CanonicalAddress = { kind: 'input', blockId, portId: portId as PortId };
        const inputDef = blockDef.inputs[portId];
        if (inputDef) {
          byCanonical.set(addressToString(addr), {
            kind: 'input', block, port, type: inputDef.type
          });
        }
      }
    }

    return new AddressRegistry(byCanonical, byAlias);
  }

  resolve(address: string): ResolvedAddress | null {
    return this.byCanonical.get(address) ?? null;
  }

  resolveAlias(alias: string): CanonicalAddress | null {
    return this.byAlias.get(alias) ?? null;
  }
}
```

## Export from Index

Add to `src/types/index.ts`:

```typescript
// Canonical Address System
export type { CanonicalAddress, ResolvedAddress } from './canonical-address';
export {
  addressToString,
  parseAddress,
  isBlockAddress,
  isOutputAddress,
  isInputAddress,
  isParamAddress,
  getBlockAddress,
  getOutputAddress,
  getInputAddress,
  getAllAddresses,
  resolveAddress,
  resolveAlias,
  AddressRegistry,
} from './canonical-address';
```

## Test File Structure

`src/types/__tests__/canonical-address.test.ts`:

```typescript
describe('CanonicalAddress', () => {
  describe('addressToString', () => {
    it('formats block address');
    it('formats output address');
    it('formats input address');
    it('formats param address');
  });

  describe('parseAddress', () => {
    it('parses block address');
    it('parses output address');
    it('returns null for invalid format');
    it('roundtrips with addressToString');
  });

  describe('type guards', () => {
    it('isBlockAddress returns true for block');
    it('isOutputAddress returns true for output');
    // ...
  });

  describe('getAllAddresses', () => {
    it('returns all addresses for a patch');
    it('handles empty patch');
  });

  describe('resolveAddress', () => {
    it('resolves valid output address');
    it('returns null for missing block');
    it('returns null for missing port');
  });

  describe('resolveAlias', () => {
    it('resolves by displayName');
    it('falls back to blockId');
    it('returns null for ambiguous displayName');
  });

  describe('AddressRegistry', () => {
    it('builds from patch');
    it('resolves canonical addresses');
    it('resolves aliases');
    it('handles duplicate displayNames');
  });
});
```

## Adjacent Code Patterns

### Pattern: Branded Types (from src/types/index.ts:124-136)

```typescript
declare const BlockIdBrand: unique symbol;
export type BlockId = string & { readonly [BlockIdBrand]: never };

export function blockId(s: string): BlockId {
  return s as BlockId;
}
```

Follow this pattern for any new branded string types if needed.

### Pattern: Registry Lookup (from src/blocks/registry.ts:312-326)

```typescript
export function requireBlockDef(blockType: string): BlockDef {
  const def = registry.get(blockType);
  if (!def) {
    throw new Error(`Unknown block type: "${blockType}" is not registered`);
  }
  return def;
}
```

Use `requireBlockDef` for type lookups, handle the throw at call sites if needed.

### Pattern: Discriminated Union (from src/types/index.ts:315-321)

```typescript
export type BlockRole =
  | { readonly kind: 'user';      readonly meta: UserBlockMeta }
  | { readonly kind: 'timeRoot';  readonly meta: TimeRootMeta }
  // ...
```

Follow this exact discriminated union pattern with `kind` as discriminant.
