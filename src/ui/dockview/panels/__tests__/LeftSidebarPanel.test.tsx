import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const addPanel = vi.fn();
const getPanel = vi.fn();
const setExpanded = vi.fn();
const mockSelection: {
  previewType: string | null;
  selectedBlockId: string | null;
  selectedEdgeId: string | null;
  selectedPort: { blockId: string; portId: string } | null;
} = {
  previewType: null,
  selectedBlockId: null,
  selectedEdgeId: null,
  selectedPort: null,
};

vi.mock('../../../../stores', () => ({
  useStores: () => ({
    selection: mockSelection,
  }),
}));

vi.mock('../../../components/BlockLibrary', () => ({
  BlockLibrary: () => <div data-testid="block-library" />,
}));

vi.mock('../../../components/BlockInspector', () => ({
  BlockInspector: () => <div data-testid="block-inspector" />,
}));

vi.mock('../../../components/DemoBrowserSidebar', () => ({
  DemoBrowserSidebar: () => <div data-testid="demo-browser-sidebar" />,
}));

vi.mock('dockview', () => ({
  PaneviewReact: ({
    onReady,
  }: {
    onReady?: (event: { api: { panels: unknown[]; addPanel: typeof addPanel; getPanel: typeof getPanel } }) => void;
  }) => {
    React.useEffect(() => {
      onReady?.({
        api: {
          panels: [],
          addPanel,
          getPanel,
        },
      });
    }, [onReady]);

    return <div data-testid="paneview" />;
  },
}));

import { LeftSidebarPanel } from '../LeftSidebarPanel';

describe('LeftSidebarPanel', () => {
  beforeEach(() => {
    addPanel.mockReset();
    getPanel.mockReset();
    setExpanded.mockReset();
    mockSelection.previewType = null;
    mockSelection.selectedBlockId = null;
    mockSelection.selectedEdgeId = null;
    mockSelection.selectedPort = null;
    getPanel.mockImplementation((id: string) =>
      id === 'left-sidebar-inspector-pane'
        ? { api: { setExpanded } }
        : undefined,
    );
  });

  it('registers demos above collapsed Block Library and Inspector panes by default', () => {
    const TestPanel = LeftSidebarPanel as unknown as React.ComponentType<Record<string, never>>;

    render(<TestPanel />);

    expect(screen.getByTestId('paneview')).toBeInTheDocument();
    expect(addPanel).toHaveBeenCalledTimes(3);
    expect(addPanel).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 'left-sidebar-demos-pane',
      component: 'left-sidebar-demos',
      title: 'Demos',
      isExpanded: true,
    }));
    expect(addPanel).toHaveBeenNthCalledWith(2, expect.objectContaining({
      id: 'left-sidebar-library-pane',
      component: 'left-sidebar-library',
      title: 'Block Library',
      isExpanded: false,
    }));
    expect(addPanel).toHaveBeenNthCalledWith(3, expect.objectContaining({
      id: 'left-sidebar-inspector-pane',
      component: 'left-sidebar-inspector',
      title: 'Inspector',
      isExpanded: false,
    }));
    expect(setExpanded).toHaveBeenCalledWith(false);
  });

  it('opens the inspector pane when selection creates inspector demand', () => {
    mockSelection.selectedBlockId = 'block-1';
    const TestPanel = LeftSidebarPanel as unknown as React.ComponentType<Record<string, never>>;

    render(<TestPanel />);

    expect(setExpanded).toHaveBeenCalledWith(true);
  });
});
