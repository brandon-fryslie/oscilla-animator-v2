# Sprint: scroll-fix - Block Inspector Scroll Bug

**Generated**: 2026-01-19T22:00:00Z
**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION

---

## Sprint Goal

Fix the Block Inspector panel so content scrolls when it exceeds viewport height.

---

## Scope

**Deliverables:**
1. Scrollable Block Inspector content area
2. CSS styling matching existing codebase patterns

**Out of Scope:**
- Keyboard navigation improvements
- Performance optimizations
- Additional styling polish

---

## Work Items

### P0: Add Scroll Container

**File**: `src/ui/components/BlockInspector.tsx`

**Changes**:
1. Import CSS file
2. Wrap all content in a container div with `className="block-inspector"`
3. Split into header area (if any fixed elements) and scrollable content area

**Current structure**:
```tsx
export const BlockInspector = observer(function BlockInspector() {
  // ... logic
  return <BlockDetails block={block} patch={patch} />;
});

function BlockDetails({ block, patch }) {
  return (
    <div style={{ padding: '16px' }}>
      {/* all content */}
    </div>
  );
}
```

**New structure**:
```tsx
export const BlockInspector = observer(function BlockInspector() {
  // ... logic
  return (
    <div className="block-inspector">
      <div className="block-inspector__content">
        <BlockDetails block={block} patch={patch} />
      </div>
    </div>
  );
});

function BlockDetails({ block, patch }) {
  return (
    <>
      {/* content without wrapper div */}
    </>
  );
}
```

**Acceptance Criteria**:
- [ ] Content scrolls when exceeding viewport
- [ ] Scroll behavior matches BlockLibrary
- [ ] No visual regressions

---

### P1: Create CSS File

**File**: `src/ui/components/BlockInspector.css`

**Content**:
```css
.block-inspector {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-content, #0f0f23);
}

.block-inspector__content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  min-height: 0;
}

/* Custom scrollbar styling (match BlockLibrary) */
.block-inspector__content::-webkit-scrollbar {
  width: 8px;
}

.block-inspector__content::-webkit-scrollbar-track {
  background-color: var(--bg-content, #0f0f23);
}

.block-inspector__content::-webkit-scrollbar-thumb {
  background-color: var(--border-color, #0f3460);
  border-radius: 4px;
}

.block-inspector__content::-webkit-scrollbar-thumb:hover {
  background-color: var(--primary, #4ecdc4);
}
```

**Acceptance Criteria**:
- [ ] CSS file exists
- [ ] Imported in BlockInspector.tsx
- [ ] Scrollbar styling matches rest of UI

---

## Dependencies

None.

---

## Risks

### 1. Sub-component Inline Styles
**Risk**: Sub-components use inline `style={{ padding: '16px' }}` which may conflict
**Mitigation**: Move padding to CSS container, remove from sub-components

---

## Testing

```bash
# Type check
npm run typecheck

# Manual verification
npm run dev
# → Select a block with many inputs/outputs
# → Verify content scrolls
# → Verify scrollbar appears on hover
```
