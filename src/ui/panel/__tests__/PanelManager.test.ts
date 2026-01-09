/**
 * PanelManager Tests
 *
 * Unit tests for the panel management system.
 * Note: These tests mock jsPanel4 since it requires DOM.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDefaultResizeDirection,
  getResizeHandles,
  buildResizeitConfig,
  type PanelConfig,
} from '../types';

describe('Panel Types', () => {
  describe('getDefaultResizeDirection', () => {
    it('returns horizontal for left region', () => {
      expect(getDefaultResizeDirection('left')).toBe('horizontal');
    });

    it('returns horizontal for right region', () => {
      expect(getDefaultResizeDirection('right')).toBe('horizontal');
    });

    it('returns vertical for bottom region', () => {
      expect(getDefaultResizeDirection('bottom')).toBe('vertical');
    });

    it('returns none for center region', () => {
      expect(getDefaultResizeDirection('center')).toBe('none');
    });
  });

  describe('getResizeHandles', () => {
    it('returns east handle for left region', () => {
      expect(getResizeHandles('left', 'horizontal')).toBe('e');
    });

    it('returns west handle for right region', () => {
      expect(getResizeHandles('right', 'horizontal')).toBe('w');
    });

    it('returns north handle for bottom region', () => {
      expect(getResizeHandles('bottom', 'vertical')).toBe('n');
    });

    it('returns empty for none direction', () => {
      expect(getResizeHandles('left', 'none')).toBe('');
      expect(getResizeHandles('center', 'none')).toBe('');
    });

    it('returns multiple handles for center with both direction', () => {
      expect(getResizeHandles('center', 'both')).toBe('e, s, se');
    });
  });

  describe('buildResizeitConfig', () => {
    it('returns disabled when resizable is false', () => {
      const config: PanelConfig = {
        id: 'test',
        title: 'Test',
        region: 'left',
        resizable: false,
        contentFactory: () => {},
      };
      expect(buildResizeitConfig(config)).toBe('disabled');
    });

    it('returns disabled when resizable is not set (defaults to undefined)', () => {
      const config: PanelConfig = {
        id: 'test',
        title: 'Test',
        region: 'left',
        contentFactory: () => {},
      };
      // resizable defaults to undefined (falsy), so returns disabled
      expect(buildResizeitConfig(config)).toBe('disabled');
    });

    it('returns disabled for center region even when resizable is true', () => {
      const config: PanelConfig = {
        id: 'test',
        title: 'Test',
        region: 'center',
        resizable: true,
        contentFactory: () => {},
      };
      // Center region has 'none' resize direction by default
      expect(buildResizeitConfig(config)).toBe('disabled');
    });

    it('returns config object for left region when resizable is true', () => {
      const config: PanelConfig = {
        id: 'test',
        title: 'Test',
        region: 'left',
        resizable: true,
        minWidth: 200,
        maxWidth: 500,
        contentFactory: () => {},
      };
      const result = buildResizeitConfig(config);
      expect(result).not.toBe('disabled');
      expect(typeof result).toBe('object');
      if (typeof result === 'object') {
        expect(result.handles).toBe('e');
        expect(result.minWidth).toBe(200);
        expect(result.maxWidth).toBe(500);
      }
    });

    it('uses default minWidth and minHeight when resizable is true', () => {
      const config: PanelConfig = {
        id: 'test',
        title: 'Test',
        region: 'right',
        resizable: true,
        contentFactory: () => {},
      };
      const result = buildResizeitConfig(config);
      expect(typeof result).toBe('object');
      if (typeof result === 'object') {
        expect(result.minWidth).toBe(150);
        expect(result.minHeight).toBe(100);
      }
    });
  });
});

describe('PanelConfig', () => {
  it('accepts minimal configuration', () => {
    const config: PanelConfig = {
      id: 'my-panel',
      title: 'My Panel',
      region: 'left',
      contentFactory: () => {},
    };

    expect(config.id).toBe('my-panel');
    expect(config.title).toBe('My Panel');
    expect(config.region).toBe('left');
    expect(typeof config.contentFactory).toBe('function');
  });

  it('accepts full configuration', () => {
    const cleanup = vi.fn();
    const onClose = vi.fn();
    const onResize = vi.fn();

    const config: PanelConfig = {
      id: 'full-panel',
      title: 'Full Panel',
      region: 'right',
      contentFactory: () => cleanup,
      resizable: true,
      resizeDirection: 'horizontal',
      minWidth: 200,
      minHeight: 150,
      maxWidth: 600,
      maxHeight: 800,
      initialWidth: 300,
      initialHeight: '50%',
      showHeader: true,
      headerSize: 'sm',
      className: 'custom-panel',
      onClose,
      onResize,
    };

    expect(config.resizable).toBe(true);
    expect(config.resizeDirection).toBe('horizontal');
    expect(config.minWidth).toBe(200);
    expect(config.maxWidth).toBe(600);
    expect(config.initialWidth).toBe(300);
    expect(config.initialHeight).toBe('50%');
    expect(config.showHeader).toBe(true);
    expect(config.headerSize).toBe('sm');
    expect(config.className).toBe('custom-panel');
    expect(config.onClose).toBe(onClose);
    expect(config.onResize).toBe(onResize);
  });

  it('contentFactory can return cleanup function', () => {
    const cleanup = vi.fn();
    const config: PanelConfig = {
      id: 'test',
      title: 'Test',
      region: 'left',
      contentFactory: (_container) => {
        // Setup code here
        return cleanup;
      },
    };

    // Mock container (no DOM needed for this test)
    const mockContainer = {} as HTMLElement;
    const result = config.contentFactory(mockContainer);

    expect(result).toBe(cleanup);
    expect(cleanup).not.toHaveBeenCalled();

    // Simulate cleanup on destroy
    if (typeof result === 'function') {
      result();
    }
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
