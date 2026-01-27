# Sprint: Library Core - JSON Schema, Loader & Persistence
Generated: 2026-01-27T14:53:00Z
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Implement the core library infrastructure: JSON schema validation with Zod, loader functions for JSON→CompositeBlockDef conversion, and localStorage persistence for user composites.

## Scope
**Deliverables:**
- Zod schema for composite JSON validation
- Loader functions (parseJSON, jsonToDef, loadFromString)
- Persistence class (load, save, add, remove, export)
- Integration with CompositeEditorStore

## Work Items

### P0: Install Zod & Create Schema [HIGH]
**Acceptance Criteria:**
- [ ] `zod` installed as dependency
- [ ] `src/blocks/composites/schema.ts` created
- [ ] Schema validates correct composite JSON
- [ ] Schema rejects invalid JSON with clear messages
- [ ] Version field present (v1)
- [ ] TypeScript type exported: `CompositeDefJSON`

**Technical Notes:**
```typescript
// Key schema structure
const CompositeDefJSONSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  type: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  internalBlocks: z.record(InternalBlockSchema),
  internalEdges: z.array(InternalEdgeSchema),
  exposedInputs: z.array(ExposedPortSchema),
  exposedOutputs: z.array(ExposedPortSchema),
});
```

### P1: JSON Loader Functions [HIGH]
**Acceptance Criteria:**
- [ ] `src/blocks/composites/loader.ts` created
- [ ] `parseCompositeJSON(unknown)` → validates and returns typed JSON
- [ ] `jsonToCompositeBlockDef(json)` → converts to internal type
- [ ] `loadCompositeFromJSON(string)` → full pipeline
- [ ] Error messages include context (which field, why invalid)
- [ ] Computes `inputs`/`outputs` from exposed ports

**Technical Notes:**
- Must convert JSON `internalBlocks` (Record) to Map<InternalBlockId>
- Must convert JSON edge tuples to InternalEdge objects
- Must look up block definitions to compute input/output signatures

### P2: Persistence Class [HIGH]
**Acceptance Criteria:**
- [ ] `src/blocks/composites/persistence.ts` created
- [ ] Storage key: `'oscilla-user-composites-v1'`
- [ ] `load()` reads from localStorage
- [ ] `save(composites)` writes to localStorage
- [ ] `add(composite)` adds single composite
- [ ] `remove(type)` removes by type name
- [ ] `exportSingle(type)` returns JSON string
- [ ] `exportAll()` returns JSON bundle
- [ ] Handles quota errors gracefully (warns, doesn't crash)

**Technical Notes:**
```typescript
interface StorageSchema {
  version: 1;
  composites: Record<string, {
    json: CompositeDefJSON;
    createdAt: string;   // ISO timestamp
    updatedAt: string;   // ISO timestamp
  }>;
}
```

### P3: CompositeEditorStore Integration [HIGH]
**Acceptance Criteria:**
- [ ] `CompositeEditorStore.save()` persists to localStorage
- [ ] Uses `CompositeStorage.add()`
- [ ] Converts CompositeBlockDef → CompositeDefJSON for storage
- [ ] Handles save errors (shows notification)

**Technical Notes:**
- Add `compositeDefToJSON(def)` function in loader.ts
- Call storage after successful `registerComposite()`

## Dependencies
- Sprint 1 & 2 (complete)

## Risks
- **localStorage quota**: Large composites could hit storage limit
  - Mitigation: Catch quota errors, warn user, suggest export to file
- **JSON schema evolution**: Future versions may need migration
  - Mitigation: Version field enables migration path
