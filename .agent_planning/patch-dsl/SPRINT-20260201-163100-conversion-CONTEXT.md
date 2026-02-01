# Implementation Context: Conversion

## Goal
An agent with ONLY this file can implement the conversion sprint (serialize, deserialize, equality, API).

## Module Structure
```
src/patch-dsl/
  serialize.ts              # Patch → HCL (this sprint)
  patch-to-hcl.ts          # HCL emitter helpers (this sprint)
  deserialize.ts           # HCL → Patch orchestrator (this sprint)
  patch-from-ast.ts        # AST → Patch resolution (this sprint)
  equality.ts              # Deep equality for testing (this sprint)
  index.ts                 # Public API (this sprint)
  __tests__/
    serialize.test.ts      # Serializer tests (this sprint)
    deserialize.test.ts    # Deserializer tests (this sprint)
    equality.test.ts       # Equality tests (this sprint)
```

## Patch Type Structure (Reference)

**From `/Users/bmf/code/oscilla-animator-v2/src/graph/Patch.ts`:**

```typescript
interface Patch {
  readonly blocks: ReadonlyMap<BlockId, Block>;
  readonly edges: readonly Edge[];
}

interface Block {
  readonly id: BlockId;                          // Branded string
  readonly type: string;                         // Block type (from registry)
  readonly params: Readonly<Record<string, unknown>>;
  readonly displayName: string;                  // User-editable name
  readonly domainId: string | null;              // Reference to domain block
  readonly role: BlockRole;                      // Semantic role
  readonly inputPorts: ReadonlyMap<string, InputPort>;
  readonly outputPorts: ReadonlyMap<string, OutputPort>;
}

interface InputPort {
  readonly id: string;
  readonly defaultSource?: DefaultSource;        // Per-instance override
  readonly combineMode: CombineMode;             // 'last' | 'sum' | 'product' | 'min' | 'max'
  readonly varargConnections?: readonly VarargConnection[];  // For vararg inputs
  readonly lenses?: readonly LensAttachment[];   // Per-connection lenses
}

interface OutputPort {
  readonly id: string;
  readonly lenses?: readonly LensAttachment[];   // Future: output lenses
}

interface Edge {
  readonly id: string;
  readonly from: Endpoint;                       // { kind: 'port', blockId, slotId }
  readonly to: Endpoint;
  readonly enabled: boolean;
  readonly sortKey: number;                      // For combine ordering
  readonly role: EdgeRole;                       // { kind: 'user' | 'derived', ... }
}

interface Endpoint {
  readonly kind: 'port';
  readonly blockId: string;
  readonly slotId: string;
}

interface VarargConnection {
  readonly sourceAddress: string;  // "blocks.<blockId>.outputs.<portId>"
  readonly alias?: string;
  readonly sortKey: number;
}

interface LensAttachment {
  readonly id: string;
  readonly lensType: string;       // Block type (e.g., 'Adapter_DegreesToRadians')
  readonly sourceAddress: string;  // "v1:blocks.<block>.outputs.<port>"
  readonly params?: Record<string, unknown>;
  readonly sortKey: number;
}

type BlockRole = { kind: 'user' } | { kind: 'time_root' } | { kind: 'domain' } | ...
type EdgeRole = { kind: 'user' } | { kind: 'derived', source: string } | ...
```

**Key imports:**
```typescript
import type { Patch, Block, Edge, Endpoint } from '../graph/Patch';
import type { BlockId, PortId, BlockRole, EdgeRole, CombineMode, DefaultSource } from '../types';
```

---

## File 1: serialize.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/serialize.ts`

**Imports:**
```typescript
import type { Patch, Block, Edge } from '../graph/Patch';
import { normalizeCanonicalName, detectCanonicalNameCollisions } from '../core/canonical-name';
```

**Main function signature:**
```typescript
export function serializePatchToHCL(patch: Patch, options?: { name?: string }): string
```

**Algorithm:**

1. **Build block name map** (handle collisions):
```typescript
function buildBlockNameMap(patch: Patch): Map<BlockId, string> {
  const nameMap = new Map<BlockId, string>();
  const usedNames = new Set<string>();

  // Sort blocks by display name for deterministic output
  const sortedBlocks = Array.from(patch.blocks.values())
    .sort((a, b) => normalizeCanonicalName(a.displayName).localeCompare(normalizeCanonicalName(b.displayName)));

  for (const block of sortedBlocks) {
    let candidate = block.displayName;
    let suffix = 2;

    // Check for canonical name collisions
    while (usedNames.has(normalizeCanonicalName(candidate))) {
      candidate = `${block.displayName}_${suffix}`;
      suffix++;
    }

    nameMap.set(block.id, candidate);
    usedNames.add(normalizeCanonicalName(candidate));
  }

  return nameMap;
}
```

