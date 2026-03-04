# WebGPU-Complete Docs Guide

This directory is organized for implementation planning without coupling docs to current code state.

## Start Here

1. `IMPLEMENTATION-INDEX.md`
2. One workstream index file in `workstreams/WS-*.index.md`
3. One functional slice file in `workstreams/slices/S*.md`
4. The specific spec docs referenced by that workstream/slice pair

## How To Use The Structure

- **Workstream files (`WS-*`)** define ownership boundaries and dependency relationships.
- **Slice files (`S*`)** define implementable units of functionality (for example, first pixel, first Type 1 shape render).
- Spec docs remain source contracts and should be referenced from workstream/slice files rather than redefined.

## Dependency Order

Workstreams:

1. `workstreams/WS-01-runtime-foundation.index.md`
2. `workstreams/WS-02-compiler-lowering.index.md`
3. `workstreams/WS-03-frame-execution.index.md`
4. `workstreams/WS-04-shape-taxonomy.index.md`
5. `workstreams/WS-05-platform-dx-policy.index.md`

Functional slices:

1. `workstreams/slices/S01-first-pixel.md`
2. `workstreams/slices/S02-first-type1-shape.md`
3. `workstreams/slices/S03-first-type2-parametric.md`
4. `workstreams/slices/S04-first-type3-ribbon.md`
5. `workstreams/slices/S05-first-type4-sdf.md`
6. `workstreams/slices/S06-first-type5-text.md`

## Scope Rules

1. Each implementation task should target exactly one workstream and one slice.
2. If a contract changes, update the owning workstream/spec first, then dependent references.
3. Keep docs implementation-independent: describe intended architecture/contracts, not current completion status.

