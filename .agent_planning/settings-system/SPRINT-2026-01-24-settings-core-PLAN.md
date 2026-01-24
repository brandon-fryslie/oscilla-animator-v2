# Sprint: settings-core - Settings System Foundation

Generated: 2026-01-24
Confidence: HIGH: 4, MEDIUM: 1, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Deliver a working settings system with token-based scoped access, auto-persistence, a settings panel UI, and 3 initial settings (default patch, debug on/off, show minimap).

## Scope

**Deliverables:**
1. Settings type system and token factory (`defineSettings`)
2. `SettingsStore` (MobX store with registry, persistence, reactive access)
3. `useSettings` hook (typed, scoped access for components)
4. `<SettingsPanel />` component (renders sections from registry)
5. Dual-mount: Dockview panel + Drawer from toolbar
6. 3 initial settings tokens (default patch, debug, minimap)
7. ESLint rule or documented enforcement pattern for cross-module isolation

## Work Items

### P0: Settings type system and token factory [HIGH]

**What:** Create `defineSettings<T>()` function that produces a typed token object.

**Acceptance Criteria:**
- [ ] `defineSettings(namespace, config)` returns a frozen token with schema, defaults, and UI metadata
- [ ] Token type carries the settings shape as a generic parameter
- [ ] UI hints support: `label`, `description`, `order`, and per-field `control` type (toggle, number, select, text)
- [ ] Tokens are immutable after creation

**Technical Notes:**
- File: `src/settings/defineSettings.ts`
- Token shape:
  ```typescript
  interface SettingsToken<T extends Record<string, unknown>> {
    readonly namespace: string;
    readonly defaults: Readonly<T>;
    readonly ui: SettingsUIConfig<T>;
    readonly __brand: 'SettingsToken';
  }
  ```
- UI config per field:
  ```typescript
  interface FieldUIHint {
    label: string;
    description?: string;
    control: 'toggle' | 'number' | 'select' | 'text' | 'slider';
    options?: Array<{ label: string; value: unknown }>; // for select
    min?: number; max?: number; step?: number; // for number/slider
  }
  ```

---

### P1: SettingsStore (MobX) [HIGH]

**What:** Central MobX store that holds all registered settings, manages persistence, and provides typed access.

**Acceptance Criteria:**
- [ ] `register(token)` adds a token to the registry and initializes values from defaults (merged with localStorage)
- [ ] `get(token)` returns the current observable values (typed as `T`)
- [ ] `update(token, partial)` applies partial updates as a MobX action
- [ ] `reset(token)` restores defaults for a namespace
- [ ] Auto-persists to localStorage on any change (debounced, per-namespace key)
- [ ] Loads from localStorage on register, validating against schema defaults (missing keys get defaults, extra keys are dropped)
- [ ] Added to RootStore as `readonly settings: SettingsStore`
- [ ] Accessible via `useStore('settings')`

**Technical Notes:**
- File: `src/stores/SettingsStore.ts`
- localStorage key pattern: `oscilla-v2-settings:<namespace>`
- Use MobX `reaction` for auto-persist (debounce 500ms)
- Values stored as `ObservableMap<string, observable object>`
- `register()` is idempotent (calling twice with same token is safe)
- Dispose method cleans up reactions

---

### P2: useSettings hook [HIGH]

**What:** React hook that provides typed, reactive access to a feature's own settings.

**Acceptance Criteria:**
- [ ] `useSettings(token)` returns `[values: T, update: (partial: Partial<T>) => void]`
- [ ] Values are reactive (component re-renders on change via MobX observer)
- [ ] Auto-registers the token if not already registered (lazy registration)
- [ ] Type-safe: return type inferred from token generic
- [ ] Attempting to use a token from another module is detectable (via lint rule or barrel-export restriction)

**Technical Notes:**
- File: `src/settings/useSettings.ts`
- Calls `settingsStore.register(token)` on first use (idempotent)
- Returns `settingsStore.get(token)` + a bound `update` function
- Component must be wrapped with `observer` (same as all MobX components in this codebase)

---

### P3: SettingsPanel UI + dual-mount [HIGH]

