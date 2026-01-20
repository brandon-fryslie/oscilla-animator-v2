/**
 * ContextMenu - Reusable context menu component using MUI Menu.
 *
 * Provides consistent styling and behavior for all graph element context menus.
 */

import React from 'react';
import { Menu, MenuItem, Divider, ListItemIcon, ListItemText } from '@mui/material';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  disabled?: boolean;
  danger?: boolean; // Red styling for destructive actions
  dividerAfter?: boolean; // Add divider after this item
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
}

/**
 * Generic context menu component.
 * Uses MUI Menu with absolute positioning for ReactFlow integration.
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  anchorPosition,
  onClose,
}) => {
  const handleItemClick = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <Menu
      open={anchorPosition !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition ?? undefined}
      slotProps={{
        paper: {
          sx: {
            background: '#1e1e1e',
            border: '1px solid #555',
            borderRadius: '4px',
            minWidth: '180px',
          },
        },
      }}
    >
      {items.flatMap((item, index) => {
        const elements = [
          <MenuItem
            key={`item-${index}`}
            onClick={() => handleItemClick(item.action)}
            disabled={item.disabled}
            sx={{
              color: item.danger ? '#f44336' : '#e0e0e0',
              fontSize: '14px',
              '&:hover': {
                background: item.danger ? 'rgba(244, 67, 54, 0.1)' : 'rgba(78, 205, 196, 0.1)',
              },
              '&.Mui-disabled': {
                color: '#666',
              },
            }}
          >
            {item.icon && (
              <ListItemIcon sx={{ color: 'inherit', minWidth: '32px' }}>
                {item.icon}
              </ListItemIcon>
            )}
            <ListItemText>{item.label}</ListItemText>
          </MenuItem>,
        ];

        if (item.dividerAfter) {
          elements.push(<Divider key={`divider-${index}`} sx={{ borderColor: '#444' }} />);
        }

        return elements;
      })}
    </Menu>
  );
};
