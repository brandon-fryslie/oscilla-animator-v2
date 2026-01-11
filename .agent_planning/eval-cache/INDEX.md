# Evaluation Cache Index

Runtime knowledge extracted from work evaluations. Reusable findings for future evaluations.

## Runtime Behavior

### UI Components
- [runtime-ui-blocklibrary.md](runtime-ui-blocklibrary.md) - BlockLibrary component behavior, performance, edge cases (2026-01-11)
- [runtime-ui-store-wiring.md](runtime-ui-store-wiring.md) - UI-Store integration patterns
- [runtime-patch-viewer.md](runtime-patch-viewer.md) - PatchViewer runtime behavior

## Data Flow
(None yet)

## Break-It Patterns
(None yet)

## Performance Baselines
- **BlockLibrary search**: <50ms for 18 blocks, <300ms total with debounce
- See runtime-ui-blocklibrary.md for details

## Known Edge Cases
- **localStorage unavailable**: BlockLibrary handles gracefully with try/catch
- See runtime-ui-blocklibrary.md for full list

## Last Updated
2026-01-11
