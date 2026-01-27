# Implementation Context: Library Core Sprint
Generated: 2026-01-27T14:53:00Z

## Key Files to Create

### `src/blocks/composites/schema.ts`

```typescript
import { z } from 'zod';

const InternalBlockSchema = z.object({
  type: z.string(),
  params: z.record(z.unknown()).optional(),
  displayName: z.string().optional(),
});

const InternalEdgeSchema = z.object({
  from: z.tuple([z.string(), z.string()]),  // [blockId, portId]
  to: z.tuple([z.string(), z.string()]),
});

const ExposedPortSchema = z.object({
  external: z.string(),
  internal: z.tuple([z.string(), z.string()]),  // [blockId, portId]
  label: z.string().optional(),
});

export const CompositeDefJSONSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  type: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Must be valid identifier'),
  label: z.string().min(1, 'Label required'),
  category: z.string().min(1, 'Category required'),
  description: z.string().optional(),
  internalBlocks: z.record(InternalBlockSchema).refine(
    obj => Object.keys(obj).length > 0,
    'Must have at least one internal block'
  ),
  internalEdges: z.array(InternalEdgeSchema),
  exposedInputs: z.array(ExposedPortSchema),
  exposedOutputs: z.array(ExposedPortSchema),
}).refine(
  def => def.exposedInputs.length > 0 || def.exposedOutputs.length > 0,
  'Must expose at least one port'
);

export type CompositeDefJSON = z.infer<typeof CompositeDefJSONSchema>;
export type InternalBlockJSON = z.infer<typeof InternalBlockSchema>;
export type InternalEdgeJSON = z.infer<typeof InternalEdgeSchema>;
export type ExposedPortJSON = z.infer<typeof ExposedPortSchema>;
```

### `src/blocks/composites/loader.ts`

```typescript
import type { CompositeBlockDef, InternalBlockId, InternalBlockDef, InternalEdge, ExposedInputPort, ExposedOutputPort } from '../composite-types';
import { internalBlockId } from '../composite-types';
import { CompositeDefJSONSchema, type CompositeDefJSON } from './schema';
import { getBlockDefinition, type Capability } from '../registry';

export interface LoadResult<T> {
  ok: true;
  value: T;
} | {
  ok: false;
  errors: string[];
}

export function parseCompositeJSON(data: unknown): LoadResult<CompositeDefJSON> {
  const result = CompositeDefJSONSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const errors = result.error.errors.map(e =>
    `${e.path.join('.')}: ${e.message}`
  );
  return { ok: false, errors };
}

export function jsonToCompositeBlockDef(json: CompositeDefJSON): CompositeBlockDef {
  // Convert internalBlocks Record to Map
  const internalBlocks = new Map<InternalBlockId, InternalBlockDef>();
  for (const [id, block] of Object.entries(json.internalBlocks)) {
    internalBlocks.set(internalBlockId(id), {
      type: block.type,
      params: block.params,
      displayName: block.displayName,
    });
  }

  // Convert edges
  const internalEdges: InternalEdge[] = json.internalEdges.map(e => ({
    fromBlock: internalBlockId(e.from[0]),
    fromPort: e.from[1],
    toBlock: internalBlockId(e.to[0]),
    toPort: e.to[1],
  }));

  // Convert exposed ports
  const exposedInputs: ExposedInputPort[] = json.exposedInputs.map(e => ({
    externalId: e.external,
    internalBlockId: internalBlockId(e.internal[0]),
    internalPortId: e.internal[1],
  }));

  const exposedOutputs: ExposedOutputPort[] = json.exposedOutputs.map(e => ({
    externalId: e.external,
    internalBlockId: internalBlockId(e.internal[0]),
    internalPortId: e.internal[1],
  }));

  // Compute capability from internal blocks
  let capability: Capability = 'pure';
  for (const block of internalBlocks.values()) {
    const def = getBlockDefinition(block.type);
    if (def?.capability === 'state') { capability = 'state'; break; }
    if (def?.capability === 'render' && capability === 'pure') capability = 'render';
    if (def?.capability === 'io' && capability === 'pure') capability = 'io';
  }

  return {
    type: json.type,
    form: 'composite',
    label: json.label,
    category: json.category,
    capability,
    description: json.description,
    internalBlocks,
    internalEdges,
    exposedInputs,
    exposedOutputs,
    inputs: {},   // Computed by registry on register
    outputs: {},  // Computed by registry on register
  };
}

export function loadCompositeFromJSON(jsonString: string): LoadResult<CompositeBlockDef> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return { ok: false, errors: [`Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`] };
  }

  const validated = parseCompositeJSON(parsed);
  if (!validated.ok) {
    return validated;
  }

  return { ok: true, value: jsonToCompositeBlockDef(validated.value) };
}

export function compositeDefToJSON(def: CompositeBlockDef): CompositeDefJSON {
  const internalBlocks: Record<string, { type: string; params?: Record<string, unknown>; displayName?: string }> = {};
  for (const [id, block] of def.internalBlocks) {
    internalBlocks[id] = {
      type: block.type,
      params: block.params,
      displayName: block.displayName,
    };
  }

  return {
    version: 1,
    type: def.type,
    label: def.label,
    category: def.category,
    description: def.description,
    internalBlocks,
    internalEdges: def.internalEdges.map(e => ({
      from: [e.fromBlock, e.fromPort],
      to: [e.toBlock, e.toPort],
    })),
    exposedInputs: def.exposedInputs.map(e => ({
      external: e.externalId,
      internal: [e.internalBlockId, e.internalPortId],
    })),
    exposedOutputs: def.exposedOutputs.map(e => ({
      external: e.externalId,
      internal: [e.internalBlockId, e.internalPortId],
    })),
  };
}
```

