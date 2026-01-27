# Sprint: Library System - Composite Block Library
Generated: 2026-01-27T15:03:00Z
Confidence: HIGH: 3, MEDIUM: 2, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Implement the composite library system with premade composites in code, JSON loading for user composites, and library UI integration.

## Scope
**Deliverables:**
- JSON schema for composite definitions
- Library composites defined in TypeScript
- JSON loader for user-created composites
- localStorage persistence for user composites
- Library panel showing both library and user composites
- Import/export functionality for sharing composites

## Work Items

### P0: Composite JSON Schema [HIGH]
**Acceptance Criteria:**
- [ ] JSON schema defining composite structure
- [ ] Schema validation using zod or similar
- [ ] Clear error messages for invalid JSON
- [ ] Schema versioned for future compatibility
- [ ] TypeScript types generated from schema

**Technical Notes:**
```typescript
// JSON format (serializable)
interface CompositeDefJSON {
  $schema?: string;
  version: 1;
  type: string;
  label: string;
  category: string;
  description?: string;
  internalBlocks: Record<string, { type: string; params?: Record<string, unknown> }>;
  internalEdges: Array<{ from: [string, string]; to: [string, string] }>;
  exposedInputs: Array<{ external: string; internal: [string, string]; label?: string }>;
  exposedOutputs: Array<{ external: string; internal: [string, string]; label?: string }>;
}
```

### P1: Library Composites (Code-defined) [HIGH]
**Acceptance Criteria:**
- [ ] At least 5 useful library composites
- [ ] Defined in `src/blocks/composites/library/`
- [ ] Auto-registered at module load
- [ ] Marked as `readonly: true` to prevent user editing
- [ ] Well-documented with descriptions

**Technical Notes:**
Library composites to include:
1. **SmoothNoise** - Noise → Lag chain for smooth random values
2. **PingPong** - Phasor → Triangle wave (0→1→0)
3. **ColorCycle** - Phasor → HSV→RGB for color cycling
4. **RandomOffset** - Hash → Scale → Add for random offsets
5. **DelayedTrigger** - SampleAndHold → UnitDelay chain

### P2: JSON Loader [HIGH]
**Acceptance Criteria:**
- [ ] Load composite from JSON string
- [ ] Validate against schema
- [ ] Convert JSON to CompositeBlockDef
- [ ] Handle validation errors gracefully
- [ ] Support loading from file or URL (future)

**Technical Notes:**
```typescript
function loadCompositeFromJSON(json: string): Result<CompositeBlockDef, ValidationError[]>;
function parseCompositeJSON(obj: unknown): Result<CompositeDefJSON, ValidationError[]>;
function jsonToCompositeBlockDef(json: CompositeDefJSON): CompositeBlockDef;
```

### P3: Persistence System [MEDIUM]
**Acceptance Criteria:**
- [ ] User composites saved to localStorage
- [ ] Auto-load on app startup
- [ ] Handle localStorage quota errors
- [ ] Export single composite as JSON file
- [ ] Export all composites as JSON bundle
- [ ] Import composite from JSON file

**Technical Notes:**
```typescript
// Storage key: 'oscilla-user-composites-v1'
interface UserCompositesStorage {
  version: 1;
  composites: Record<string, {
    json: CompositeDefJSON;
    createdAt: string;
    updatedAt: string;
  }>;
}
```

### P4: Library Panel Integration [MEDIUM]
**Acceptance Criteria:**
- [ ] "Composites" section in BlockLibrary
- [ ] Subsections: "Library" and "My Composites"
- [ ] Library composites show lock icon (non-editable)
- [ ] User composites show edit/delete options
- [ ] "Import Composite" button
- [ ] "Export All" button

**Technical Notes:**
- Extend BlockLibrary component
- Add CompositeLibrarySection subcomponent
- Handle drag-to-canvas for composites

## Dependencies
- Sprint 1 (Core Infrastructure) must be complete
- Sprint 2 (Editor UI) needed for create/edit functionality

## Risks
- **localStorage limits**: Large composites could hit quota
  - Mitigation: Warn user, offer export to file
- **JSON schema evolution**: Future changes need migration
  - Mitigation: Version field, migration functions
