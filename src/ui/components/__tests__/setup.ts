/**
 * Test setup for React component tests
 */

import '@testing-library/jest-dom';
import { vi } from 'vitest';

// [LAW:dataflow-not-control-flow] Setup runs for all test environments; browser
// mocks are data-dependent on globals being available instead of splitting setup files.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = vi.fn();
}
