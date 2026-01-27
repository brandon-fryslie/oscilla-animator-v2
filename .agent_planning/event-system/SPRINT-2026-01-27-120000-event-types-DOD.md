# Definition of Done: event-types

## Required for Completion

### Code Quality
- [ ] All new types compile without errors
- [ ] No `any` casts in event type definitions
- [ ] TypeScript discriminated union narrows correctly for all 17+ event types
- [ ] `once()` method implemented and typed correctly

### Testing
- [ ] Tests exist for each new event type (emit/subscribe cycle)
- [ ] Tests cover `once()` behavior (fires once, auto-unsubscribes)
- [ ] Tests cover early unsubscribe of `once()` listener
- [ ] Existing EventHub tests still pass

### Documentation
- [ ] JSDoc comments on all new event interfaces
- [ ] Example usage in relevant interfaces
- [ ] Spec reference comment at top of types.ts

### Integration
- [ ] Existing DiagnosticHub still works (no breaking changes)
- [ ] Existing emitters still work (compile.ts, RootStore)

## Verification Commands
```bash
npm run typecheck
npm run test -- src/events
```

## Exit Criteria
All checkboxes above must be checked. Sprint is complete when:
1. `npm run typecheck` passes
2. `npm run test -- src/events` passes
3. No TypeScript errors in IDE
