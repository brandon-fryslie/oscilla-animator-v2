import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { WarmupIndicator } from './WarmupIndicator';

describe('WarmupIndicator', () => {
  it('shows text when filled < capacity', () => {
    const { container } = render(
      React.createElement(WarmupIndicator, { filled: 50, capacity: 128 })
    );
    expect(container.textContent).toBe('history: 50/128');
  });

  it('returns null when filled >= capacity', () => {
    const { container } = render(
      React.createElement(WarmupIndicator, { filled: 128, capacity: 128 })
    );
    expect(container.textContent).toBe('');
  });

  it('returns null when filled > capacity', () => {
    const { container } = render(
      React.createElement(WarmupIndicator, { filled: 200, capacity: 128 })
    );
    expect(container.textContent).toBe('');
  });

  it('shows progress for 0 filled', () => {
    const { container } = render(
      React.createElement(WarmupIndicator, { filled: 0, capacity: 128 })
    );
    expect(container.textContent).toBe('history: 0/128');
  });

  it('shows progress just before full', () => {
    const { container } = render(
      React.createElement(WarmupIndicator, { filled: 127, capacity: 128 })
    );
    expect(container.textContent).toBe('history: 127/128');
  });
});
