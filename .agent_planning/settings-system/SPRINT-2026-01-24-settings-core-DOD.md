# Definition of Done: settings-core

## Functional Requirements

- [ ] `defineSettings()` creates typed, immutable tokens with namespace, defaults, and UI hints
- [ ] `SettingsStore` registered in RootStore, accessible via `useStore('settings')`
- [ ] `useSettings(token)` returns typed reactive values + update function
- [ ] Settings auto-persist to localStorage on change (debounced)
- [ ] Settings auto-restore from localStorage on app load
- [ ] `<SettingsPanel />` renders all registered namespaces with appropriate controls
- [ ] Settings panel accessible as Dockview panel
- [ ] Settings panel accessible as Drawer from toolbar gear icon
- [ ] Default Patch setting works end-to-end (persists, loads correct patch)
- [ ] Debug On/Off setting works end-to-end (persists, affects DebugStore)
- [ ] Show Minimap setting works end-to-end (persists, toggles minimap visibility)

## Technical Requirements

- [ ] No TypeScript errors (`npm run typecheck` passes)
- [ ] Existing tests pass (`npm run test` passes)
- [ ] Settings tokens are typed generics (T inferred from defaults)
- [ ] SettingsStore.register() is idempotent
- [ ] SettingsStore.dispose() cleans up persistence reactions
- [ ] localStorage read/write has error handling (try/catch, no crashes on corrupt data)
- [ ] Schema validation on load: missing keys get defaults, extra keys dropped

## Architecture Requirements

- [ ] Token ownership model documented (which module owns which token)
- [ ] No component reads another component's settings token (verified by convention or lint)
- [ ] Single source of truth: SettingsStore holds all settings values
- [ ] One-way dependency: features → settings system (not reverse)
- [ ] Settings system has no knowledge of specific features (generic registry)

## Verification

- [ ] Manual test: change each setting, reload page, verify persistence
- [ ] Manual test: reset to defaults works per-section
- [ ] Manual test: drawer and dockview panel show identical content
- [ ] Build succeeds with no new warnings
