/**
 * Tests for AutocompleteDropdown component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AutocompleteDropdown } from '../AutocompleteDropdown';
import type { Suggestion } from '../../../expr/suggestions';
import { FLOAT } from '../../../core/canonical-types';

// =============================================================================
// Test Data
// =============================================================================

const mockFunctionSuggestions: Suggestion[] = [
  {
    label: 'sin(',
    type: 'function',
    description: 'Sine function (radians)',
    sortOrder: 100,
    arity: 1,
    returnType: FLOAT,
  },
  {
    label: 'cos(',
    type: 'function',
    description: 'Cosine function (radians)',
    sortOrder: 101,
    arity: 1,
    returnType: FLOAT,
  },
  {
    label: 'lerp(',
    type: 'function',
    description: 'Linear interpolation: lerp(a, b, t) = a + t*(b-a)',
    sortOrder: 102,
    arity: 3,
    returnType: FLOAT,
  },
] as Suggestion[];

const mockInputSuggestions: Suggestion[] = [
  {
    label: 'in0',
    type: 'input',
    description: 'Expression input 0',
    sortOrder: 200,
    connected: false,
    position: 0,
  },
  {
    label: 'in1',
    type: 'input',
    description: 'Expression input 1',
    sortOrder: 201,
    connected: true,
    position: 1,
  },
] as Suggestion[];

const mockBlockSuggestions: Suggestion[] = [
  {
    label: 'Circle1',
    type: 'block',
    description: 'Block: Circle',
    sortOrder: 300,
    portCount: 3,
    displayName: 'Circle',
  },
] as Suggestion[];

const mockPortSuggestions: Suggestion[] = [
  {
    label: 'radius',
    type: 'port',
    description: 'Output: float (one)',
    sortOrder: 400,
    payloadType: FLOAT,
    cardinality: 'one',
  },
] as Suggestion[];

// =============================================================================
// Component Rendering Tests
// =============================================================================

describe('AutocompleteDropdown - Rendering', () => {
  it('renders nothing when isVisible is false', () => {
    const { container } = render(
      <AutocompleteDropdown
        suggestions={mockFunctionSuggestions}
        selectedIndex={0}
        onSelect={vi.fn()}
        isVisible={false}
        position={{ top: 100, left: 100 }}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when suggestions array is empty', () => {
    const { container } = render(
      <AutocompleteDropdown
        suggestions={[]}
        selectedIndex={0}
        onSelect={vi.fn()}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders suggestions when visible with non-empty array', () => {
    render(
      <AutocompleteDropdown
        suggestions={mockFunctionSuggestions}
        selectedIndex={0}
        onSelect={vi.fn()}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    expect(screen.getByText('sin(')).toBeInTheDocument();
    expect(screen.getByText('cos(')).toBeInTheDocument();
    expect(screen.getByText('lerp(')).toBeInTheDocument();
  });

  it('renders descriptions when provided', () => {
    render(
      <AutocompleteDropdown
        suggestions={mockFunctionSuggestions}
        selectedIndex={0}
        onSelect={vi.fn()}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    expect(screen.getByText('Sine function (radians)')).toBeInTheDocument();
    expect(screen.getByText('Cosine function (radians)')).toBeInTheDocument();
  });

  it('truncates long descriptions to 80 characters', () => {
    const longDescription = 'A'.repeat(100);
    const suggestions: Suggestion[] = [
      {
        label: 'test',
        type: 'function',
        description: longDescription,
        sortOrder: 100,
      } as Suggestion,
    ];

    render(
      <AutocompleteDropdown
        suggestions={suggestions}
        selectedIndex={0}
        onSelect={vi.fn()}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    const truncated = longDescription.substring(0, 80) + '...';
    expect(screen.getByText(truncated)).toBeInTheDocument();
  });

  it('applies correct position styles', () => {
    const { container } = render(
      <AutocompleteDropdown
        suggestions={mockFunctionSuggestions}
        selectedIndex={0}
        onSelect={vi.fn()}
        isVisible={true}
        position={{ top: 250, left: 150 }}
      />
    );

    const dropdown = container.querySelector('.autocomplete-dropdown');
    expect(dropdown).toHaveStyle({
      top: '250px',
      left: '150px',
    });
  });
});

// =============================================================================
// Type Icon Tests
// =============================================================================

describe('AutocompleteDropdown - Type Icons', () => {
  it('renders function icon for function suggestions', () => {
    render(
      <AutocompleteDropdown
        suggestions={mockFunctionSuggestions}
        selectedIndex={0}
        onSelect={vi.fn()}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    const icons = screen.getAllByText('f(x)');
    expect(icons.length).toBe(mockFunctionSuggestions.length);
  });

  it('renders input icon for input suggestions', () => {
    render(
      <AutocompleteDropdown
        suggestions={mockInputSuggestions}
        selectedIndex={0}
        onSelect={vi.fn()}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    const icons = screen.getAllByText('in');
    expect(icons.length).toBe(mockInputSuggestions.length);
  });

  it('renders block icon for block suggestions', () => {
    render(
      <AutocompleteDropdown
        suggestions={mockBlockSuggestions}
        selectedIndex={0}
        onSelect={vi.fn()}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    expect(screen.getByText('◆')).toBeInTheDocument();
  });

  it('renders port icon for port suggestions', () => {
    render(
      <AutocompleteDropdown
        suggestions={mockPortSuggestions}
        selectedIndex={0}
        onSelect={vi.fn()}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    expect(screen.getByText('.')).toBeInTheDocument();
  });
});

// =============================================================================
// Selection State Tests
// =============================================================================

describe('AutocompleteDropdown - Selection State', () => {
  it('applies selected class to selected index', () => {
    const { container } = render(
      <AutocompleteDropdown
        suggestions={mockFunctionSuggestions}
        selectedIndex={1}
        onSelect={vi.fn()}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    const items = container.querySelectorAll('.autocomplete-dropdown__item');
    expect(items[0]).not.toHaveClass('autocomplete-dropdown__item--selected');
    expect(items[1]).toHaveClass('autocomplete-dropdown__item--selected');
    expect(items[2]).not.toHaveClass('autocomplete-dropdown__item--selected');
  });

  it('updates selected class when selectedIndex changes', () => {
    const { container, rerender } = render(
      <AutocompleteDropdown
        suggestions={mockFunctionSuggestions}
        selectedIndex={0}
        onSelect={vi.fn()}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    let items = container.querySelectorAll('.autocomplete-dropdown__item');
    expect(items[0]).toHaveClass('autocomplete-dropdown__item--selected');

    rerender(
      <AutocompleteDropdown
        suggestions={mockFunctionSuggestions}
        selectedIndex={2}
        onSelect={vi.fn()}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    items = container.querySelectorAll('.autocomplete-dropdown__item');
    expect(items[0]).not.toHaveClass('autocomplete-dropdown__item--selected');
    expect(items[2]).toHaveClass('autocomplete-dropdown__item--selected');
  });
});

// =============================================================================
// Mouse Interaction Tests
// =============================================================================

describe('AutocompleteDropdown - Mouse Interaction', () => {
  it('calls onSelect when clicking a suggestion', () => {
    const onSelect = vi.fn();

    render(
      <AutocompleteDropdown
        suggestions={mockFunctionSuggestions}
        selectedIndex={0}
        onSelect={onSelect}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    const secondItem = screen.getByText('cos(');
    fireEvent.click(secondItem);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(mockFunctionSuggestions[1]);
  });

  it('calls onSelect with correct suggestion for multiple clicks', () => {
    const onSelect = vi.fn();

    render(
      <AutocompleteDropdown
        suggestions={mockFunctionSuggestions}
        selectedIndex={0}
        onSelect={onSelect}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    fireEvent.click(screen.getByText('sin('));
    expect(onSelect).toHaveBeenCalledWith(mockFunctionSuggestions[0]);

    fireEvent.click(screen.getByText('lerp('));
    expect(onSelect).toHaveBeenCalledWith(mockFunctionSuggestions[2]);
  });
});

// =============================================================================
// Mixed Suggestion Types Tests
// =============================================================================

describe('AutocompleteDropdown - Mixed Suggestion Types', () => {
  it('renders mixed suggestion types with correct icons', () => {
    const mixedSuggestions: Suggestion[] = [
      ...mockFunctionSuggestions.slice(0, 1),
      ...mockInputSuggestions.slice(0, 1),
      ...mockBlockSuggestions,
      ...mockPortSuggestions,
    ];

    render(
      <AutocompleteDropdown
        suggestions={mixedSuggestions}
        selectedIndex={0}
        onSelect={vi.fn()}
        isVisible={true}
        position={{ top: 100, left: 100 }}
      />
    );

    expect(screen.getByText('f(x)')).toBeInTheDocument();
    expect(screen.getByText('in')).toBeInTheDocument();
    expect(screen.getByText('◆')).toBeInTheDocument();
    expect(screen.getByText('.')).toBeInTheDocument();
  });
});
