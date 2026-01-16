/**
 * Dockview Hooks
 *
 * React hooks for accessing Dockview API from child components.
 */

import { useContext } from 'react';
import { DockviewContext } from './DockviewProvider';

/**
 * Access the Dockview API from any child component.
 *
 * @throws If called outside DockviewProvider
 */
export function useDockview() {
  const context = useContext(DockviewContext);
  if (!context) {
    throw new Error('useDockview must be used within DockviewProvider');
  }
  return context;
}
