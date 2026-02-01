/**
 * Patch DSL Public API
 *
 * HCL-based serialization/deserialization for Patch objects.
 * Sprint 2: Adds bidirectional Patch ↔ HCL conversion.
 */

// Error types
export { PatchDslError, PatchDslWarning } from './errors';

// Serialization (Patch → HCL)
export { serializePatchToHCL, type SerializeOptions } from './serialize';

// Deserialization (HCL → Patch)
export { deserializePatchFromHCL, type DeserializeResult } from './deserialize';

// Testing utilities
export { patchesEqual } from './equality';

// Internal modules (ast, lexer, parser, patch-from-ast) are NOT exported
// They are implementation details of the serializer/deserializer
