/**
 * ContextMenu - Reusable context menu component using MUI Menu.
 *
 * Provides consistent styling and behavior for all graph element context menus.
 * Supports nested submenus via the `children` field on ContextMenuItem.
 */

import React, { useRef, useState, useCallback } from 'react';
import { Menu, MenuItem, Divider, ListItemIcon, ListItemText } from '@mui/material';
import { ChevronRight } from '@mui/icons-material';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  disabled?: boolean;
  danger?: boolean; // Red styling for destructive actions
  dividerAfter?: boolean; // Add divider after this item
  children?: ContextMenuItem[]; // Submenu items (renders as nested menu)
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
}

/** Shared MUI sx for menu items in the dark theme. */
function menuItemSx(danger?: boolean) {
  return {
    color: danger ? '#f44336' : '#e0e0e0',
    fontSize: '14px',
    '&:hover': {
      background: danger ? 'rgba(244, 67, 54, 0.1)' : 'rgba(78, 205, 196, 0.1)',
    },
    '&.Mui-disabled': {
      color: '#666',
    },
  };
}

/** Shared MUI slotProps for the dark-themed menu paper. */
const menuPaperSlotProps = {
  paper: {
    sx: {
      background: '#1e1e1e',
      border: '1px solid #555',
      borderRadius: '4px',
      minWidth: '180px',
    },
  },
} as const;

/**
 * A menu item that opens a submenu on hover.
 * The submenu anchors to the right edge of the parent item.
 */
const NestedMenuItem: React.FC<{
  item: ContextMenuItem;
  onRootClose: () => void;
}> = ({ item, onRootClose }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLLIElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleEnter = useCallback(() => {
    clearTimeout(closeTimeoutRef.current);
    setOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    // Small delay so the pointer can move into the submenu
    closeTimeoutRef.current = setTimeout(() => setOpen(false), 150);
  }, []);

  const handleSubmenuEnter = useCallback(() => {
    clearTimeout(closeTimeoutRef.current);
  }, []);

  const handleSubmenuLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => setOpen(false), 150);
  }, []);

  const handleChildClick = useCallback((action: () => void) => {
    action();
    setOpen(false);
    onRootClose();
  }, [onRootClose]);

  return (
    <>
      <MenuItem
        ref={anchorRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        disabled={item.disabled}
        sx={{
          ...menuItemSx(item.danger),
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center' }}>
          {item.icon && (
            <ListItemIcon sx={{ color: 'inherit', minWidth: '32px' }}>
              {item.icon}
            </ListItemIcon>
          )}
          <ListItemText>{item.label}</ListItemText>
        </span>
        <ChevronRight sx={{ fontSize: '18px', ml: 1, color: '#888' }} />
      </MenuItem>

      <Menu
        open={open}
        anchorEl={anchorRef.current}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        onClose={() => setOpen(false)}
        slotProps={{
          ...menuPaperSlotProps,
          root: {
            // Prevent the backdrop from stealing pointer events or closing the parent
            sx: { pointerEvents: 'none' },
          },
        }}
        sx={{ pointerEvents: 'none' }}
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
      >
        <div
          style={{ pointerEvents: 'auto' }}
          onMouseEnter={handleSubmenuEnter}
          onMouseLeave={handleSubmenuLeave}
        >
          {item.children!.flatMap((child, ci) => {
            const elements = [
              <MenuItem
                key={`sub-${ci}`}
                onClick={() => handleChildClick(child.action)}
                disabled={child.disabled}
                sx={menuItemSx(child.danger)}
              >
                {child.icon && (
                  <ListItemIcon sx={{ color: 'inherit', minWidth: '32px' }}>
                    {child.icon}
                  </ListItemIcon>
                )}
                <ListItemText>{child.label}</ListItemText>
              </MenuItem>,
            ];
            if (child.dividerAfter) {
              elements.push(<Divider key={`sub-div-${ci}`} sx={{ borderColor: '#444' }} />);
            }
            return elements;
          })}
        </div>
      </Menu>
    </>
  );
};

/**
 * Generic context menu component.
 * Uses MUI Menu with absolute positioning for ReactFlow integration.
 * Items with `children` render as nested submenus.
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
      slotProps={menuPaperSlotProps}
    >
      {items.flatMap((item, index) => {
        const elements: React.ReactElement[] = [];

        if (item.children && item.children.length > 0) {
          elements.push(
            <NestedMenuItem
              key={`item-${index}`}
              item={item}
              onRootClose={onClose}
            />
          );
        } else {
          elements.push(
            <MenuItem
              key={`item-${index}`}
              onClick={() => handleItemClick(item.action)}
              disabled={item.disabled}
              sx={menuItemSx(item.danger)}
            >
              {item.icon && (
                <ListItemIcon sx={{ color: 'inherit', minWidth: '32px' }}>
                  {item.icon}
                </ListItemIcon>
              )}
              <ListItemText>{item.label}</ListItemText>
            </MenuItem>
          );
        }

        if (item.dividerAfter) {
          elements.push(<Divider key={`divider-${index}`} sx={{ borderColor: '#444' }} />);
        }

        return elements;
      })}
    </Menu>
  );
};
