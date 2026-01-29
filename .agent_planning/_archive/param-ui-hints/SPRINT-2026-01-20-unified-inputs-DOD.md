# Definition of Done: unified-inputs Sprint

**Generated:** 2026-01-20

## Type System

- [ ] `InputDef` has fields: `label?`, `type?`, `value?`, `defaultSource?`, `uiHint?`, `exposedAsPort?`, `optional?`, `hidden?`
- [ ] `OutputDef` has fields: `label?`, `type`, `hidden?`
- [ ] `BlockDef.inputs` is `Record<string, InputDef>`
- [ ] `BlockDef.outputs` is `Record<string, OutputDef>`
- [ ] `BlockDef.params` is removed
- [ ] No `id` field in InputDef or OutputDef (key is the id)

## Block Registrations

- [ ] All 14 block files converted to new format
- [ ] `inputs` is object, not array
- [ ] `outputs` is object, not array
- [ ] Former `params` merged into `inputs` with appropriate `exposedAsPort` value
- [ ] `uiHint` can be specified on any input

## Consumer Code

- [ ] All `.inputs.map()` → `Object.entries(inputs).map()`
- [ ] All `.inputs.find(i => i.id === x)` → `inputs[x]`
- [ ] All `.inputs.length` → `Object.keys(inputs).length`
- [ ] Same patterns for outputs
- [ ] BlockInspector renders inputs (including non-port ones) correctly
- [ ] ParamsEditor functionality merged or removed

## Runtime Behavior

- [ ] `config` in lower functions populated from `inputs[key].value`
- [ ] Default sources still work
- [ ] Type inference still works
- [ ] Wiring/unwiring works correctly

## Build & Test

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm run test` passes

## Manual Verification

- [ ] Const block: slider renders for `value` (range 1-10000)
- [ ] Circle block: slider renders for `radius` (range 0.01-0.5)
- [ ] Add block: both inputs appear as wirable ports
- [ ] Connections work correctly
- [ ] Inspector shows correct controls for each input type
