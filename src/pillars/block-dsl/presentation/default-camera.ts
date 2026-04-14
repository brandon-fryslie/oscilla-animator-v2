import type { GlobalSpec } from '../../block-api';

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
