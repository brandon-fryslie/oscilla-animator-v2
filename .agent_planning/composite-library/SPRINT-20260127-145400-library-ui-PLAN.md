# Sprint: Library UI - Predefined Composites & BlockLibrary Integration
Generated: 2026-01-27T14:54:00Z
Confidence: HIGH: 2, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY

## Sprint Goal
Create 5 predefined library composites and integrate composites into the BlockLibrary UI with import/export functionality.

## Scope
**Deliverables:**
- 5 library composites defined in code
- Startup initialization for library + user composites
- BlockLibrary UI with "Composites" category
- Import/export buttons and dialogs

## Work Items

### P0: Library Composites (Code-defined) [HIGH]
**Acceptance Criteria:**
- [ ] `src/blocks/composites/library/` directory created
- [ ] At least 5 library composites defined
- [ ] All compile and register successfully
- [ ] Marked as `readonly: true`
- [ ] Each has meaningful description

**Technical Notes:**
Library composites to create:
1. **SmoothNoise** - `Noise` → `Lag` (smooth random values)
2. **PingPong** - `Phasor` → `Abs(2*phase-1)` (triangle wave 0→1→0)
3. **ColorCycle** - `Phasor` → `HSV→RGB` (hue cycling)
4. **RandomOffset** - `Hash` → `Scale` → `Vec2` (random position offset)
5. **DelayedTrigger** - `SampleAndHold` → `UnitDelay` (1-frame delay)

### P1: Startup Integration [HIGH]
**Acceptance Criteria:**
- [ ] `src/blocks/composites/index.ts` created
- [ ] Library composites auto-register on import
- [ ] User composites loaded from localStorage
- [ ] Import statement added to app startup
- [ ] No errors if localStorage is empty or corrupt

**Technical Notes:**
```typescript
// src/blocks/composites/index.ts
import { registerComposite } from '../registry';
import { compositeStorage } from './persistence';
import { jsonToCompositeBlockDef } from './loader';

// Library composites
import { SmoothNoiseComposite } from './library/smooth-noise';
// ...

// Register library
registerComposite(SmoothNoiseComposite);
// ...

// Load user composites
for (const [type, stored] of compositeStorage.load()) {
  try {
    const def = jsonToCompositeBlockDef(stored.json);
    registerComposite(def);
  } catch (e) {
    console.warn(`Failed to load composite ${type}:`, e);
  }
}
```

### P2: BlockLibrary UI Integration [MEDIUM]
**Acceptance Criteria:**
- [ ] "Composites" category appears in BlockLibrary
- [ ] Library composites shown with lock icon (🔒)
- [ ] User composites shown with edit icon (✏️)
- [ ] Click to preview, double-click to add (same as primitives)
- [ ] Drag-and-drop to canvas works

**Technical Notes:**
- Update `getBlockCategories()` to include 'composite'
- Update `getBlockTypesByCategory('composite')` to return composites
- Add visual distinction (lock vs edit icon) based on `readonly` flag

### P3: Import/Export Functionality [MEDIUM]
**Acceptance Criteria:**
- [ ] "Import Composite" button in library
- [ ] Click → file picker opens for JSON
- [ ] Valid JSON → composite added and registered
- [ ] Invalid JSON → error message shown
- [ ] "Export" button on user composites
- [ ] Click → downloads JSON file

**Technical Notes:**
```typescript
// File import helper
async function importCompositeFromFile(): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    // ... validate and register
  };
  input.click();
}

// File download helper
function downloadComposite(type: string): void {
  const json = compositeStorage.exportSingle(type);
  if (!json) return;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${type}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
```

## Dependencies
- Sprint: Library Core (P0-P3) must be complete

## Risks
- **Missing block types**: Some library composites may reference blocks that don't exist
  - Mitigation: Verify all block types exist before defining composites
- **UI complexity**: BlockLibrary changes could be intrusive
  - Mitigation: Keep changes minimal, reuse existing patterns
