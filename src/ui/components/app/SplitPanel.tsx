/**
 * Split Panel Component
 *
 * Simple horizontal split panel with draggable divider.
 * Top and bottom panels are always visible simultaneously.
 */

import React, { useState, useRef, useEffect } from 'react';

interface SplitPanelProps {
  topComponent: React.ComponentType<any>;
  bottomComponent: React.ComponentType<any>;
  initialSplit?: number; // 0-1, percentage for top panel (default 0.5)
}

export const SplitPanel: React.FC<SplitPanelProps> = ({
  topComponent: TopComponent,
  bottomComponent: BottomComponent,
  initialSplit = 0.5,
}) => {
  const [topHeight, setTopHeight] = useState(initialSplit);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const percentage = Math.max(0.1, Math.min(0.9, y / rect.height));
      setTopHeight(percentage);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

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
      {/* Top panel */}
      <div
        style={{
          height: `${topHeight * 100}%`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <TopComponent />
      </div>

      {/* Divider */}
      <div
        onMouseDown={handleDividerMouseDown}
        style={{
          height: '4px',
          background: '#0f3460',
          cursor: 'ns-resize',
          flexShrink: 0,
          position: 'relative',
          zIndex: 10,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#4ecdc4';
        }}
        onMouseLeave={(e) => {
          if (!isDragging) {
            e.currentTarget.style.background = '#0f3460';
          }
        }}
      />

      {/* Bottom panel */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <BottomComponent />
      </div>
    </div>
  );
};
