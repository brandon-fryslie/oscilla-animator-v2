# Coordinate System Canonical Spec

This document defines the canonical coordinate contract used by the current runtime projection path.

## Source Of Truth

- Code contract module: `src/core/coordinate-system.ts`
- Projection kernels: `src/projection/ortho-kernel.ts`, `src/projection/perspective-kernel.ts`
- Runtime camera resolution and projection wiring:
  - `src/runtime/CameraResolver.ts`
  - `src/runtime/RenderAssembler.ts`

// [LAW:one-source-of-truth] Coordinate constants and clip/screen conversion coefficients are defined once in `src/core/coordinate-system.ts`.

## Coordinate Frames

1. World space:
- Position buffers are world-space `vec3` (`x,y,z`), with the canonical 2.5D plane at `z = 0`.
- Default world center is `(0.5, 0.5)`.

2. Clip space:
- Scalar clip coordinate range is `[-1, 1]`.
- Projection kernels produce clip-space values before normalization.

3. Normalized screen space:
- Scalar normalized screen coordinate range is `[0, 1]`.
- Mapping is linear and canonical:
  - `screen = clip * 0.5 + 0.5`
  - `clip = (screen - 0.5) / 0.5`

// [LAW:single-enforcer] Clip<->screen normalization is enforced through `clipToNormalizedScreen` / `normalizedScreenToClip`.

## Camera Orientation Contract

- Canonical camera up vector: `(0, 1, 0)`.
- Canonical camera target z-plane: `0`.
- Perspective default target is `(0.5, 0.5, 0)`.

`CameraResolver` and `RenderAssembler` both consume these shared constants from `src/core/coordinate-system.ts` so camera orientation does not drift across boundaries.

## Units Contract

- `space.ndc` means clip-aligned normalized device coordinates (x/y in `[-1,1]`).
- `screenPosition` in projection output remains normalized screen coordinates (`[0,1]`).

This separation keeps semantic units explicit:
- `ndc` is clip-like.
- projection output for render assembly is normalized screen-space.

## Verification

Machine-verifiable checks for this contract:

1. `src/core/__tests__/coordinate-system.test.ts` validates constants and reciprocal mappings.
2. `src/projection/__tests__/level3-perspective-kernel.test.ts` validates default perspective target/up alignment with canonical constants.
3. `src/runtime/__tests__/CameraResolver.test.ts` validates default camera center/FOV alignment with canonical constants.
4. `src/__tests__/architecture-guardrails.test.ts` enforces no reintroduction of duplicated clip mapping literals, ad-hoc degree/radian literals, or hard-coded camera up assignments in projection/runtime boundaries.
