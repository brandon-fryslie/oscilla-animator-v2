/**
 * Compiler Types
 *
 * Error types and other compiler-specific types.
 */
/**
 * Create a compile error.
 */
export function compileError(code, message, where, details) {
    return { code, message, where, details, kind: code };
}
/**
 * Create a successful compile result.
 */
export function ok(value, warnings = []) {
    return { ok: true, value, warnings };
}
/**
 * Create a failed compile result.
 */
export function fail(errors, warnings = []) {
    return { ok: false, errors, warnings };
}
/**
 * Check if a compile result is successful.
 */
export function isOk(result) {
    return result.ok;
}
