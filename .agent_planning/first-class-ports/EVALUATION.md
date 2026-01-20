# First-Class Ports: Evaluation

**Date:** 2026-01-19
**Topic:** Ports as first-class citizens on Block instances

---

## Current State

**Ports are NOT first-class citizens.** They exist only as:
- Registry definitions (read-only metadata in `BlockDef`)
- String references in edges (`blockId + slotId`)
- Derived blocks for default sources (workaround)

**Block has no port storage:**
```typescript
export interface Block {
  readonly id: BlockId;
  readonly type: BlockType;
  readonly params: Readonly<Record<string, unknown>>;
  readonly displayName: string | null;
  readonly domainId: string | null;
  readonly role: BlockRole;
  // NO inputPorts or outputPorts
}
```

---

## What Needs to Change

### 1. Add Port Types

```typescript
export interface InputPort {
  readonly id: string;
  readonly defaultSource?: DefaultSource;  // Per-instance override
  // Future: label, constraints, uiHint overrides
}

export interface OutputPort {
  readonly id: string;
  // Future: label overrides
}
```

### 2. Add Port Maps to Block

```typescript
export interface Block {
  // ... existing fields
  readonly inputPorts: ReadonlyMap<string, InputPort>;
  readonly outputPorts: ReadonlyMap<string, OutputPort>;
}
```

### 3. Port Lifecycle in PatchStore

- Create ports when block created (from registry)
- Delete ports when block deleted (automatic - nested)
- Add `updateInputPort(blockId, portId, data)` mutation

### 4. Update Pass1

Read `block.inputPorts.get(portId)?.defaultSource` first, fall back to registry.

### 5. Update BlockInspector

Edit port properties directly via `updateInputPort()`.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/graph/Patch.ts` | Add InputPort, OutputPort, port maps to Block |
| `src/stores/PatchStore.ts` | Port lifecycle + `updateInputPort()` |
| `src/graph/passes/pass1-default-sources.ts` | Read port.defaultSource |
| `src/ui/components/BlockInspector.tsx` | Edit port properties |

---

## Migration

- Ports optional initially for backward compat
- Generate ports from registry when loading old patches
- Non-breaking rollout

---

## Verdict: CONTINUE

Clear path forward. No ambiguities blocking implementation.
