# Implementation Context: Patch Export for LLM

**Sprint:** patch-export
**Generated:** 2026-01-20

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ UI Layer                                                        │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Toolbar.tsx                                                 │ │
│ │ - Export button triggers exportAndCopy()                    │ │
│ │ - Shows toast feedback                                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                          │                                      │
│                          ▼                                      │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ PatchExporter (new service)                                 │ │
│ │ - exportToMarkdown(patch, options) → string                 │ │
│ │ - Uses exportFormats utilities                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                          │                                      │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                     │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│ │ PatchStore   │ │ BlockRegistry│ │ Diagnostics  │             │
│ │ .patch       │ │ getBlockDef  │ │ .errors      │             │
│ └──────────────┘ └──────────────┘ └──────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Access Patterns

### 1. Get Patch Data

```typescript
// From RootStore context
const { patch: patchStore, diagnostics } = rootStore;
const patch = patchStore.patch; // ImmutablePatch

// Iterate blocks
for (const [blockId, block] of patch.blocks) {
  // block: { id, type, params, displayName, domainId, role, inputPorts, outputPorts }
}

// Iterate edges
for (const edge of patch.edges) {
  // edge: { id, from: Endpoint, to: Endpoint, enabled, sortKey? }
  // from/to: { kind: 'port', blockId: string, slotId: string }
}
```

### 2. Get Block Definitions (for defaults)

```typescript
import { getBlockDefinition } from '../blocks/registry';
import type { BlockDef, InputDef } from '../blocks/registry';

const def = getBlockDefinition(block.type);
if (def) {
  for (const [inputId, inputDef] of Object.entries(def.inputs)) {
    const defaultValue = inputDef.value; // The default
    const currentValue = block.params[inputId];
    if (currentValue !== defaultValue) {
      // Non-default value - include in export
    }
  }
}
```

### 3. Get Compile/Runtime Status

```typescript
const { diagnostics } = rootStore;

// Check for errors
const hasErrors = diagnostics.hasErrors;
const errors = diagnostics.errors;      // Diagnostic[]
const warnings = diagnostics.warnings;  // Diagnostic[]

// Compilation stats
const stats = diagnostics.compilationStats;
// { count, totalMs, minMs, maxMs, recentMs[] }

// Each Diagnostic has:
// { id, severity, domain, code, message, blockId?, location?, timestamp, meta? }
```

---

## Key Types

### Block Structure
```typescript
interface Block {
  id: BlockId;                              // "b0", "b1", etc.
  type: BlockType;                          // "Array", "CircleLayout", etc.
  params: Record<string, unknown>;          // User-configured values
  displayName: string | null;               // User label
  domainId: string | null;                  // Domain reference
  role: BlockRole;                          // { kind: 'user' | 'bus' | 'domain', meta }
  inputPorts: ReadonlyMap<string, InputPort>;
  outputPorts: ReadonlyMap<string, OutputPort>;
}
```

### Edge Structure
```typescript
interface Edge {
  id: string;                               // "e0", "e1", etc.
  from: Endpoint;                           // Source
  to: Endpoint;                             // Target
  enabled?: boolean;                        // Default true
  sortKey?: number;                         // For ordering
}

interface Endpoint {
  kind: 'port';
  blockId: string;
  slotId: string;                           // Port name
}
```

### InputDef (from registry)
```typescript
interface InputDef {
  label?: string;
  type: SignalType;
  value?: unknown;          // DEFAULT VALUE - compare against this
  defaultSource?: DefaultSource;
  uiHint?: UIControlHint;
  exposedAsPort?: boolean;  // true if wirable, false if config-only
  optional?: boolean;
  hidden?: boolean;
}
```

---

## Export Options Interface

```typescript
interface ExportOptions {
  verbosity: 'minimal' | 'normal' | 'verbose';
  includeDefaults: boolean;      // Show values even if default
  includeCompileInfo: boolean;   // Add compilation summary
  includeRuntimeError: boolean;  // Add current error if any
  format: 'markdown' | 'json' | 'shorthand';
}

// Default options
const DEFAULT_OPTIONS: ExportOptions = {
  verbosity: 'normal',
  includeDefaults: false,
  includeCompileInfo: true,
  includeRuntimeError: true,
  format: 'markdown',
};
```

---

## Output Format Examples

### Minimal Format
```
Patch: 5 blocks, 4 edges
b1:Array(5000) → b2:CircleLayout → b5:Render
b3:ProceduralPolygon(5) → b5.shape
b4:HSVColor → b5.color
Status: ✓ compiled | ❌ runtime error: "Path topology requires control points"
```

### Normal Format (Markdown)
```markdown
## Patch: [name or "Untitled"]

### Blocks (5)
| ID | Type | Config |
|----|------|--------|
| b1 | Array | count=5000 |
| b2 | CircleLayout | radius=0.4 |
| b3 | ProceduralPolygon | sides=5 |
| b4 | HSVColor | h=index*0.1 |
| b5 | Render | |

### Connections (4)
b1.instances → b2.instances
b2.positions → b5.pos
b3.shape → b5.shape
b4.color → b5.color

### Compile Status
✓ Compiled successfully
- Compilations: 12
- Avg compile: 2.3ms
```

### Verbose Format
Includes Block Details section with explicit defaults:
```markdown
### Block Details (non-default inputs only)

**b1 (Array)**
- count: 5000 (default: 100)

**b3 (ProceduralPolygon)**
- sides: 5 (default: 3)
```

---

## Toolbar Integration Pattern

Current Toolbar.tsx uses MUI Button with consistent styling:

```tsx
<Button
  variant="text"
  size="small"
  sx={{
    color: '#888',
    fontSize: '0.75rem',
    textTransform: 'none',
    minWidth: 'auto',
    padding: '6px 12px',
    border: '1px solid #0f3460',
    '&:hover': {
      border: '1px solid #0f3460',
      background: 'rgba(255, 255, 255, 0.05)',
    },
  }}
>
  Export
</Button>
```

To access RootStore in Toolbar, use `useStores()` hook from context.

---

## Clipboard Integration

```typescript
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}
```

---

## File Locations

| Component | Path |
|-----------|------|
| **New: PatchExporter** | `src/services/PatchExporter.ts` |
| **New: exportFormats** | `src/services/exportFormats.ts` |
| **Modify: Toolbar** | `src/ui/components/app/Toolbar.tsx` |
| **Reference: PatchStore** | `src/stores/PatchStore.ts` |
| **Reference: RootStore** | `src/stores/RootStore.ts` |
| **Reference: Block Registry** | `src/blocks/registry.ts` |
| **Reference: DiagnosticsStore** | `src/stores/DiagnosticsStore.ts` |
| **Reference: Patch types** | `src/graph/Patch.ts` |

---

## Implementation Notes

1. **PatchExporter should be a pure function module** - no class needed, just exported functions

2. **Use block registry for all default lookups** - don't hardcode defaults

3. **Expression values are strings** - `params.h` might be `"index*0.1"` (string with expression)

4. **Shorthand format for config column**:
   - Skip empty parens: `b5:Render` not `b5:Render()`
   - Multiple params: `sides=5, rx=0.1`

5. **Edge arrow format**: `blockId.portName → blockId.portName`

6. **Compile status from diagnostics**:
   - `hasErrors` → show error count
   - `errors[0].message` → show first error message

7. **Keyboard shortcut** - check if global shortcut handling exists or create minimal handler
