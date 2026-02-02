/**
 * Patch DSL Public API
 *
 * HCL-based serialization/deserialization for Patch and CompositeBlockDef objects.
 */

// Error types
export { PatchDslError, PatchDslWarning } from './errors';

// Patch serialization/deserialization
export { serializePatchToHCL, type SerializeOptions } from './serialize';
export { deserializePatchFromHCL, type DeserializeResult } from './deserialize';

// Composite serialization/deserialization
export { serializeCompositeToHCL } from './composite-serialize';
export { deserializeCompositeFromHCL, type CompositeDeserializeResult } from './composite-deserialize';

// Testing utilities
export { patchesEqual } from './equality';

// Internal modules (ast, lexer, parser, patch-from-ast) are NOT exported
// They are implementation details of the serializer/deserializer
