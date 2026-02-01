/**
 * Patch DSL Error Types
 *
 * Error and warning types for HCL parsing and deserialization.
 * Include position information for user-facing error messages.
 */

import type { Position } from './ast';

/**
 * Parse or deserialization error with position information.
 */
export class PatchDslError {
  constructor(
    public readonly message: string,
    public readonly pos: Position,
    public readonly source?: string  // Optional: HCL source context
  ) {}

  toString(): string {
    return `Error at ${this.pos.start}-${this.pos.end}: ${this.message}`;
  }
}

/**
 * Non-fatal warning during deserialization.
 * Allows partial deserialization to continue.
 */
export class PatchDslWarning {
  constructor(
    public readonly message: string,
    public readonly pos?: Position
  ) {}

  toString(): string {
    if (this.pos) {
      return `Warning at ${this.pos.start}-${this.pos.end}: ${this.message}`;
    }
    return `Warning: ${this.message}`;
  }
}
