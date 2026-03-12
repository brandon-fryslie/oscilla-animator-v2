# Commit Complexity Delta

- base: 9831947cc0fe0f473375fcc092eb320e00f0cf5a (9831947cc0fe)
- head: 732e95383a1b728c1c9d95afd88ad44e852ceaa6 (732e95383a1b)
- base report generated: 2026-03-12T00:45:32.333Z
- head report generated: 2026-03-12T00:46:01.132Z
- improved metrics: 0
- regressed metrics: 0
- unchanged / informational metrics: 31
- net score (improved - regressed): 0
- changed-file gate: fail (1/60 failing checks across 6 tracked changed files)
- gate policy: file must be under threshold or improve by at least 1%
- gate policy lock: MANDATORY: the changed-file complexity gate requires at least 1% improvement when a modified file remains over threshold. This notice must not be removed or changed.

## How To Read This

- Lower-is-better metrics should trend down toward their target; zero is ideal for rule violations.
- Higher-is-better metrics should trend up (for example maintainability index).
- `magnitude` expresses scale: `tiny`, `small`, `moderate`, `large`.
- `impact` combines metric signal strength and magnitude to indicate practical importance.

## Metric Interpretation Guide

| Metric | Desired Trend | Practical Target Range | Signal |
| --- | --- | --- | --- |
| dependency-cruiser dependency edges | informational | context only | low |
| dependency-cruiser error violations | lower is better | 0 | high |
| dependency-cruiser max fan-in | lower is better | watch hotspots | medium |
| dependency-cruiser max fan-out | lower is better | <= 15 preferred | high |
| dependency-cruiser module count | informational | context only | low |
| dependency-cruiser warning violations | lower is better | 0 | medium |
| ESLint cognitive-complexity hits | lower is better | 0 | high |
| ESLint cyclomatic rule hits | lower is better | 0 | high |
| ESLint errors | lower is better | 0 (strict gate) | high |
| ESLint max-depth hits | lower is better | 0 | high |
| ESLint max-lines-per-function hits | lower is better | 0 | medium |
| ESLint max-params hits | lower is better | 0 | medium |
| ESLint warnings | lower is better | 0-10 (team policy) | medium |
| Plato avg Halstead difficulty | lower is better | trend down | low |
| Plato avg Halstead volume | lower is better | trend down | low |
| Plato average maintainability | higher is better | >= 65 good | medium |
| Plato max cyclomatic | lower is better | <= 15 preferred | medium |
| Plato total logical SLOC | informational | context only | low |
| ts-morph average maintainability index | higher is better | >= 65 good, < 50 risky | high |
| ts-morph max cognitive | lower is better | <= 20 preferred | high |
| ts-morph max cyclomatic | lower is better | <= 15 preferred | high |
| ts-morph max fan-in | lower is better | watch hotspots | medium |
| ts-morph max fan-out | lower is better | <= 15 preferred | high |
| ts-morph max Halstead volume | lower is better | trend down over time | medium |
| ts-morph max nesting depth | lower is better | <= 4 preferred | high |
| ts-morph total source LOC | informational | context only | low |
| Typhon avg Halstead difficulty | lower is better | trend down | low |
| Typhon avg Halstead volume | lower is better | trend down | low |
| Typhon average maintainability | higher is better | >= 65 good | medium |
| Typhon max cyclomatic | lower is better | <= 15 preferred | medium |
| Typhon total logical SLOC | informational | context only | low |

## High-Signal Regressions

| Metric | Base | Head | Delta (head - base) | % Delta | Magnitude | Impact |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| none | - | - | - | - | - | - |

## High-Signal Improvements

| Metric | Base | Head | Delta (head - base) | % Delta | Magnitude | Impact |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| none | - | - | - | - | - | - |

## Regressions

| Metric | Base | Head | Delta (head - base) | % Delta | Magnitude | Impact |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| none | - | - | - | - | - | - |

## Improvements

| Metric | Base | Head | Delta (head - base) | % Delta | Magnitude | Impact |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| none | - | - | - | - | - | - |

## Changed-File Threshold Gate

Policy: file must be under threshold or improve by at least 1%

Policy lock: MANDATORY: the changed-file complexity gate requires at least 1% improvement when a modified file remains over threshold. This notice must not be removed or changed.

