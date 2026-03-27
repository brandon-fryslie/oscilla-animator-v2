import { createContext, useContext } from 'react';
import type { RustRendererGpuPass } from '@/render/rust/worker-protocol';

export type PayloadSubmitter = (passes: readonly RustRendererGpuPass[]) => Promise<void>;

export const PayloadSubmitterContext = createContext<PayloadSubmitter | undefined>(undefined);

export function usePayloadSubmitter(): PayloadSubmitter | undefined {
  return useContext(PayloadSubmitterContext);
}
