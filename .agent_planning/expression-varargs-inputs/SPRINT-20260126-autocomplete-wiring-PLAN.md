# Sprint: autocomplete-wiring - Autocomplete Varargs Wiring

Generated: 2026-01-26
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Connect the expression autocomplete UI to wire vararg connections when users select block.port suggestions, enabling `Circle.radius` syntax to work end-to-end.

## Scope

**Deliverables:**
1. Flat block.port suggestions in autocomplete (e.g., "Circle.radius", "Square.size")
2. Automatic vararg connection wiring when suggestion is selected
3. Expression block can compile and execute expressions using wired block references

## Work Items

### P0 (Critical) Add suggestAllOutputs Method [HIGH]

**Description**: Add a new method to SuggestionProvider that returns all block.port combinations as a flat list of suggestions.

**Acceptance Criteria:**
- [ ] `suggestAllOutputs()` method added to SuggestionProvider
- [ ] Returns suggestions with label format: `"BlockName.portId"` (e.g., "Circle.radius")
- [ ] Each suggestion includes metadata: blockId, portId, sourceAddress
- [ ] Excludes the current Expression block (can't reference itself)
- [ ] Sorted alphabetically by label

**Technical Notes:**
```typescript
// New suggestion type for block outputs
export interface OutputSuggestion extends Suggestion {
  readonly type: 'output';  // New type
  readonly blockId: string;
  readonly portId: string;
  readonly sourceAddress: string;  // "blocks.{blockId}.outputs.{portId}"
  readonly payloadType: string;
}

suggestAllOutputs(excludeBlockId?: string): readonly OutputSuggestion[] {
  const suggestions: OutputSuggestion[] = [];

  for (const block of this.patch.blocks.values()) {
    if (block.id === excludeBlockId) continue;  // Skip self

    const blockDef = BLOCK_DEFS_BY_TYPE.get(block.type);
    if (!blockDef?.outputs) continue;

    for (const [portId, outputDef] of Object.entries(blockDef.outputs)) {
      suggestions.push({
        label: `${block.id}.${portId}`,
        type: 'output',
        description: `${block.type} output`,
        blockId: block.id,
        portId,
        sourceAddress: `blocks.${block.id}.outputs.${portId}`,
        payloadType: outputDef.type.payload.kind,
        sortOrder: 250,  // Between inputs (200) and blocks (300)
      });
    }
  }

  return suggestions.sort((a, b) => a.label.localeCompare(b.label));
}
```

**Files:**
- `src/expr/suggestions.ts`

---

### P0 (Critical) Include Outputs in filterSuggestions [HIGH]

**Description**: Update filterSuggestions to include block outputs in the default suggestion set.

**Acceptance Criteria:**
- [ ] `filterSuggestions()` includes outputs when no type filter specified
- [ ] New type filter 'output' supported for filtering to outputs only
- [ ] Outputs appear in autocomplete dropdown with distinct icon
- [ ] AutocompleteDropdown displays 'output' type with appropriate icon

**Technical Notes:**
```typescript
// In filterSuggestions, update the else branch:
} else {
  // No type filter - include all except ports (which need context)
  allSuggestions = [
    ...this.suggestFunctions(),
    ...this.suggestInputs(),
    ...this.suggestAllOutputs(this.excludeBlockId),  // NEW
  ];
}

// Add 'output' case:
} else if (type === 'output') {
  allSuggestions = [...this.suggestAllOutputs(this.excludeBlockId)];
}
```

Update AutocompleteDropdown icon:
```typescript
case 'output':
  return '→';  // Or '◇' or similar
```

**Files:**
- `src/expr/suggestions.ts`
- `src/ui/expression-editor/AutocompleteDropdown.tsx`

---

### P0 (Critical) Wire Vararg Connection on Select [HIGH]

**Description**: When user selects an output suggestion, wire a VarargConnection to the Expression block's 'refs' port.

**Acceptance Criteria:**
- [ ] Selecting output suggestion inserts text AND wires connection
- [ ] Connection uses sourceAddress from suggestion
- [ ] sortKey calculated as max(existing) + 1
- [ ] Connection added via patchStore API
- [ ] Only wires for 'output' type suggestions (not functions/inputs)

**Technical Notes:**
```typescript
// In ExpressionEditor, update handleSelectSuggestion:
const handleSelectSuggestion = useCallback((suggestion: Suggestion) => {
  if (textareaRef.current) {
    // Existing: insert text
    const identifierData = extractIdentifierPrefix(localValue, cursorPosition);
    const prefixStartOffset = identifierData?.startOffset ?? cursorPosition;
    insertSuggestion(textareaRef.current, suggestion, filterPrefix, prefixStartOffset);

    // NEW: Wire vararg connection for output suggestions
    if (suggestion.type === 'output') {
      const outputSugg = suggestion as OutputSuggestion;

      // Get existing refs connections to calculate sortKey
      const block = patch.blocks.get(blockId);
      const refsPort = block?.inputPorts.get('refs');
      const existingConnections = refsPort?.varargConnections ?? [];
      const maxSortKey = existingConnections.length > 0
        ? Math.max(...existingConnections.map(c => c.sortKey))
        : -1;

      // Wire the connection
      patchStore.addVarargConnection(
        blockId,
        'refs',
        outputSugg.sourceAddress,
        maxSortKey + 1
      );
    }

    setShowAutocomplete(false);
    setFilterPrefix('');
    setBlockContext(null);
    textareaRef.current.focus();
  }
}, [localValue, cursorPosition, filterPrefix, blockId, patch, patchStore]);
```

**Files:**
- `src/ui/components/BlockInspector.tsx` (ExpressionEditor component)

---

### P1 (High) Pass excludeBlockId to SuggestionProvider [HIGH]

**Description**: Ensure the Expression block's own ID is excluded from output suggestions (can't reference itself).

**Acceptance Criteria:**
- [ ] SuggestionProvider constructor or method accepts excludeBlockId
- [ ] suggestAllOutputs filters out the excluded block
- [ ] ExpressionEditor passes its blockId when creating/using SuggestionProvider

**Technical Notes:**
The SuggestionProvider is currently created in ExpressionEditor. Either:
1. Add `excludeBlockId` parameter to suggestAllOutputs method
2. Or store it in the provider and use in suggestAllOutputs

Option 1 is simpler:
```typescript
suggestAllOutputs(excludeBlockId?: string): readonly OutputSuggestion[]
```

**Files:**
- `src/expr/suggestions.ts`
- `src/ui/components/BlockInspector.tsx`

---

## Dependencies

- ✅ Unified varargs system (SPRINT-20260126-unified-varargs) - COMPLETE
- ✅ Patch.addVarargConnection API - EXISTS
- ✅ Expression block refs vararg port - IMPLEMENTED

## Risks

| Risk | Mitigation |
|------|------------|
| Expression block may not have refs port | Verify port exists before wiring |
| Duplicate connections | Optional: check if connection exists first |
| Large patches with many outputs | Pagination or search-first UX (defer) |

## Exit Criteria

This sprint is complete when:
1. Autocomplete shows block.port suggestions (e.g., "Circle.radius")
2. Selecting a suggestion inserts text AND wires vararg connection
3. Expression compiles and executes correctly using wired refs
4. Expression block cannot reference its own outputs
5. All tests pass
