# Commit Complexity Delta

- base: 4efebac95414c3d7516a33629a5232d259401744 (4efebac95414)
- head: 54a0e667fcea12be5bf6bd3f6b09dc47f8f1ecf1 (54a0e667fcea)
- base report generated: 2026-03-12T01:16:42.716Z
- head report generated: 2026-03-12T01:17:07.703Z
- improved metrics: 0
- regressed metrics: 0
- unchanged / informational metrics: 31
- net score (improved - regressed): 0
- changed-file gate: pass (0/20 failing checks across 2 tracked changed files)
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
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ESLint cyclomatic rule hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ESLint max-depth hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ESLint max-lines-per-function hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ESLint max-params hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ESLint cognitive-complexity hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ts-morph max cyclomatic (per file) | 4 | 5 | <= 15 | -25% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ts-morph max cognitive (per file) | 3 | 4 | <= 20 | -33% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ts-morph max nesting depth (per file) | 1 | 1 | <= 4 | 0% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ts-morph average maintainability index (per file) | 72 | 72 | >= 65 | 0.088% | pass |
| src/services/__tests__/compiled-gpu-pass-validation.test.ts | ts-morph module fan-out (per file) | 3 | 3 | <= 15 | 0% | pass |
| src/services/compiled-gpu-pass-validation.ts | ESLint cyclomatic rule hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compiled-gpu-pass-validation.ts | ESLint max-depth hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compiled-gpu-pass-validation.ts | ESLint max-lines-per-function hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compiled-gpu-pass-validation.ts | ESLint max-params hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compiled-gpu-pass-validation.ts | ESLint cognitive-complexity hits (per file) | 0 | 0 | <= 0 | 0% | pass |
| src/services/compiled-gpu-pass-validation.ts | ts-morph max cyclomatic (per file) | 6 | 6 | <= 15 | 0% | pass |
| src/services/compiled-gpu-pass-validation.ts | ts-morph max cognitive (per file) | 6 | 6 | <= 20 | 0% | pass |
| src/services/compiled-gpu-pass-validation.ts | ts-morph max nesting depth (per file) | 3 | 2 | <= 4 | 33% | pass |
| src/services/compiled-gpu-pass-validation.ts | ts-morph average maintainability index (per file) | 70 | 69 | >= 65 | -0.61% | pass |
| src/services/compiled-gpu-pass-validation.ts | ts-morph module fan-out (per file) | 3 | 3 | <= 15 | 0% | pass |

## Full Delta Table

| Key | Metric | Base | Head | Delta (head - base) | % Delta | Classification | Magnitude | Signal |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| dependencyCruiserDependencies | dependency-cruiser dependency edges | 2456 | 2456 | 0 | 0% | unchanged | none | low |
| dependencyCruiserErrors | dependency-cruiser error violations | 51 | 51 | 0 | 0% | unchanged | none | high |
| dependencyCruiserMaxFanIn | dependency-cruiser max fan-in | 178 | 178 | 0 | 0% | unchanged | none | medium |
| dependencyCruiserMaxFanOut | dependency-cruiser max fan-out | 32 | 32 | 0 | 0% | unchanged | none | high |
| dependencyCruiserModules | dependency-cruiser module count | 585 | 585 | 0 | 0% | unchanged | none | low |
| dependencyCruiserWarnings | dependency-cruiser warning violations | 5 | 5 | 0 | 0% | unchanged | none | medium |
| eslintCognitiveHits | ESLint cognitive-complexity hits | 112 | 112 | 0 | 0% | unchanged | none | high |
| eslintComplexityHits | ESLint cyclomatic rule hits | 191 | 191 | 0 | 0% | unchanged | none | high |
| eslintErrors | ESLint errors | 362 | 362 | 0 | 0% | unchanged | none | high |
| eslintMaxDepthHits | ESLint max-depth hits | 34 | 34 | 0 | 0% | unchanged | none | high |
| eslintMaxLinesPerFunctionHits | ESLint max-lines-per-function hits | 190 | 190 | 0 | 0% | unchanged | none | medium |
| eslintMaxParamsHits | ESLint max-params hits | 46 | 46 | 0 | 0% | unchanged | none | medium |
| eslintWarnings | ESLint warnings | 246 | 246 | 0 | 0% | unchanged | none | medium |
| platoAvgHalsteadDifficulty | Plato avg Halstead difficulty | 22 | 22 | +0.0032 | 0.014% | regressed | tiny | low |
| platoAvgHalsteadVolume | Plato avg Halstead volume | 2700 | 2700 | +1.4 | 0.054% | regressed | tiny | low |
| platoAvgMaintainability | Plato average maintainability | 69 | 69 | -0.0023 | -0.0033% | regressed | tiny | medium |
| platoMaxCyclomatic | Plato max cyclomatic | 133 | 133 | 0 | 0% | unchanged | none | medium |
| platoTotalLogicalSloc | Plato total logical SLOC | 27968 | 27983 | +15 | 0.054% | unchanged | tiny | low |
| tsMorphAvgMi | ts-morph average maintainability index | 65 | 65 | +0.0018 | 0.0027% | improved | tiny | high |
| tsMorphMaxCognitive | ts-morph max cognitive | 287 | 287 | 0 | 0% | unchanged | none | high |
| tsMorphMaxCyclomatic | ts-morph max cyclomatic | 87 | 87 | 0 | 0% | unchanged | none | high |
| tsMorphMaxFanIn | ts-morph max fan-in | 345 | 345 | 0 | 0% | unchanged | none | medium |
| tsMorphMaxFanOut | ts-morph max fan-out | 30 | 30 | 0 | 0% | unchanged | none | high |
| tsMorphMaxHalsteadVolume | ts-morph max Halstead volume | 38000 | 38000 | 0 | 0% | unchanged | none | medium |
| tsMorphMaxNesting | ts-morph max nesting depth | 9 | 9 | 0 | 0% | unchanged | none | high |
| tsMorphSourceLocTotal | ts-morph total source LOC | 123159 | 123188 | +29 | 0.024% | unchanged | tiny | low |
| typhonAvgHalsteadDifficulty | Typhon avg Halstead difficulty | 28 | 28 | +0.0043 | 0.015% | regressed | tiny | low |
| typhonAvgHalsteadVolume | Typhon avg Halstead volume | 4000 | 4000 | +1.5 | 0.036% | regressed | tiny | low |
| typhonAvgMaintainability | Typhon average maintainability | 63 | 63 | -0.0023 | -0.0036% | regressed | tiny | medium |
| typhonMaxCyclomatic | Typhon max cyclomatic | 284 | 284 | 0 | 0% | unchanged | none | medium |
| typhonTotalLogicalSloc | Typhon total logical SLOC | 85021 | 85061 | +40 | 0.047% | unchanged | tiny | low |
