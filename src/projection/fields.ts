/**
 * 3D Position and Size Fields
 *
 * Position fields use Float32Array with stride 3 (x, y, z).
 * Size fields use Float32Array with stride 1 (world-space radius).
 *
 * These are the data layer for the 3D projection system.
 * Layout blocks produce vec3 positions with z=0.0 by default.
 *
 * Architectural rules:
 * - Positions are ALWAYS stride 3 Float32Array (never {x,y,z} objects)
 * - z=0.0 is written explicitly (never left uninitialized)
 * - Size is world-space scalar (never screen-space)
 * - These are contiguous buffers for direct kernel consumption
 */

/**
 * Create a position field (Float32Array, stride 3) for N instances.
 * All values are initialized to 0.0.
 */
export function createPositionField(count: number): Float32Array {
  return new Float32Array(count * 3);
}

/**
 * Create a size field (Float32Array, stride 1) for N instances.
 * Values represent world-space radius.
 * All values are initialized to 0.0.
 */
export function createSizeField(count: number): Float32Array {
  return new Float32Array(count);
}

/**
 * Read a position triple [x, y, z] from a position field at index i.
 */
export function readPosition(field: Float32Array, index: number): [number, number, number] {
  const offset = index * 3;
  return [field[offset], field[offset + 1], field[offset + 2]];
}

/**
 * Write a position triple [x, y, z] into a position field at index i.
 */
export function writePosition(field: Float32Array, index: number, x: number, y: number, z: number): void {
  const offset = index * 3;
  field[offset] = x;
  field[offset + 1] = y;
  field[offset + 2] = z;
}

/**
 * Get the instance count from a position field.
 */
export function positionFieldCount(field: Float32Array): number {
  return field.length / 3;
}

/**
 * Get the instance count from a size field.
 */
export function sizeFieldCount(field: Float32Array): number {
  return field.length;
}
