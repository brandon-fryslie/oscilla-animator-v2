/**
 * ChartHelpButton - Contextual `?` icon for debug viz charts.
 *
 * On click: sets the active topic in HelpStore and ensures the
 * help panel is visible in dockview.
 */

import React, { useCallback } from 'react';
import { useStores } from '../../../stores';
import { useDockview } from '../../dockview';
import { getHelpTopic } from '../../../help/topics';
import type { HelpTopicId } from '../../../help/types';

const buttonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '10px',
  fontWeight: 600,
  fontFamily: 'monospace',
  color: 'rgba(78, 205, 196, 0.4)',
  padding: '0 2px',
  lineHeight: 1,
  transition: 'color 0.15s',
};

const hoverColor = 'rgba(78, 205, 196, 0.9)';

export function ChartHelpButton({ topicId }: { topicId: HelpTopicId }): React.ReactElement {
  const { help } = useStores();
  const { api } = useDockview();
  const topic = getHelpTopic(topicId);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    help.showTopic(topicId);

    if (!api) return;

    // Ensure help panel is visible
    const existing = api.getPanel('help');
    if (existing) {
      existing.api.setActive();
    } else {
      // Find the bottom-right group to add the panel into
      const debugPanel = api.getPanel('debug-miniview');
      const targetGroup = debugPanel?.group;
      const opts: Record<string, unknown> = {
        id: 'help',
        component: 'help',
        title: 'Help',
      };
      if (targetGroup) {
        opts.position = { referenceGroup: targetGroup };
      }
      api.addPanel(opts as Parameters<typeof api.addPanel>[0]);
    }
  }, [api, help, topicId]);

  return (
    <button
      style={buttonStyle}
      title={topic.summary}
      onClick={handleClick}
      onMouseEnter={(e) => { (e.target as HTMLElement).style.color = hoverColor; }}
      onMouseLeave={(e) => { (e.target as HTMLElement).style.color = buttonStyle.color as string; }}
    >
      ?
    </button>
  );
}