### `src/blocks/composites/persistence.ts`

```typescript
import type { CompositeDefJSON } from './schema';

const STORAGE_KEY = 'oscilla-user-composites-v1';

interface StorageSchema {
  version: 1;
  composites: Record<string, StoredComposite>;
}

export interface StoredComposite {
  json: CompositeDefJSON;
  createdAt: string;
  updatedAt: string;
}

export class CompositeStorage {
  load(): Map<string, StoredComposite> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();

    try {
      const data = JSON.parse(raw) as StorageSchema;
      if (data.version !== 1) {
        console.warn('Unknown storage version, starting fresh');
        return new Map();
      }
      return new Map(Object.entries(data.composites));
    } catch (e) {
      console.warn('Failed to load user composites:', e);
      return new Map();
    }
  }

  save(composites: Map<string, StoredComposite>): boolean {
    const data: StorageSchema = {
      version: 1,
      composites: Object.fromEntries(composites),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Failed to save composites (quota exceeded?):', e);
      return false;
    }
  }

  add(json: CompositeDefJSON): boolean {
    const composites = this.load();
    const now = new Date().toISOString();
    const existing = composites.get(json.type);

    composites.set(json.type, {
      json,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    return this.save(composites);
  }

  remove(type: string): boolean {
    const composites = this.load();
    if (!composites.has(type)) return true;
    composites.delete(type);
    return this.save(composites);
  }

  exportSingle(type: string): string | null {
    const composites = this.load();
    const stored = composites.get(type);
    if (!stored) return null;
    return JSON.stringify(stored.json, null, 2);
  }

  exportAll(): string {
    const composites = this.load();
    const bundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      composites: Object.fromEntries(
        Array.from(composites.entries()).map(([k, v]) => [k, v.json])
      ),
    };
    return JSON.stringify(bundle, null, 2);
  }
}

// Singleton instance for app-wide use
export const compositeStorage = new CompositeStorage();
```

## Integration with CompositeEditorStore

In `src/stores/CompositeEditorStore.ts`, update the `save()` method:

```typescript
import { compositeStorage } from '../blocks/composites/persistence';
import { compositeDefToJSON } from '../blocks/composites/loader';

save(): CompositeBlockDef | null {
  if (!this.canSave) return null;

  const def = this.buildCompositeDef();
  if (!def) return null;

  // Unregister old if renaming
  if (this.compositeId && this.compositeId !== this.metadata.name) {
    try {
      unregisterComposite(this.compositeId);
      compositeStorage.remove(this.compositeId);  // NEW
    } catch { /* ignore */ }
  }

  try {
    registerComposite(def);

    // NEW: Persist to localStorage
    const json = compositeDefToJSON(def);
    if (!compositeStorage.add(json)) {
      console.warn('Failed to persist composite to storage');
    }

    this.isDirty = false;
    this.compositeId = def.type;
    return def;
  } catch (err) {
    console.error('Failed to register composite:', err);
    return null;
  }
}
```

## Testing Approach

```typescript
// src/blocks/composites/__tests__/schema.test.ts
describe('CompositeDefJSONSchema', () => {
  it('accepts valid composite', () => {
    const valid = {
      version: 1,
      type: 'MyComposite',
      label: 'My Composite',
      category: 'user',
      internalBlocks: { a: { type: 'Noise' } },
      internalEdges: [],
      exposedInputs: [],
      exposedOutputs: [{ external: 'out', internal: ['a', 'out'] }],
    };
    expect(parseCompositeJSON(valid).ok).toBe(true);
  });

  it('rejects empty internalBlocks', () => {
    const invalid = { ...valid, internalBlocks: {} };
    const result = parseCompositeJSON(invalid);
    expect(result.ok).toBe(false);
  });
});
```