2. **Emit patch header:**
```typescript
const patchName = options?.name ?? 'Untitled';
let output = `patch "${patchName}" {\n`;
```

3. **Emit blocks** (sorted by canonical name):
```typescript
const blockNameMap = buildBlockNameMap(patch);
const sortedBlocks = Array.from(patch.blocks.values())
  .sort((a, b) => normalizeCanonicalName(blockNameMap.get(a.id)!).localeCompare(normalizeCanonicalName(blockNameMap.get(b.id)!)));

for (const block of sortedBlocks) {
  output += emitBlock(block, blockNameMap, 1);  // indent level 1
}
```

4. **Emit edges** (skip derived edges, sorted by sortKey):
```typescript
const userEdges = patch.edges.filter(e => e.role.kind === 'user');
const sortedEdges = [...userEdges].sort((a, b) => a.sortKey - b.sortKey);

for (const edge of sortedEdges) {
  output += emitEdge(edge, blockNameMap, 1);
}

output += '}\n';
return output;
```

**Helper: emitBlock**
```typescript
function emitBlock(block: Block, nameMap: Map<BlockId, string>, indent: number): string {
  const ind = '  '.repeat(indent);
  const blockName = nameMap.get(block.id)!;

  let output = `${ind}block "${block.type}" "${blockName}" {\n`;

  // Emit params (sorted by key)
  const paramKeys = Object.keys(block.params).sort();
  for (const key of paramKeys) {
    output += `${ind}  ${key} = ${emitValue(block.params[key])}\n`;
  }

  // Emit role (if not 'user')
  if (block.role.kind !== 'user') {
    output += `${ind}  role = "${block.role.kind}"\n`;
  }

  // Emit domain (if non-null)
  if (block.domainId !== null) {
    output += `${ind}  domain = "${block.domainId}"\n`;
  }

  // Emit port overrides (combineMode, defaultSource)
  for (const [portId, port] of Array.from(block.inputPorts.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    if (port.combineMode !== 'last' || port.defaultSource) {
      output += emitPortOverride(portId, port, indent + 1);
    }
  }

  // Emit varargs
  for (const [portId, port] of Array.from(block.inputPorts.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    if (port.varargConnections && port.varargConnections.length > 0) {
      output += emitVarargConnections(portId, port.varargConnections, indent + 1);
    }
  }

  // Emit lenses
  for (const [portId, port] of Array.from(block.inputPorts.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    if (port.lenses && port.lenses.length > 0) {
      output += emitLenses(portId, port.lenses, indent + 1);
    }
  }

  output += `${ind}}\n\n`;
  return output;
}
```

**Helper: emitValue** (for HclValue serialization)
```typescript
function emitValue(value: unknown): string {
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`;
  if (typeof value === 'boolean') return value.toString();
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map(emitValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k} = ${emitValue(v)}`)
      .join(', ');
    return `{ ${entries} }`;
  }
  return 'null';  // Fallback
}
```

**Helper: emitEdge**
```typescript
function emitEdge(edge: Edge, nameMap: Map<BlockId, string>, indent: number): string {
  const ind = '  '.repeat(indent);
  const fromBlock = nameMap.get(edge.from.blockId)!;
  const toBlock = nameMap.get(edge.to.blockId)!;

  let output = `${ind}connect {\n`;
  output += `${ind}  from = ${fromBlock}.${edge.from.slotId}\n`;
  output += `${ind}  to = ${toBlock}.${edge.to.slotId}\n`;

  if (!edge.enabled) {
    output += `${ind}  enabled = false\n`;
  }

  output += `${ind}}\n\n`;
  return output;
}
```

---

## File 2: deserialize.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/deserialize.ts`

**Imports:**
```typescript
import type { Patch } from '../graph/Patch';
import { tokenize } from './lexer';
import { parse } from './parser';
import { patchFromAst } from './patch-from-ast';
import type { PatchDslError, PatchDslWarning } from './errors';
```

**Main function:**
```typescript
export interface DeserializeResult {
  readonly patch: Patch;
  readonly errors: PatchDslError[];
  readonly warnings: PatchDslWarning[];
}

export function deserializePatchFromHCL(hcl: string): DeserializeResult {
  // Phase 1: Lex + Parse
  const tokens = tokenize(hcl);
  const parseResult = parse(tokens);
  const errors: PatchDslError[] = [...parseResult.errors];
  const warnings: PatchDslWarning[] = [];

  // Phase 2: AST → Patch
  const result = patchFromAst(parseResult.document);
  errors.push(...result.errors);
  warnings.push(...result.warnings);

  return {
    patch: result.patch,
    errors,
    warnings,
  };
}
```

---

## File 3: patch-from-ast.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/patch-from-ast.ts`

**Imports:**
```typescript
import type { Patch, Block, Edge, Endpoint, InputPort, OutputPort } from '../graph/Patch';
import type { HclDocument, HclBlock, HclValue } from './ast';
import { PatchDslError, PatchDslWarning } from './errors';
import { normalizeCanonicalName } from '../core/canonical-name';
import { requireBlockDef } from '../blocks/registry';
import type { BlockId } from '../types';
```

**Main function:**
```typescript
export interface PatchFromAstResult {
  readonly patch: Patch;
  readonly errors: PatchDslError[];
  readonly warnings: PatchDslWarning[];
}

export function patchFromAst(document: HclDocument): PatchFromAstResult {
  const errors: PatchDslError[] = [];
  const warnings: PatchDslWarning[] = [];

  // Extract blocks
  const blockMap = new Map<string, BlockId>();  // canonical name → BlockId
  const blocks = new Map<BlockId, Block>();

  for (const hclBlock of document.blocks.filter(b => b.type === 'block')) {
    const result = processBlock(hclBlock, blockMap, errors, warnings);
    if (result) {
      blocks.set(result.id, result);
    }
  }

  // Extract edges
  const edges: Edge[] = [];
  for (const hclBlock of document.blocks.filter(b => b.type === 'connect')) {
    const result = processEdge(hclBlock, blockMap, errors);
    if (result) {
      edges.push(result);
    }
  }

  const patch: Patch = { blocks, edges };
  return { patch, errors, warnings };
}
```

**Helper: processBlock**
```typescript
function processBlock(
  hclBlock: HclBlock,
  blockMap: Map<string, BlockId>,
  errors: PatchDslError[],
  warnings: PatchDslWarning[]
): Block | null {
  // Extract type and displayName from labels
  if (hclBlock.labels.length < 2) {
    errors.push(new PatchDslError('Block must have type and displayName labels', hclBlock.pos));
    return null;
  }

  const type = hclBlock.labels[0];
  const displayName = hclBlock.labels[1];

  // Generate BlockId
  const blockId = generateId() as BlockId;

  // Handle name collisions
  const canonicalName = normalizeCanonicalName(displayName);
  if (blockMap.has(canonicalName)) {
    let suffix = 2;
    let candidate = `${displayName}_${suffix}`;
    while (blockMap.has(normalizeCanonicalName(candidate))) {
      suffix++;
      candidate = `${displayName}_${suffix}`;
    }
    warnings.push(new PatchDslWarning(`Duplicate block name "${displayName}", renamed to "${candidate}"`, hclBlock.pos));
    blockMap.set(normalizeCanonicalName(candidate), blockId);
  } else {
    blockMap.set(canonicalName, blockId);
  }

  // Extract params (exclude reserved: role, domain)
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(hclBlock.attributes)) {
    if (key !== 'role' && key !== 'domain') {
      params[key] = convertHclValue(value);
    }
  }

  // Extract role
  const roleAttr = hclBlock.attributes.role;
  const role = roleAttr ? { kind: convertHclValue(roleAttr) as string } : { kind: 'user' };

  // Extract domain
  const domainIdAttr = hclBlock.attributes.domain;
  const domainId = domainIdAttr ? convertHclValue(domainIdAttr) as string : null;

  // Build ports (from registry defaults + overrides from nested port blocks)
  const blockDef = requireBlockDef(type);
  const inputPorts = new Map<string, InputPort>();
  const outputPorts = new Map<string, OutputPort>();

  // TODO: Extract port overrides from nested `port` blocks
  // TODO: Extract varargs from nested `vararg` blocks
  // TODO: Extract lenses from nested `lens` blocks

  const block: Block = {
    id: blockId,
    type,
    params,
    displayName,
    domainId,
    role: role as any,  // Type assertion for simplicity
    inputPorts,
    outputPorts,
  };

  return block;
}
```

**Helper: processEdge**
```typescript
function processEdge(
  hclBlock: HclBlock,
  blockMap: Map<string, BlockId>,
  errors: PatchDslError[]
): Edge | null {
  const fromAttr = hclBlock.attributes.from;
  const toAttr = hclBlock.attributes.to;

  if (!fromAttr || !toAttr) {
    errors.push(new PatchDslError('connect block must have from and to attributes', hclBlock.pos));
    return null;
  }

  const from = resolveReference(fromAttr, blockMap);
  const to = resolveReference(toAttr, blockMap);

  if (!from) {
    errors.push(new PatchDslError(`Unresolved from reference: ${JSON.stringify(fromAttr)}`, hclBlock.pos));
    return null;
  }

  if (!to) {
    errors.push(new PatchDslError(`Unresolved to reference: ${JSON.stringify(toAttr)}`, hclBlock.pos));
    return null;
  }

  const enabled = hclBlock.attributes.enabled ? convertHclValue(hclBlock.attributes.enabled) as boolean : true;

  const edge: Edge = {
    id: generateId(),
    from,
    to,
    enabled,
    sortKey: 0,  // TODO: Assign based on edge order
    role: { kind: 'user' },
  };

  return edge;
}
```

**Helper: resolveReference**
```typescript
function resolveReference(value: HclValue, blockMap: Map<string, BlockId>): Endpoint | null {
  if (value.kind !== 'reference') return null;
  if (value.parts.length !== 2) return null;

  const [blockName, portName] = value.parts;
  const blockId = blockMap.get(normalizeCanonicalName(blockName));

  if (!blockId) return null;

  return {
    kind: 'port',
    blockId,
    slotId: portName,
  };
}
```

**Helper: convertHclValue**
```typescript
function convertHclValue(value: HclValue): unknown {
  switch (value.kind) {
    case 'number': return value.value;
    case 'string': return value.value;
    case 'bool': return value.value;
    case 'reference': return value.parts.join('.');  // Convert to string
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value.entries)) {
        obj[k] = convertHclValue(v);
      }
      return obj;
    }
    case 'list': return value.items.map(convertHclValue);
  }
}
```

**Helper: generateId**
```typescript
let idCounter = 0;
function generateId(): string {
  return `id_${Date.now()}_${idCounter++}`;
}
```

---

## File 4: equality.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/equality.ts`

**Imports:**
```typescript
import type { Patch, Block, Edge, Endpoint, InputPort, OutputPort } from '../graph/Patch';
```

**Main function:**
```typescript
export function patchesEqual(a: Patch, b: Patch): boolean {
  // Compare block counts
  if (a.blocks.size !== b.blocks.size) return false;

  // Compare blocks (order-insensitive)
  for (const [id, blockA] of a.blocks) {
    const blockB = b.blocks.get(id);
    if (!blockB || !blocksEqual(blockA, blockB)) return false;
  }

  // Compare edges (order-sensitive after sorting by sortKey)
  const edgesA = [...a.edges].sort((x, y) => x.sortKey - y.sortKey);
  const edgesB = [...b.edges].sort((x, y) => x.sortKey - y.sortKey);
  if (edgesA.length !== edgesB.length) return false;
  for (let i = 0; i < edgesA.length; i++) {
    if (!edgesEqual(edgesA[i], edgesB[i])) return false;
  }

  return true;
}

function blocksEqual(a: Block, b: Block): boolean {
  return a.id === b.id
    && a.type === b.type
    && a.displayName === b.displayName
    && a.domainId === b.domainId
    && deepEqual(a.params, b.params)
    && rolesEqual(a.role, b.role)
    && portsEqual(a.inputPorts, b.inputPorts)
    && portsEqual(a.outputPorts, b.outputPorts);
}

function edgesEqual(a: Edge, b: Edge): boolean {
  return a.id === b.id
    && endpointsEqual(a.from, b.from)
    && endpointsEqual(a.to, b.to)
    && a.enabled === b.enabled
    && a.sortKey === b.sortKey
    && rolesEqual(a.role, b.role);
}

function endpointsEqual(a: Endpoint, b: Endpoint): boolean {
  return a.kind === b.kind
    && a.blockId === b.blockId
    && a.slotId === b.slotId;
}

function rolesEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function portsEqual(a: ReadonlyMap<string, any>, b: ReadonlyMap<string, any>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, portA] of a) {
    const portB = b.get(id);
    if (!portB || !deepEqual(portA, portB)) return false;
  }
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
```

---

## File 5: index.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/index.ts`

**Content:**
```typescript
// Public API for Patch DSL (HCL serialization/deserialization)

export { serializePatchToHCL } from './serialize';
export { deserializePatchFromHCL, type DeserializeResult } from './deserialize';
export { PatchDslError, PatchDslWarning } from './errors';
export { patchesEqual } from './equality';  // Testing utility

// Internal modules (ast, lexer, parser, patch-from-ast, patch-to-hcl) are NOT exported
```

---

## File 6: __tests__/serialize.test.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/__tests__/serialize.test.ts`

**Test structure:**
```typescript
import { describe, it, expect } from 'vitest';
import { serializePatchToHCL } from '../serialize';
import { PatchBuilder } from '../../graph/PatchBuilder';

describe('serialize', () => {
  it('serializes empty patch', () => {
    const patch = new PatchBuilder().build();
    const hcl = serializePatchToHCL(patch, { name: 'Empty' });
    expect(hcl).toContain('patch "Empty"');
    expect(hcl).toContain('{}');
  });

  it('serializes simple block', () => {
    const patch = new PatchBuilder()
      .addBlock('Ellipse', { rx: 0.02, ry: 0.02 }, { displayName: 'dot' })
      .build();
    const hcl = serializePatchToHCL(patch);
    expect(hcl).toContain('block "Ellipse" "dot"');
    expect(hcl).toContain('rx = 0.02');
    expect(hcl).toContain('ry = 0.02');
  });

  it('serializes edge', () => {
    const patch = new PatchBuilder()
      .addBlock('Const', {}, { displayName: 'a' })
      .addBlock('Const', {}, { displayName: 'b' })
      .connect('a.out', 'b.in')
      .build();
    const hcl = serializePatchToHCL(patch);
    expect(hcl).toContain('connect');
    expect(hcl).toContain('from = a.out');
    expect(hcl).toContain('to = b.in');
  });

  it('handles block name collisions', () => {
    const patch = new PatchBuilder()
      .addBlock('Const', {}, { displayName: 'foo' })
      .addBlock('Const', {}, { displayName: 'foo' })
      .build();
    const hcl = serializePatchToHCL(patch);
    expect(hcl).toContain('block "Const" "foo"');
    expect(hcl).toContain('block "Const" "foo_2"');
  });

  it('skips derived edges', () => {
    // TODO: Build patch with derived edge, verify it's not in output
  });

  // Add more: varargs, lenses, params, roles, domains, etc.
});
```

---

## File 7: __tests__/deserialize.test.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/__tests__/deserialize.test.ts`

**Test structure:**
```typescript
import { describe, it, expect } from 'vitest';
import { deserializePatchFromHCL } from '../deserialize';

describe('deserialize', () => {
  it('deserializes empty patch', () => {
    const hcl = 'patch "Empty" {}';
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors).toHaveLength(0);
    expect(result.patch.blocks.size).toBe(0);
    expect(result.patch.edges.length).toBe(0);
  });

  it('deserializes simple block', () => {
    const hcl = `
      patch "Test" {
        block "Ellipse" "dot" {
          rx = 0.02
          ry = 0.02
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors).toHaveLength(0);
    expect(result.patch.blocks.size).toBe(1);
    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.type).toBe('Ellipse');
    expect(block.displayName).toBe('dot');
    expect(block.params.rx).toBe(0.02);
  });

  it('deserializes edge', () => {
    const hcl = `
      patch "Test" {
        block "Const" "a" {}
        block "Const" "b" {}
        connect {
          from = a.out
          to = b.in
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors).toHaveLength(0);
    expect(result.patch.edges.length).toBe(1);
    expect(result.patch.edges[0].from.slotId).toBe('out');
    expect(result.patch.edges[0].to.slotId).toBe('in');
  });

  it('handles unresolvable references', () => {
    const hcl = `
      patch "Test" {
        connect {
          from = nonexistent.out
          to = missing.in
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.patch.edges.length).toBe(0);  // Edge skipped
  });

  it('handles duplicate block names', () => {
    const hcl = `
      patch "Test" {
        block "Const" "foo" {}
        block "Const" "foo" {}
      }
    `;
    const result = deserializePatchFromHCL(hcl);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.patch.blocks.size).toBe(2);
  });

  // Add more: malformed HCL, varargs, lenses, etc.
});
```

---

## File 8: __tests__/equality.test.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/__tests__/equality.test.ts`

