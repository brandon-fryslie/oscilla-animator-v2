import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Popover } from '@mui/material';
import type { PopoverOrigin } from '@mui/material/Popover';

export interface PopoverAnchorPosition {
  top: number;
  left: number;
}

export const POPUP_SURFACE_STYLE: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(30, 30, 40, 0.98) 0%, rgba(20, 20, 30, 0.98) 100%)',
  border: '1px solid rgba(139, 92, 246, 0.3)',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
};

export interface PopoverEntry<TData> {
  data: TData;
  anchorPosition: PopoverAnchorPosition;
}

interface UsePinPopoverStateOptions<TData> {
  isSame?: (a: TData, b: TData) => boolean;
}

export interface PinPopoverState<TData> {
  hovered: PopoverEntry<TData> | null;
  pinned: PopoverEntry<TData> | null;
  active: PopoverEntry<TData> | null;
  mode: 'hover' | 'pinned' | null;
  interactive: boolean;
  setHover: (entry: PopoverEntry<TData> | null) => void;
  togglePinned: (entry: PopoverEntry<TData>) => void;
  clearHover: () => void;
  clearPinned: () => void;
  closeAll: () => void;
}

export function usePinPopoverState<TData>(
  options?: UsePinPopoverStateOptions<TData>,
): PinPopoverState<TData> {
  const [hovered, setHovered] = useState<PopoverEntry<TData> | null>(null);
  const [pinned, setPinned] = useState<PopoverEntry<TData> | null>(null);
  const isSame = options?.isSame;

  const togglePinned = useCallback((entry: PopoverEntry<TData>) => {
    setPinned((current) => {
      if (current == null) {
        return entry;
      }
      const same = isSame ? isSame(current.data, entry.data) : current.data === entry.data;
      return same ? null : entry;
    });
  }, [isSame]);

  const clearHover = useCallback(() => {
    setHovered(null);
  }, []);

  const clearPinned = useCallback(() => {
    setPinned(null);
  }, []);

  const closeAll = useCallback(() => {
    setHovered(null);
    setPinned(null);
  }, []);

  const active = useMemo(() => pinned ?? hovered, [pinned, hovered]);
  const mode = pinned ? 'pinned' as const : hovered ? 'hover' as const : null;

  return {
    hovered,
    pinned,
    active,
    mode,
    interactive: mode === 'pinned',
    setHover: setHovered,
    togglePinned,
    clearHover,
    clearPinned,
    closeAll,
  };
}

interface BasePopoverProps {
  open: boolean;
  anchorPosition: PopoverAnchorPosition | null;
  interactive: boolean;
  onClose: () => void;
  children: React.ReactNode;
  paperStyle?: React.CSSProperties;
  anchorOrigin?: PopoverOrigin;
  transformOrigin?: PopoverOrigin;
}

export function BasePopover({
  open,
  anchorPosition,
  interactive,
  onClose,
  children,
  paperStyle,
  anchorOrigin,
  transformOrigin,
}: BasePopoverProps): React.ReactElement {
  const ignoreNextBackdropCloseRef = useRef(false);

  const markInternalInteraction = (): void => {
    if (!interactive) return;
    ignoreNextBackdropCloseRef.current = true;
    window.setTimeout(() => {
      ignoreNextBackdropCloseRef.current = false;
    }, 0);
  };

  return (
    <Popover
      open={open}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition ?? undefined}
      onClose={(_, reason) => {
        // [LAW:single-enforcer] Popover close policy is centralized in BasePopover.
        if (reason === 'backdropClick' && ignoreNextBackdropCloseRef.current) {
          return;
        }
        onClose();
      }}
      anchorOrigin={anchorOrigin ?? { vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={transformOrigin ?? { vertical: 'top', horizontal: 'left' }}
      disableAutoFocus
      disableEnforceFocus
      disableRestoreFocus
      slotProps={{
        root: {
          style: interactive ? undefined : { pointerEvents: 'none' },
        },
        paper: {
          onMouseDownCapture: markInternalInteraction,
          onClickCapture: markInternalInteraction,
          onMouseDown: (event) => event.stopPropagation(),
          onClick: (event) => event.stopPropagation(),
          style: {
            pointerEvents: interactive ? 'auto' : 'none',
            ...paperStyle,
          },
        },
      }}
    >
      {children}
    </Popover>
  );
}
