# Paths2D DevTools Recipes

This document provides concrete DevTools console snippets to inspect IR and runtime state during Paths2D development.

## 1) Inspect render sinks
```js
const ir = window.__rootStore?.compilerStore?.lastCompiledIR || window.__compiledIR;
ir?.renderSinks;
```

## 2) Inspect schedule steps
```js
ir?.schedule?.steps?.map(s => ({ id: s.id, kind: s.kind }));
```

## 3) Find materializePath step
```js
ir?.schedule?.steps?.find(s => s.kind === 'materializePath');
```

## 4) Inspect initialSlotValues
```js
ir?.schedule?.initialSlotValues;
```

## 5) Inspect RenderFrameIR at runtime
```js
const runtime = window.__runtime || window.__rootStore?.runtimeStore?.runtime;
runtime?.values?.read?.(ir?.outputs?.[0]?.slot);
```

## 6) Inspect specific slots (paths)
```js
const step = ir?.schedule?.steps?.find(s => s.kind === 'materializePath');
if (step) {
  console.log('cmds', runtime.values.read(step.outCmdsSlot));
  console.log('params', runtime.values.read(step.outParamsSlot));
  console.log('cmdStart', runtime.values.read(step.outCmdStartSlot));
  console.log('cmdLen', runtime.values.read(step.outCmdLenSlot));
  console.log('pointStart', runtime.values.read(step.outPointStartSlot));
  console.log('pointLen', runtime.values.read(step.outPointLenSlot));
}
```