**Test structure:**
```typescript
import { describe, it, expect } from 'vitest';
import { patchesEqual } from '../equality';
import { PatchBuilder } from '../../graph/PatchBuilder';

describe('equality', () => {
  it('compares identical patches', () => {
    const patch1 = new PatchBuilder()
      .addBlock('Const', { value: 42 }, { displayName: 'a' })
      .build();
    const patch2 = new PatchBuilder()
      .addBlock('Const', { value: 42 }, { displayName: 'a' })
      .build();
    // Note: BlockIds will differ, so this will fail unless we use same IDs
    // For round-trip testing, we serialize/deserialize, so IDs won't match
    // This test needs adjustment or we need to compare structurally ignoring IDs
  });

  it('detects different block counts', () => {
    const patch1 = new PatchBuilder().addBlock('Const', {}).build();
    const patch2 = new PatchBuilder().build();
    expect(patchesEqual(patch1, patch2)).toBe(false);
  });

  it('detects different params', () => {
    const patch1 = new PatchBuilder().addBlock('Const', { value: 1 }).build();
    const patch2 = new PatchBuilder().addBlock('Const', { value: 2 }).build();
    // Again, IDs differ...
  });

  // TODO: Adjust equality test to handle ID mismatches
  // Option: Compare structurally (type, params, displayName) ignoring IDs
  // Option: Use serializePatc hToHCL + string comparison
});
```

