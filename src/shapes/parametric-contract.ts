/**
 * Canonical Type 2 (parametric cubic curve) contract constants.
 *
 * // [LAW:one-source-of-truth] Block authoring, topology defaults, and runtime
 * // materialization all derive from this single contract module.
 */
export const PARAMETRIC_CUBIC_CONTROL_POINT_COUNT = 4;

export const PARAMETRIC_RESOLUTION_MIN = 4;
export const PARAMETRIC_RESOLUTION_DEFAULT = 64;
export const PARAMETRIC_RESOLUTION_MAX = 2048;
export const PARAMETRIC_RESOLUTION_UI_MAX = 256;
export const PARAMETRIC_RESOLUTION_UI_STEP = 1;

export const PARAMETRIC_THICKNESS_DEFAULT = 0.02;
export const PARAMETRIC_THICKNESS_MIN = 0.0005;
export const PARAMETRIC_THICKNESS_MAX = 2.0;
export const PARAMETRIC_THICKNESS_UI_MIN = 0.001;
export const PARAMETRIC_THICKNESS_UI_MAX = 0.2;
export const PARAMETRIC_THICKNESS_UI_STEP = 0.001;
