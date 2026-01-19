# Definition of Done: foundation - Dockview Core Infrastructure
Generated: 2026-01-15T16:00:00

## Acceptance Criteria Checklist

### jspanel4 Removal
- [ ] `src/ui/panel/PanelManager.ts` deleted
- [ ] `src/ui/panel/types.ts` deleted
- [ ] `src/ui/panel/__tests__/PanelManager.test.ts` deleted
- [ ] `src/ui/types/jspanel.d.ts` deleted
- [ ] `src/ui/layout/AppLayout.ts` deleted
- [ ] `src/ui/layout/regions.ts` deleted
- [ ] `package.json` has no `jspanel4` dependency
- [ ] `package.json` has no `@jspanel/*` dependencies
- [ ] `vite.config.ts` has no jspanel4 alias
- [ ] `public/index.html` has no `.jsPanel*` CSS rules

### Dockview Installation
- [ ] `dockview` in dependencies
- [ ] `dockview-react` in dependencies
- [ ] `npm install` completes without errors

### Infrastructure Files Created
- [ ] `src/ui/dockview/index.ts` exists and exports public API
- [ ] `src/ui/dockview/DockviewProvider.tsx` exists
- [ ] `src/ui/dockview/panelRegistry.ts` exists with 10 panel definitions
- [ ] `src/ui/dockview/hooks.ts` exists with `useDockview` hook
- [ ] `src/ui/dockview/defaultLayout.ts` exists
- [ ] `src/ui/dockview/theme.css` exists

### Panel Migration
- [ ] BlockLibrary renders in left-top group
- [ ] BlockInspector renders in left-bottom group
- [ ] TableView renders in center group
- [ ] ConnectionMatrix renders in center group
- [ ] ReteEditor renders in center group
- [ ] ReactFlowEditor renders in center group
- [ ] Preview (CanvasTab) renders in center group
- [ ] DomainsPanel renders in right-top group
- [ ] HelpPanel renders in right-bottom group
- [ ] DiagnosticConsole renders in bottom group

### App.tsx Refactored
- [ ] Uses DockviewProvider
- [ ] Toolbar renders above Dockview
- [ ] No hardcoded flexbox layout for panels
- [ ] StoreProvider and EditorProvider still wrap correctly

### Visual/Functional
- [ ] Layout visually matches current structure
- [ ] Tab switching works in center group
- [ ] All panel content renders correctly
- [ ] Selection still works (click block in library → inspector updates)
- [ ] Editor switching works (Rete ↔ ReactFlow)
- [ ] Preview canvas renders animation
- [ ] Diagnostic console shows logs

### Build/Type Safety
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] No TypeScript errors in new files
- [ ] No console errors at runtime

### Theme
- [ ] Tab backgrounds use dark theme colors
- [ ] Panel backgrounds match existing (#0f0f23)
- [ ] Headers match existing (#16213e)
- [ ] Borders match existing (#0f3460)

## Verification Commands

```bash
# Type check
npm run typecheck

# Build
npm run build

# Dev server (manual visual verification)
npm run dev
```

## Manual Verification Steps

1. Start dev server: `npm run dev`
2. Open browser to localhost
3. Verify layout structure matches diagram
4. Click through all center tabs (Blocks, Matrix, Rete, Flow, Preview)
5. Select a block in library → verify inspector updates
6. Verify diagnostic console shows events
7. Verify canvas preview animates
8. Check browser console for errors