---

## Gotchas

1. **BlockId generation**: Deserializer generates new BlockIds. Round-trip tests can't use `===` for IDs. Use structural equality (type, displayName, params).

2. **Edge sortKey assignment**: Deserializer needs to assign sortKeys based on edge order in HCL. Use index in array: `edges[i].sortKey = i`.

3. **Name collision detection**: Use `normalizeCanonicalName()` for collision checks, not raw `displayName`.

4. **Derived edge filtering**: Only serialize edges where `edge.role.kind === 'user'`. Derived edges are normalization artifacts.

5. **Port overrides**: InputPort.combineMode defaults to `'last'`. Only emit `port` block if combineMode !== 'last' or defaultSource is set.

6. **Varargs and lenses**: These are nested blocks inside block definitions. Parser must handle nested blocks in body.

7. **Reserved attributes**: `role` and `domain` are NOT params. They're top-level block fields. Exclude them from params extraction.

8. **Empty collections**: Empty patch, empty params, empty edges are all valid. Don't require at least one element.

---

## Example HCL (For Testing)

**Simple patch:**
```hcl
patch "Golden Spiral" {
  block "Ellipse" "dot" {
    rx = 0.02
    ry = 0.02
  }

  block "Const" "color" {
    value = { r = 1.0, g = 0.5, b = 0.0, a = 1.0 }
  }

  block "RenderInstances2D" "render" {}

  connect {
    from = dot.shape
    to = render.shape
  }

  connect {
    from = color.out
    to = render.color
  }
}
```

