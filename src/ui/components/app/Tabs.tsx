/**
 * Tabs Component
 *
 * Generic tabbed interface component.
 * Keeps all tabs mounted (display: none for hidden tabs) to preserve state.
 */

import React, { useState } from 'react';
import { Button } from '@mui/material';
import { colors } from '../../theme';

export interface TabConfig {
  id: string;
  label: string;
  icon?: string;
  component: React.ComponentType<any>;
}

interface TabsProps {
  tabs: TabConfig[];
  initialTab?: string;
  onTabChange?: (tabId: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, initialTab, onTabChange }) => {
  const [activeTab, setActiveTab] = useState(initialTab ?? tabs[0]?.id ?? '');

  const handleTabClick = (tabId: string) => {
    if (tabId === activeTab) return;
    setActiveTab(tabId);
    onTabChange?.(tabId);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: '2px',
          padding: '4px 4px 0 4px',
          background: colors.bgPanel,
          borderBottom: `1px solid ${colors.border}`,
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              variant="text"
              size="small"
              sx={{
                padding: '6px 12px',
                background: isActive ? colors.bgContent : 'transparent',
                borderRadius: '4px 4px 0 0',
                color: isActive ? colors.primary : colors.textSecondary,
                fontSize: '0.875rem',
                textTransform: 'none',
                minWidth: 'auto',
                transition: 'background 0.15s, color 0.15s',
                '&:hover': {
                  background: isActive ? colors.bgContent : 'rgba(255, 255, 255, 0.05)',
                  color: isActive ? colors.primary : colors.textPrimary,
                },
              }}
            >
              {tab.icon && <span style={{ marginRight: '6px' }}>{tab.icon}</span>}
              <span>{tab.label}</span>
            </Button>
          );
        })}
      </div>

      {/* Content area - all tabs mounted, hidden with display: none */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: colors.bgContent,
          position: 'relative',
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{
              display: tab.id === activeTab ? 'block' : 'none',
              height: '100%',
              overflow: 'auto',
            }}
          >
            <tab.component />
          </div>
        ))}
      </div>
    </div>
  );
};
