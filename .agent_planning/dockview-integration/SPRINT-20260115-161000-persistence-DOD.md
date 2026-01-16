# Definition of Done: persistence - Layout Persistence
Generated: 2026-01-15T16:10:00

## Acceptance Criteria Checklist

### LayoutStore Created
- [ ] `src/stores/LayoutStore.ts` exists
- [ ] Has `setApi(api: DockviewApi)` method
- [ ] Has `saveLayout()` method
- [ ] Has `loadLayout()` method
- [ ] Has `resetLayout()` method
- [ ] Exported from stores/index.ts
- [ ] Integrated into rootStore

### Auto-Save Working
- [ ] Moving a panel triggers save
- [ ] Resizing a group triggers save
- [ ] Adding a tab triggers save
- [ ] Closing a panel triggers save
- [ ] Save is debounced (not every pixel of resize)
- [ ] localStorage key is `oscilla-layout`

### Load on Startup
- [ ] Refresh page loads saved layout
- [ ] Panel positions match saved state
- [ ] Group sizes match saved state
- [ ] Tab order matches saved state
- [ ] Missing save falls back to default layout
- [ ] Corrupted save falls back to default layout (with console warning)

### Reset Layout
- [ ] Reset action exists (button or menu item)
- [ ] Reset clears localStorage
- [ ] Reset applies default layout immediately
- [ ] Reset works without page refresh
- [ ] All panels return to default positions

### Build/Type Safety
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] No TypeScript errors

## Verification Commands

```bash
npm run typecheck
npm run build
npm run dev
```

## Manual Verification Steps

1. Start dev server
2. Move a panel to a different location
3. Check localStorage for `oscilla-layout` key
4. Refresh the page
5. Verify panel is still in moved location
6. Resize a sidebar
7. Refresh the page
8. Verify sidebar size is preserved
9. Click reset layout
10. Verify layout returns to default
11. Corrupt localStorage manually: `localStorage.setItem('oscilla-layout', 'garbage')`
12. Refresh page
13. Verify default layout loads (no crash)