**Expected Patch structure:**
- 3 blocks: Ellipse, Const, RenderInstances2D
- 2 edges: dot.shape → render.shape, color.out → render.color
- Params: dot has rx/ry, color has value (object), render has none
- All roles are 'user', all domainIds are null

---

## Execution Order

1. Implement serialize.ts + patch-to-hcl.ts helpers (3 hours)
   - Write emitBlock, emitEdge, emitValue helpers
   - Write buildBlockNameMap (collision handling)
   - Test with simple patches
2. Implement deserialize.ts + patch-from-ast.ts (4 hours)
   - Write processBlock, processEdge, resolveReference
   - Write convertHclValue helper
   - Test with simple HCL
3. Implement equality.ts (1 hour)
   - Write patchesEqual, blocksEqual, edgesEqual
   - Test with identical/different patches
4. Implement index.ts (15 min)
   - Export public API
5. Write tests (included in above estimates)
   - serialize.test.ts
   - deserialize.test.ts
   - equality.test.ts

---

## Success Criteria

- [ ] All TypeScript files compile with no errors
- [ ] `npx vitest run src/patch-dsl/__tests__/serialize.test.ts` — all tests pass
- [ ] `npx vitest run src/patch-dsl/__tests__/deserialize.test.ts` — all tests pass
- [ ] `npx vitest run src/patch-dsl/__tests__/equality.test.ts` — all tests pass
- [ ] Simple demo patch can be serialized to HCL and deserialized back
- [ ] Malformed HCL produces partial patch + error list (no exceptions thrown)
- [ ] API exports are clean and public