| File | Metric | Base | Head | Threshold | Improvement | Result |
| --- | --- | ---: | ---: | --- | ---: | --- |
| src/blocks/field/noisy-broadcast.ts | ESLint cyclomatic rule hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/blocks/field/noisy-broadcast.ts | ESLint max-depth hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/blocks/field/noisy-broadcast.ts | ESLint max-lines-per-function hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/blocks/field/noisy-broadcast.ts | ESLint max-params hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/blocks/field/noisy-broadcast.ts | ESLint cognitive-complexity hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/blocks/field/noisy-broadcast.ts | ts-morph max cyclomatic (per file) | 4 | 2 | <= 15 | 50% | pass |
| src/blocks/field/noisy-broadcast.ts | ts-morph max cognitive (per file) | 3 | 1 | <= 20 | 67% | pass |
| src/blocks/field/noisy-broadcast.ts | ts-morph max nesting depth (per file) | 1 | 1 | <= 4 | 0% | pass |
| src/blocks/field/noisy-broadcast.ts | ts-morph average maintainability index (per file) | 39 | 49 | >= 65 | 25% | pass |
| src/blocks/field/noisy-broadcast.ts | ts-morph module fan-out (per file) | 7 | 7 | <= 15 | 0% | pass |
| src/render/webgpu/gpu-pass-debug.ts | ESLint cyclomatic rule hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/render/webgpu/gpu-pass-debug.ts | ESLint max-depth hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/render/webgpu/gpu-pass-debug.ts | ESLint max-lines-per-function hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/render/webgpu/gpu-pass-debug.ts | ESLint max-params hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/render/webgpu/gpu-pass-debug.ts | ESLint cognitive-complexity hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/render/webgpu/gpu-pass-debug.ts | ts-morph max cyclomatic (per file) | n/a | 4 | <= 15 | n/a | pass |
| src/render/webgpu/gpu-pass-debug.ts | ts-morph max cognitive (per file) | n/a | 3 | <= 20 | n/a | pass |
| src/render/webgpu/gpu-pass-debug.ts | ts-morph max nesting depth (per file) | n/a | 2 | <= 4 | n/a | pass |
| src/render/webgpu/gpu-pass-debug.ts | ts-morph average maintainability index (per file) | n/a | 72 | >= 65 | n/a | pass |
| src/render/webgpu/gpu-pass-debug.ts | ts-morph module fan-out (per file) | n/a | 0 | <= 15 | n/a | pass |
| src/render/webgpu/RustWasmWebGPURenderer.ts | ESLint cyclomatic rule hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/render/webgpu/RustWasmWebGPURenderer.ts | ESLint max-depth hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/render/webgpu/RustWasmWebGPURenderer.ts | ESLint max-lines-per-function hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/render/webgpu/RustWasmWebGPURenderer.ts | ESLint max-params hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/render/webgpu/RustWasmWebGPURenderer.ts | ESLint cognitive-complexity hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/render/webgpu/RustWasmWebGPURenderer.ts | ts-morph max cyclomatic (per file) | 9 | 8 | <= 15 | 11% | pass |
| src/render/webgpu/RustWasmWebGPURenderer.ts | ts-morph max cognitive (per file) | 15 | 10 | <= 20 | 33% | pass |
| src/render/webgpu/RustWasmWebGPURenderer.ts | ts-morph max nesting depth (per file) | 3 | 4 | <= 4 | -33% | pass |
| src/render/webgpu/RustWasmWebGPURenderer.ts | ts-morph average maintainability index (per file) | 64 | 65 | >= 65 | 1% | pass |
| src/render/webgpu/RustWasmWebGPURenderer.ts | ts-morph module fan-out (per file) | 8 | 9 | <= 15 | -13% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ESLint cyclomatic rule hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ESLint max-depth hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ESLint max-lines-per-function hits (per file) | 0 | 1 | <= 0 | -100% | fail |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ESLint max-params hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ESLint cognitive-complexity hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ts-morph max cyclomatic (per file) | n/a | 6 | <= 15 | n/a | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ts-morph max cognitive (per file) | n/a | 5 | <= 20 | n/a | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ts-morph max nesting depth (per file) | n/a | 1 | <= 4 | n/a | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ts-morph average maintainability index (per file) | n/a | 73 | >= 65 | n/a | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ts-morph module fan-out (per file) | n/a | 3 | <= 15 | n/a | pass |
| src/services/compile.worker.ts | ESLint cyclomatic rule hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compile.worker.ts | ESLint max-depth hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compile.worker.ts | ESLint max-lines-per-function hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compile.worker.ts | ESLint max-params hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compile.worker.ts | ESLint cognitive-complexity hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compile.worker.ts | ts-morph max cyclomatic (per file) | 7 | 8 | <= 15 | -14% | pass |
| src/services/compile.worker.ts | ts-morph max cognitive (per file) | 14 | 7 | <= 20 | 50% | pass |
| src/services/compile.worker.ts | ts-morph max nesting depth (per file) | 4 | 2 | <= 4 | 50% | pass |
| src/services/compile.worker.ts | ts-morph average maintainability index (per file) | 60 | 62 | >= 65 | 1.9% | pass |
| src/services/compile.worker.ts | ts-morph module fan-out (per file) | 8 | 11 | <= 15 | -38% | pass |
| src/services/compiled-gpu-pass-validation.ts | ESLint cyclomatic rule hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compiled-gpu-pass-validation.ts | ESLint max-depth hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compiled-gpu-pass-validation.ts | ESLint max-lines-per-function hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compiled-gpu-pass-validation.ts | ESLint max-params hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compiled-gpu-pass-validation.ts | ESLint cognitive-complexity hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compiled-gpu-pass-validation.ts | ts-morph max cyclomatic (per file) | n/a | 6 | <= 15 | n/a | pass |
| src/services/compiled-gpu-pass-validation.ts | ts-morph max cognitive (per file) | n/a | 6 | <= 20 | n/a | pass |
| src/services/compiled-gpu-pass-validation.ts | ts-morph max nesting depth (per file) | n/a | 3 | <= 4 | n/a | pass |
| src/services/compiled-gpu-pass-validation.ts | ts-morph average maintainability index (per file) | n/a | 70 | >= 65 | n/a | pass |
| src/services/compiled-gpu-pass-validation.ts | ts-morph module fan-out (per file) | n/a | 3 | <= 15 | n/a | pass |

