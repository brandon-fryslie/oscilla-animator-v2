/**
 * Bitfield Flag Utilities
 *
 * Simple, zero-cost bitfield operations for compact metadata storage.
 */

export type Flags = number;

export function hasFlag(flags: Flags, flag: number): boolean {
  return (flags & flag) !== 0;
}

export function setFlag(flags: Flags, flag: number): Flags {
  return flags | flag;
}

export function clearFlag(flags: Flags, flag: number): Flags {
  return flags & ~flag;
}

export function toggleFlag(flags: Flags, flag: number): Flags {
  return flags ^ flag;
}

export function hasAll(flags: Flags, mask: number): boolean {
  return (flags & mask) === mask;
}

export function hasAny(flags: Flags, mask: number): boolean {
  return (flags & mask) !== 0;
}

/**
 * Create a flags object from an enum-like const object.
 *
 * @example
 * const MyFlags = defineFlags({
 *   ACTIVE: 1,
 *   VISIBLE: 2,
 *   SELECTED: 4,
 * });
 *
 * let state = MyFlags.ACTIVE | MyFlags.VISIBLE;
 * if (hasFlag(state, MyFlags.SELECTED)) { ... }
 */
export function defineFlags<T extends Record<string, number>>(flags: T): Readonly<T> {
  return Object.freeze(flags);
}