**What:** React component that renders all registered settings grouped by namespace, mounted as both a Dockview panel and a toolbar drawer.

**Acceptance Criteria:**
- [ ] Renders one section per registered namespace, ordered by `ui.order`
- [ ] Each section shows the namespace label and its fields
- [ ] Fields render appropriate controls based on `control` hint (toggle → Switch, number → NumberInput, select → Select, etc.)
- [ ] Changes are applied immediately (no save button needed — auto-persist handles it)
- [ ] "Reset to defaults" button per section
- [ ] Accessible as Dockview panel (registered in panel factory)
- [ ] Accessible as Drawer from a gear icon in toolbar
- [ ] Both mounts render the same `<SettingsPanel />` component

**Technical Notes:**
- File: `src/ui/components/SettingsPanel.tsx`
- Dockview registration: add to panel factory in App.tsx
- Drawer: Mantine `<Drawer>` triggered by toolbar icon button
- Reuse existing common controls (CheckboxInput, NumberInput, SelectInput, etc. from `src/ui/components/common/`)
- Panel is `observer`-wrapped for reactivity

---

### P4: Initial settings tokens (3 features) [HIGH]

**What:** Create and wire up 3 initial settings to prove the system works end-to-end.

**Acceptance Criteria:**
- [ ] **Default Patch:** Setting to select which patch loads on app start (select control, options from presets list). Wired into main.ts patch loading logic.
- [ ] **Debug On/Off:** Setting to control debug panel default state (toggle control). Wired into DebugStore initialization.
- [ ] **Show Minimap:** Setting to show/hide the React Flow minimap (toggle control). Wired into ReactFlowEditor.
- [ ] All 3 appear in the settings panel under their respective sections
- [ ] All 3 persist across page reloads
- [ ] Changing each setting has the expected runtime effect

**Technical Notes:**
- Default Patch token: `src/settings/tokens/app-settings.ts` (namespace: 'app')
- Debug token: co-located with DebugStore or in `src/settings/tokens/debug-settings.ts` (namespace: 'debug')
- Minimap token: co-located with ReactFlowEditor or in `src/settings/tokens/editor-settings.ts` (namespace: 'editor')
- Default patch requires reading preset list — may need to defer until presets are loaded

---

### P5: Isolation enforcement [MEDIUM]

**What:** Mechanism to prevent components from accessing other components' settings tokens.

**Acceptance Criteria:**
- [ ] Cross-module settings token imports are detectable (either ESLint rule or documented barrel-export pattern)
- [ ] Documentation describes the enforcement pattern for future feature developers
- [ ] At minimum: tokens exported only from their owning module's barrel, with a documented convention

#### Unknowns to Resolve
- Is a custom ESLint rule worth the investment for this project's size?
- Would a simpler barrel-export convention (tokens not re-exported from index) suffice?

#### Exit Criteria
- Decide: custom ESLint rule vs. barrel-export convention
- If ESLint rule: implement and verify it catches violations
- If convention: document it clearly and add a comment in the token factory

---

## Dependencies

- None (no blockers from other work)
- Uses existing: MobX, Mantine, Dockview, common UI controls

## Risks

| Risk | Mitigation |
|------|-----------|
| Token auto-registration on hook call may cause re-renders | register() is idempotent, values already observable |
| localStorage quota exceeded | Unlikely for settings (tiny), but add try/catch on persist |
| Preset list not available at settings load time | Default patch setting loads preset list lazily, falls back to "last used" |

## File Structure

```
src/settings/
├── defineSettings.ts      # Token factory + types
├── useSettings.ts         # React hook
├── types.ts               # Shared types (SettingsToken, FieldUIHint, etc.)
├── tokens/
│   ├── app-settings.ts    # Default patch setting
│   ├── debug-settings.ts  # Debug on/off
│   └── editor-settings.ts # Show minimap
src/stores/
├── SettingsStore.ts       # MobX store (new)
├── RootStore.ts           # Updated: add settings store
src/ui/components/
├── SettingsPanel.tsx       # Panel component (new)
src/ui/components/app/
├── Toolbar.tsx            # Updated: add gear icon → drawer
├── App.tsx                # Updated: register Dockview panel
```
