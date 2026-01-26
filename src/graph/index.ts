export * from './Patch';
export * from './normalize';

// Canonical Addressing System
export {
  getBlockAddress,
  getOutputAddress,
  getInputAddress,
  getAllAddresses,
  resolveShorthand,
  getShorthandForOutput,
  getShorthandForInput,
} from './addressing';

export type { ResolvedAddress } from './address-resolution';
export { resolveAddress, resolveAddressWithDiagnostic } from './address-resolution';

export { AddressRegistry } from './address-registry';
