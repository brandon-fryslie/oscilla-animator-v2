# Evaluation: Settings System

**Date:** 2026-01-24
**Topic:** App-wide settings panel with scoped, extensible architecture
**Verdict:** CONTINUE

## Current State

- No settings system exists
- Two ad-hoc localStorage usages: patch persistence (main.ts) and block library collapse state (BlockLibrary.tsx)
- 10 MobX stores composed via RootStore, accessed via React context (`useStores()` / `useStore(name)`)
- UI uses Dockview for panel management, Mantine for components
- MobX strict mode enforced (all mutations in actions)

## Design Decisions (User Confirmed)

1. **Scope model:** Token-based registry with ESLint enforcement
   - Features declare typed tokens (schema + defaults + UI hints)
   - `useSettings(token)` provides typed, reactive access
   - Cross-module token imports flagged by lint rule

2. **Panel location:** Dual-mount (Dockview panel + Mantine Drawer)
   - Single `<SettingsPanel />` component
   - Mounted as Dockview panel AND as toolbar-triggered drawer

3. **Persistence:** Auto-persist to localStorage on change, restore on load
   - Single localStorage key per namespace
   - Transparent to feature code

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Feature Module (e.g., debug/)                           │
│                                                         │
│  const DEBUG_SETTINGS = defineSettings('debug', {       │
│    schema: { enabled: boolean, pollRate: number },      │
│    defaults: { enabled: true, pollRate: 1000 },         │
│    ui: { label: 'Debug', order: 2 }                     │
│  });                                                    │
│                                                         │
│  // In component:                                       │
│  const [settings, update] = useSettings(DEBUG_SETTINGS);│
│  settings.enabled  // typed, reactive                   │
└─────────────────────────────────────────────────────────┘
         │ register token
         ▼
┌─────────────────────────────────────────────────────────┐
│ SettingsStore (MobX, in RootStore)                      │
│                                                         │
│  - registry: Map<string, SettingsToken<any>>            │
│  - values: Map<string, observable object>               │
│  - persistence: auto-save/load per namespace            │
│  - getSettings(token): typed observable slice           │
│  - updateSettings(token, partial): action               │
└─────────────────────────────────────────────────────────┘
         │ iterates registry
         ▼
┌─────────────────────────────────────────────────────────┐
│ SettingsPanel (React component)                         │
│                                                         │
│  - Iterates registered tokens                           │
│  - Renders section per namespace (label, order)         │
│  - Uses UI hints for control types                      │
│  - Mounted in Dockview panel AND Mantine Drawer         │
└─────────────────────────────────────────────────────────┘
```

## Risks

1. **Token import enforcement** — ESLint rule must be written or an existing rule configured. Without it, isolation is convention-only.
2. **Serialization** — Not all setting types are JSON-serializable. Need validation on load.
3. **Migration** — localStorage schema may change between versions. Need versioning strategy.

## Blockers

None identified.
