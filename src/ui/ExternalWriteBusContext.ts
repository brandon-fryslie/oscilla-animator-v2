import { createContext } from 'react';
import type { ExternalWriteBus } from '@/runtime/ExternalChannel';

export const ExternalWriteBusContext = createContext<ExternalWriteBus | undefined>(undefined);
