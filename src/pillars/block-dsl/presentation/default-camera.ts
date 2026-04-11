/**
 * src/pillars/block-dsl/presentation/default-camera.ts
 *
 * The identity camera global, lifted out of the legacy `draw-bundle.ts`.
 *
 * Today every canvas Intent registers this same default camera matrix
 * (an identity 4x4) in its manifest contribution. The lowering phase's
 * `manifest-merge.ts` dedupes structurally-identical declarations, so
 * multiple Intents declaring the same default cause no conflict.
 *
 * When a real Camera block lands (slice 5+), the camera global will
 * become dynamic and the Camera block will register a different default
 * value. The dedup will fail (different structure), which is the right
 * outcome — the conflict is the signal to the user that they need to
 * remove the legacy default.
 *
 * This module is a leaf — it imports only types from the boundary
 * contract.
 */

import type { GlobalSpec, SymbolId } from '../../../render/rust/boundary-contract';

/**
 * The well-known symbol id for the camera matrix global. Imported by
 * canvas-bound Intents and by the draw-call builder so the dependency
 * declaration matches the manifest contribution.
 */
export const SYS_CAMERA_SYMBOL = 'sys:camera' as SymbolId;

/**
 * Identity 4x4 matrix in column-major order. Real camera support comes
 * when the Camera block lands; until then every canvas Intent registers
 * this same default and the manifest merge dedupes structurally-identical
 * declarations.
 */
export const DEFAULT_CAMERA_GLOBAL: GlobalSpec = {
  type: 'mat4x4',
  isDynamic: false,
  defaultValue: [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ],
};
