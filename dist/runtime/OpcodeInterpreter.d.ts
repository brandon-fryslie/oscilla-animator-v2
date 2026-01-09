/**
 * Opcode Interpreter - SINGLE ENFORCER
 *
 * Unified opcode evaluation for all runtime modules.
 * Eliminates triple duplication of opcode dispatch logic.
 *
 * Adheres to architectural law: SINGLE ENFORCER
 */
/**
 * Apply an opcode to a list of values
 *
 * @param opcode - Opcode name as string
 * @param values - Input values
 * @returns Result of applying the opcode
 */
export declare function applyOpcode(opcode: string, values: number[]): number;
