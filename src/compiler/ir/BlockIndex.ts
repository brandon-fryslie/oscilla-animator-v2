/** Dense block index for array-based compiler access. */
export type BlockIndex = number & { readonly __brand: 'BlockIndex' };

export function blockIndex(n: number): BlockIndex {
  return n as BlockIndex;
}

