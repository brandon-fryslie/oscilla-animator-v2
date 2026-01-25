# Definition of Done: Architectural Fix - Split Pass 0 into 0a/0b

## Functional Requirements

- [ ] All payloadType resolution happens in dedicated passes (not as double-run hack)
- [ ] User-created blocks resolved by Pass 0a
- [ ] Derived blocks resolved by Pass 0b (with edge context)
- [ ] No regression in any demo patch

## Technical Requirements

- [ ] New file `src/graph/passes/pass0b-derived-payload-resolution.ts`
- [ ] Pass 0b only processes derived blocks
- [ ] Pass 0b uses target input type (not inference from missing edges)
- [ ] Interim double-pass code removed

## Test Requirements

- [ ] Tests for Pass 0b in isolation
- [ ] Integration test for full pass pipeline
- [ ] Test for derived Const → derived FieldBroadcast chain (if applicable)

## Documentation Requirements

- [ ] Pass 0b file header with contract documentation
- [ ] Pass orchestration comments updated
- [ ] Architecture docs updated (if exists)
