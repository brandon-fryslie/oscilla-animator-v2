/**
 * Split Panel Component
 *
 * Uses jsPanel4 layout system to create a resizable horizontal split.
 * This component "bakes in" jsPanel deeply as core layout infrastructure.
 *
 * jsPanel manages:
 * - Physical DOM layout for split regions
 * - Resize handles and drag mechanics
 * - Size constraints
 *
 * React manages:
 * - Rendering components into jsPanel-managed containers
 * - Component lifecycle
 */

import React, { useEffect, useRef, useState } from 'react';

interface SplitPanelProps {
  topComponent: React.ComponentType<any>;
  bottomComponent: React.ComponentType<any>;
  initialSplit?: number; // 0-1, percentage for top panel
}

export const SplitPanel: React.FC<SplitPanelProps> = ({
  topComponent: TopComponent,
  bottomComponent: BottomComponent,
  initialSplit = 0.5,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [jsPanel, setJsPanel] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  // Load jsPanel
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Import jsPanel from custom fork
        const jsPanelModule = await import('jspanel4/es6module/jspanel.js');
        const jsPanelInstance = jsPanelModule.default || jsPanelModule.jsPanel;

        // Import CSS
        await import('jspanel4/dist/jspanel.css');

        if (!cancelled) {
          setJsPanel(jsPanelInstance);
        }
      } catch (err) {
        console.error('Failed to load jsPanel:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Setup split layout when jsPanel is loaded
  useEffect(() => {
    if (!jsPanel || !containerRef.current || !topRef.current || !bottomRef.current) {
      return;
    }

    const container = containerRef.current;
    const topContainer = topRef.current;
    const bottomContainer = bottomRef.current;

    // Calculate initial sizes
    const containerHeight = container.clientHeight;
    const topHeight = Math.floor(containerHeight * initialSplit);
    const bottomHeight = containerHeight - topHeight;

    // Create top panel
    const topPanel = jsPanel.create({
      container: topContainer,
      panelSize: {
        width: '100%',
        height: topHeight,
      },
      position: {
        my: 'left-top',
        at: 'left-top',
      },
      dragit: 'disabled',
      resizeit: {
        handles: 's', // Only resize from bottom edge
        minHeight: 100,
      },
      headerControls: 'none',
      header: false,
      borderRadius: 0,
      boxShadow: 'none',
      theme: {
        bgPanel: '#0f0f23',
        bgContent: '#0f0f23',
      },
      onclosed: () => false, // Prevent closing
    });

    // Create bottom panel
    const bottomPanel = jsPanel.create({
      container: bottomContainer,
      panelSize: {
        width: '100%',
        height: bottomHeight,
      },
      position: {
        my: 'left-top',
        at: 'left-top',
      },
      dragit: 'disabled',
      resizeit: 'disabled', // Bottom panel size is derived from top panel
      headerControls: 'none',
      header: false,
      borderRadius: 0,
      boxShadow: 'none',
      theme: {
        bgPanel: '#0f0f23',
        bgContent: '#0f0f23',
      },
      onclosed: () => false,
    });

    // Sync bottom panel height when top panel is resized
    const syncBottomHeight = () => {
      const newBottomHeight = containerHeight - topPanel.offsetHeight;
      bottomPanel.resize({
        width: '100%',
        height: Math.max(100, newBottomHeight),
      });
    };

    // Hook into resize event
    if (topPanel.options.resizeit && typeof topPanel.options.resizeit === 'object') {
      topPanel.options.resizeit.stop = topPanel.options.resizeit.stop || [];
      topPanel.options.resizeit.stop.push(syncBottomHeight);
    }

    setMounted(true);

    // Cleanup
    return () => {
      try {
        topPanel.close();
        bottomPanel.close();
      } catch (e) {
        // Panels might already be closed
      }
    };
  }, [jsPanel, initialSplit]);

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#0f0f23',
      }}
    >
      {/* Top container */}
      <div
        ref={topRef}
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderBottom: '1px solid #0f3460',
        }}
      >
        {mounted && <TopComponent />}
      </div>

      {/* Bottom container */}
      <div
        ref={bottomRef}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {mounted && <BottomComponent />}
      </div>
    </div>
  );
};
