# Implementation Context: Library System Sprint
Generated: 2026-01-27T15:03:00Z

## Key Files to Create

### `src/blocks/composites/schema.ts`
Zod schema for composite JSON validation.

### `src/blocks/composites/loader.ts`
JSON loading and conversion utilities.

### `src/blocks/composites/persistence.ts`
localStorage persistence for user composites.

### `src/blocks/composites/library/index.ts`
Library composite definitions and registration.

### `src/blocks/composites/library/*.ts`
Individual library composite files.

## JSON Schema (Zod)

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
  type: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string(),
  category: z.string(),
  description: z.string().optional(),
  internalBlocks: z.record(InternalBlockSchema),
  internalEdges: z.array(InternalEdgeSchema),
  exposedInputs: z.array(ExposedPortSchema),
  exposedOutputs: z.array(ExposedPortSchema),
});

export type CompositeDefJSON = z.infer<typeof CompositeDefJSONSchema>;
```

## Library Composite Example

```typescript
// src/blocks/composites/library/smooth-noise.ts
import type { CompositeBlockDef } from '../composite-types';

export const SmoothNoiseComposite: CompositeBlockDef = {
  type: 'SmoothNoise',
  form: 'composite',
  label: 'Smooth Noise',
  category: 'composite',
  capability: 'pure',
  description: 'Generates smoothly varying noise by passing through a lag filter',
  readonly: true,  // Library composites are immutable

  internalBlocks: new Map([
    ['noise', { type: 'Noise' }],
    ['lag', { type: 'Lag' }],
  ]),

  internalEdges: [
    { fromBlock: 'noise', fromPort: 'out', toBlock: 'lag', toPort: 'target' },
  ],

  exposedInputs: [
    { externalId: 'seed', internalBlockId: 'noise', internalPortId: 'seed' },
    { externalId: 'rate', internalBlockId: 'lag', internalPortId: 'rate' },
  ],

  exposedOutputs: [
    { externalId: 'out', internalBlockId: 'lag', internalPortId: 'out' },
  ],

  // Computed from exposed ports
  inputs: { /* ... */ },
  outputs: { /* ... */ },
};
```

## Library Composites to Include

| Name | Description | Internal Blocks |
|------|-------------|-----------------|
| SmoothNoise | Smoothly varying random | Noise → Lag |
| PingPong | 0→1→0 triangle wave | Phasor → Abs(2*x-1) |
| ColorCycle | Hue cycling color | Phasor → HSV→RGB |
| RandomOffset | Random position offset | Hash → Scale → Vec2 |
| DelayedTrigger | Trigger with one-frame delay | SampleAndHold → UnitDelay |

## Persistence Implementation

```typescript
// src/blocks/composites/persistence.ts

const STORAGE_KEY = 'oscilla-user-composites-v1';

interface StorageSchema {
  version: 1;
  composites: Record<string, StoredComposite>;
}

interface StoredComposite {
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
      return new Map(Object.entries(data.composites));
    } catch {
      console.warn('Failed to load user composites, starting fresh');
      return new Map();
    }
  }

  save(composites: Map<string, StoredComposite>): void {
    const data: StorageSchema = {
      version: 1,
      composites: Object.fromEntries(composites),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  add(composite: CompositeDefJSON): void {
    const composites = this.load();
    composites.set(composite.type, {
      json: composite,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    this.save(composites);
  }

  remove(type: string): void {
    const composites = this.load();
    composites.delete(type);
    this.save(composites);
  }

  exportAll(): string {
    const data = this.load();
    return JSON.stringify({ composites: Object.fromEntries(data) }, null, 2);
  }

  exportSingle(type: string): string | null {
    const composites = this.load();
    const stored = composites.get(type);
    if (!stored) return null;
    return JSON.stringify(stored.json, null, 2);
  }
}
```

## Import/Export UI

```
┌─ Block Library ─────────────────────────────┐
│ 🔍 Search blocks...                         │
│                                             │
│ ▼ Math                                      │
│ ▼ State                                     │
│ ▼ Layout                                    │
│ ▼ Composites                                │
│   ├─ Library ─────────────────────────────  │
│   │  🔒 SmoothNoise                         │
│   │  🔒 PingPong                            │
│   │  🔒 ColorCycle                          │
│   │                                         │
│   └─ My Composites ───────────────────────  │
│      ✏️ MyCustomFilter                       │
│      ✏️ FancyWave                           │
│                                             │
│ ─────────────────────────────────────────── │
│ [+ Create Composite]                        │
│ [⬆ Import] [⬇ Export All]                   │
└─────────────────────────────────────────────┘
```

## File Download Helper

```typescript
function downloadAsFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Usage:
downloadAsFile(json, `${composite.type}.json`, 'application/json');
```

## File Import Helper

```typescript
async function importFromFile(): Promise<CompositeDefJSON | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const text = await file.text();
      try {
        const json = JSON.parse(text);
        const result = CompositeDefJSONSchema.safeParse(json);
        if (result.success) {
          resolve(result.data);
        } else {
          alert(`Invalid composite file: ${result.error.message}`);
          resolve(null);
        }
      } catch {
        alert('Invalid JSON file');
        resolve(null);
      }
    };
    input.click();
  });
}
```

## Startup Registration

```typescript
// src/blocks/composites/index.ts

import { CompositeStorage } from './persistence';
import { registerComposite } from './loader';
import { SmoothNoiseComposite } from './library/smooth-noise';
// ... other library imports

// Register library composites
registerComposite(SmoothNoiseComposite);
// ... etc

// Load and register user composites
const storage = new CompositeStorage();
for (const [type, stored] of storage.load()) {
  try {
    registerCompositeFromJSON(stored.json);
  } catch (e) {
    console.warn(`Failed to load user composite ${type}:`, e);
  }
}
```
