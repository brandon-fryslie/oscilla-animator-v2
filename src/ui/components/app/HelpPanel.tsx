/**
 * Help Panel Component
 *
 * Data-driven help browser. Renders topics from the help registry,
 * grouped by category. Active topic (set by ChartHelpButton) gets
 * highlighted and scrolled into view.
 *
 * [LAW:one-source-of-truth] Content comes from src/help/topics.ts.
 */

import React, { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../../stores';
import { getCategories, getTopicsByCategory } from '../../../help/topics';
import type { HelpTopic, HelpTopicId } from '../../../help/types';
import { colors } from '../../theme';

// =============================================================================
// Styles
// =============================================================================

const styles = {
  container: {
    padding: '12px',
    fontSize: '13px',
    color: colors.textSecondary,
    height: '100%',
    overflow: 'auto',
  },
  categoryHeader: {
    color: colors.primary,
    fontSize: '13px',
    fontWeight: 600 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    margin: '16px 0 8px 0',
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '6px',
    padding: '10px 12px',
    marginBottom: '8px',
    borderLeft: '3px solid transparent',
    transition: 'border-color 0.15s',
  },
  cardActive: {
    borderLeft: `3px solid ${colors.primary}`,
    background: 'rgba(78, 205, 196, 0.06)',
  },
  topicTitle: {
    color: colors.textPrimary,
    fontSize: '13px',
    fontWeight: 500 as const,
    marginBottom: '4px',
  },
  paragraph: {
    color: colors.textSecondary,
    fontSize: '12px',
    lineHeight: '1.5',
    margin: '4px 0',
  },
  listHeader: {
    fontSize: '11px',
    fontWeight: 600 as const,
    marginTop: '6px',
    marginBottom: '2px',
  },
  listItem: {
    fontSize: '11px',
    lineHeight: '1.4',
    color: colors.textSecondary,
    paddingLeft: '10px',
    position: 'relative' as const,
  },
  bullet: {
    position: 'absolute' as const,
    left: 0,
    color: colors.textMuted,
  },
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  'debug-viz': 'Debug Visualizations',
  'controls': 'Controls',
};

// =============================================================================
// Topic Card
// =============================================================================

function TopicCard({ topic, active, onRef }: {
  topic: HelpTopic;
  active: boolean;
  onRef: (id: HelpTopicId, el: HTMLDivElement | null) => void;
}): React.ReactElement {
  const cardStyle = active
    ? { ...styles.card, ...styles.cardActive }
    : styles.card;

  return (
    <div ref={(el) => onRef(topic.id, el)} style={cardStyle}>
      <div style={styles.topicTitle}>{topic.title}</div>
      {topic.body.map((p, i) => (
        <div key={i} style={styles.paragraph}>{p}</div>
      ))}
      {topic.shines && topic.shines.length > 0 && (
        <>
          <div style={{ ...styles.listHeader, color: '#6ecf6e' }}>Shines</div>
          {topic.shines.map((s, i) => (
            <div key={i} style={styles.listItem}>
              <span style={styles.bullet}>-</span>{s}
            </div>
          ))}
        </>
      )}
      {topic.duds && topic.duds.length > 0 && (
        <>
          <div style={{ ...styles.listHeader, color: '#cf8f6e' }}>Duds</div>
          {topic.duds.map((d, i) => (
            <div key={i} style={styles.listItem}>
              <span style={styles.bullet}>-</span>{d}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// =============================================================================
// Help Panel
// =============================================================================

export const HelpPanel: React.FC = observer(() => {
  const { help } = useStores();
  const refs = useRef(new Map<HelpTopicId, HTMLDivElement>());
  const categories = getCategories();

  const setRef = (id: HelpTopicId, el: HTMLDivElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  };

  // Scroll to active topic when it changes
  useEffect(() => {
    if (!help.activeTopicId) return;
    const el = refs.current.get(help.activeTopicId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [help.activeTopicId]);

  return (
    <div style={styles.container}>
      {categories.map(cat => {
        const topics = getTopicsByCategory(cat);
        return (
          <React.Fragment key={cat}>
            <div style={styles.categoryHeader}>
              {CATEGORY_LABELS[cat] ?? cat}
            </div>
            {topics.map(topic => (
              <TopicCard
                key={topic.id}
                topic={topic}
                active={help.activeTopicId === topic.id}
                onRef={setRef}
              />
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
});
