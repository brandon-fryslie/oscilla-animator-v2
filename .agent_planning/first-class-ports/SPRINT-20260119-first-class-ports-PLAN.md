# Sprint: First-Class Ports

**Generated**: 2026-01-19
**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Make ports first-class citizens. Blocks have `inputPorts` and `outputPorts` maps where each port is an object with per-instance properties (starting with `defaultSource`).

---

## Deliverables

1. `InputPort` and `OutputPort` interfaces
2. Port maps on Block interface
3. Port lifecycle in PatchStore (create with block, mutation API)
4. Pass1 reads port.defaultSource with registry fallback
5. BlockInspector edits port.defaultSource

---

## Work Items

### P0: Define Port Types

**File**: `src/graph/Patch.ts`

```typescript
export interface InputPort {
  readonly id: string;  // slotId from registry
  readonly defaultSource?: DefaultSource;  // Per-instance override (undefined = use registry)
}

export interface OutputPort {
  readonly id: string;  // slotId from registry
}
```

**Acceptance Criteria**:
- [ ] InputPort interface defined
- [ ] OutputPort interface defined
- [ ] Types exported from Patch.ts

---

### P0: Add Port Maps to Block

**File**: `src/graph/Patch.ts`

```typescript
export interface Block {
  readonly id: BlockId;
  readonly type: BlockType;
  readonly params: Readonly<Record<string, unknown>>;
  readonly displayName: string | null;
  readonly domainId: string | null;
  readonly role: BlockRole;
  readonly inputPorts: ReadonlyMap<string, InputPort>;   // NEW
  readonly outputPorts: ReadonlyMap<string, OutputPort>; // NEW
}
```

**Acceptance Criteria**:
- [ ] Block has `inputPorts: ReadonlyMap<string, InputPort>`
- [ ] Block has `outputPorts: ReadonlyMap<string, OutputPort>`
- [ ] TypeScript compiles

---

### P0: Port Lifecycle in PatchStore

**File**: `src/stores/PatchStore.ts`

When creating a block, create its ports from registry:

```typescript
addBlock(type: BlockType, params = {}, options = {}): BlockId {
  const id = this.generateBlockId();
  const blockDef = getBlockDefinition(type);

  // Create input ports from registry
  const inputPorts = new Map<string, InputPort>();
  for (const inputDef of blockDef.inputs) {
    inputPorts.set(inputDef.id, { id: inputDef.id });
  }

  // Create output ports from registry
  const outputPorts = new Map<string, OutputPort>();
  for (const outputDef of blockDef.outputs) {
    outputPorts.set(outputDef.id, { id: outputDef.id });
  }

  const block: Block = {
    id,
    type,
    params,
    inputPorts,
    outputPorts,
    displayName: options.displayName ?? null,
    domainId: options.domainId ?? null,
    role: options.role ?? { kind: 'user' },
  };

  this.patchData.blocks.set(id, block);
  return id;
}
```

When deleting a block, ports go with it (nested, automatic).

**Acceptance Criteria**:
- [ ] `addBlock()` creates inputPorts from registry
- [ ] `addBlock()` creates outputPorts from registry
- [ ] Ports deleted when block deleted (implicit)
- [ ] TypeScript compiles

---

### P0: Add Port Mutation API

**File**: `src/stores/PatchStore.ts`

```typescript
updateInputPort(blockId: BlockId, portId: string, updates: Partial<InputPort>): void {
  const block = this.patchData.blocks.get(blockId);
  if (!block) throw new Error(`Block ${blockId} not found`);

  const port = block.inputPorts.get(portId);
  if (!port) throw new Error(`Port ${portId} not found on block ${blockId}`);

  // Update port
  const updatedPort: InputPort = { ...port, ...updates };
  const updatedInputPorts = new Map(block.inputPorts);
  updatedInputPorts.set(portId, updatedPort);

  // Update block with new ports map
  this.patchData.blocks.set(blockId, {
    ...block,
    inputPorts: updatedInputPorts,
  });

  this.touch();
}
```

**Acceptance Criteria**:
- [ ] `updateInputPort(blockId, portId, updates)` exists
- [ ] Updates port.defaultSource correctly
- [ ] Marks patch dirty
- [ ] TypeScript compiles

---

### P0: Update Pass1 to Read Port DefaultSource

**File**: `src/graph/passes/pass1-default-sources.ts`

```typescript
// For each unconnected input
const registryDefault = inputDef.defaultSource;
const portOverride = block.inputPorts.get(inputDef.id)?.defaultSource;
const effectiveDefault = portOverride ?? registryDefault;

if (effectiveDefault) {
  // Create derived block using effectiveDefault.blockType and effectiveDefault.params
}
```

**Acceptance Criteria**:
- [ ] Pass1 checks `block.inputPorts.get(portId)?.defaultSource` first
- [ ] Falls back to `inputDef.defaultSource` if undefined
- [ ] Derived blocks use effective blockType and params
- [ ] Compilation works with and without overrides

---

### P1: BlockInspector UI for Editing DefaultSource

**File**: `src/ui/components/BlockInspector.tsx`

For unconnected input ports, show UI to:
1. Select default source block type (dropdown)
2. Edit params for selected block type

```typescript
// Get effective defaultSource
const port = block.inputPorts.get(portId);
const registryDefault = inputDef.defaultSource;
const effectiveDefault = port?.defaultSource ?? registryDefault;

// On change
const handleDefaultSourceChange = (newDefault: DefaultSource) => {
  rootStore.patch.updateInputPort(blockId, portId, { defaultSource: newDefault });
};
```

**Acceptance Criteria**:
- [ ] Shows default source editor for unconnected inputs
- [ ] Dropdown shows valid block types
- [ ] Params editor for selected type
- [ ] Changes call `updateInputPort()`
- [ ] Visual output updates on change

---

### P1: Validation - Valid Default Source Block Types

```typescript
function getValidDefaultSourceBlockTypes(portType: CanonicalType): string[] {
  const registry = getBlockRegistry();
  return Object.entries(registry)
    .filter(([_, def]) => {
      // Must not be stateful
      if (def.capability === 'state') return false;
      // Must have outputs
      if (def.outputs.length === 0) return false;
      // Output type must be compatible
      return isTypeCompatible(def.outputs[0].type, portType);
    })
    .map(([name]) => name)
    .sort();
}
```

**Acceptance Criteria**:
- [ ] Function returns valid block types
- [ ] Excludes stateful blocks
- [ ] Excludes type-incompatible blocks
- [ ] UI dropdown uses this list

---

## Dependencies

- Block registry must be available (exists)
- DefaultSource type exists (src/types/index.ts)
- PatchStore mutation infrastructure (exists)

---

## Risks

| Risk | Mitigation |
|------|------------|
| TypeScript errors from Block change | Fix type errors incrementally |
| Migration breaks old patches | Test with existing patches |
| Performance with many ports | Lazy - ports are lightweight objects |

---

## Testing Strategy

**Unit Tests**:
- Port creation on block add
- Port mutation via updateInputPort
- Migration of old patches
- Pass1 reads port overrides

**Integration Tests**:
- Full flow: add block → edit defaultSource → compile → render
- Load old patch → migrate → works correctly

**Manual Testing**:
1. Load app
2. Add block with unconnected input
3. Edit defaultSource in inspector
4. Verify visual output changes
5. Save/reload, verify persistence