## Full Delta Table

| Key | Metric | Base | Head | Delta (head - base) | % Delta | Classification | Magnitude | Signal |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| dependencyCruiserDependencies | dependency-cruiser dependency edges | 2449 | 2456 | +7 | 0.29% | unchanged | tiny | low |
| dependencyCruiserErrors | dependency-cruiser error violations | 51 | 51 | 0 | 0% | unchanged | none | high |
| dependencyCruiserMaxFanIn | dependency-cruiser max fan-in | 178 | 178 | 0 | 0% | unchanged | none | medium |
| dependencyCruiserMaxFanOut | dependency-cruiser max fan-out | 32 | 32 | 0 | 0% | unchanged | none | high |
| dependencyCruiserModules | dependency-cruiser module count | 583 | 585 | +2 | 0.34% | unchanged | tiny | low |
| dependencyCruiserWarnings | dependency-cruiser warning violations | 5 | 5 | 0 | 0% | unchanged | none | medium |
| eslintCognitiveHits | ESLint cognitive-complexity hits | 112 | 112 | 0 | 0% | unchanged | none | high |
| eslintComplexityHits | ESLint cyclomatic rule hits | 191 | 191 | 0 | 0% | unchanged | none | high |
| eslintErrors | ESLint errors | 362 | 362 | 0 | 0% | unchanged | none | high |
| eslintMaxDepthHits | ESLint max-depth hits | 34 | 34 | 0 | 0% | unchanged | none | high |
| eslintMaxLinesPerFunctionHits | ESLint max-lines-per-function hits | 190 | 191 | +1 | 0.53% | regressed | tiny | medium |
| eslintMaxParamsHits | ESLint max-params hits | 46 | 46 | 0 | 0% | unchanged | none | medium |
| eslintWarnings | ESLint warnings | 246 | 247 | +1 | 0.41% | regressed | tiny | medium |
| platoAvgHalsteadDifficulty | Plato avg Halstead difficulty | 22 | 22 | +0.0034 | 0.015% | regressed | tiny | low |
| platoAvgHalsteadVolume | Plato avg Halstead volume | 2700 | 2700 | +1.7 | 0.063% | regressed | tiny | low |
| platoAvgMaintainability | Plato average maintainability | 69 | 69 | +0.025 | 0.036% | improved | tiny | medium |
| platoMaxCyclomatic | Plato max cyclomatic | 133 | 133 | 0 | 0% | unchanged | none | medium |
| platoTotalLogicalSloc | Plato total logical SLOC | 27881 | 27967 | +86 | 0.31% | unchanged | tiny | low |
| tsMorphAvgMi | ts-morph average maintainability index | 65 | 65 | +0.06 | 0.093% | improved | tiny | high |
| tsMorphMaxCognitive | ts-morph max cognitive | 287 | 287 | 0 | 0% | unchanged | none | high |
| tsMorphMaxCyclomatic | ts-morph max cyclomatic | 87 | 87 | 0 | 0% | unchanged | none | high |
| tsMorphMaxFanIn | ts-morph max fan-in | 345 | 345 | 0 | 0% | unchanged | none | medium |
| tsMorphMaxFanOut | ts-morph max fan-out | 30 | 30 | 0 | 0% | unchanged | none | high |
| tsMorphMaxHalsteadVolume | ts-morph max Halstead volume | 38000 | 38000 | 0 | 0% | unchanged | none | medium |
| tsMorphMaxNesting | ts-morph max nesting depth | 9 | 9 | 0 | 0% | unchanged | none | high |
| tsMorphSourceLocTotal | ts-morph total source LOC | 122752 | 123156 | +404 | 0.33% | unchanged | tiny | low |
| typhonAvgHalsteadDifficulty | Typhon avg Halstead difficulty | 28 | 28 | +0.011 | 0.038% | regressed | tiny | low |
| typhonAvgHalsteadVolume | Typhon avg Halstead volume | 4000 | 4000 | -9.7 | -0.24% | improved | tiny | low |
| typhonAvgMaintainability | Typhon average maintainability | 63 | 63 | +0.022 | 0.035% | improved | tiny | medium |
| typhonMaxCyclomatic | Typhon max cyclomatic | 284 | 284 | 0 | 0% | unchanged | none | medium |
| typhonTotalLogicalSloc | Typhon total logical SLOC | 84695 | 85019 | +324 | 0.38% | unchanged | tiny | low |
