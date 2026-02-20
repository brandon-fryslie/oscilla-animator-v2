import { describe, it, expect } from 'vitest';
import { HELP_TOPICS, getHelpTopic, getTopicsByCategory, getCategories } from '../topics';
import type { HelpTopicId } from '../types';

describe('HELP_TOPICS registry', () => {
  it('has no duplicate IDs', () => {
    const ids = HELP_TOPICS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every topic has a non-empty title and body', () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.title.length).toBeGreaterThan(0);
      expect(topic.body.length).toBeGreaterThan(0);
      for (const p of topic.body) {
        expect(p.length).toBeGreaterThan(0);
      }
    }
  });

  it('every topic has a non-empty summary', () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.summary.length).toBeGreaterThan(0);
    }
  });

  it('covers all HelpTopicId values', () => {
    const allIds: HelpTopicId[] = [
      'viz-sparkline', 'viz-raster-heatmap', 'viz-band-chart',
      'viz-color-palette', 'viz-distribution-bar', 'viz-how-selection-works',
      'controls-canvas', 'controls-patch',
    ];
    const registeredIds = new Set(HELP_TOPICS.map(t => t.id));
    for (const id of allIds) {
      expect(registeredIds.has(id)).toBe(true);
    }
  });
});

describe('getHelpTopic', () => {
  it('returns correct topic by ID', () => {
    const topic = getHelpTopic('viz-sparkline');
    expect(topic.id).toBe('viz-sparkline');
    expect(topic.title).toBe('Sparkline');
  });

  it('throws on unknown ID', () => {
    expect(() => getHelpTopic('nonexistent' as HelpTopicId)).toThrow();
  });
});

describe('getTopicsByCategory', () => {
  it('returns only topics in the given category', () => {
    const debugTopics = getTopicsByCategory('debug-viz');
    for (const t of debugTopics) {
      expect(t.category).toBe('debug-viz');
    }
    expect(debugTopics.length).toBeGreaterThan(0);
  });

  it('returns controls topics', () => {
    const controlsTopics = getTopicsByCategory('controls');
    expect(controlsTopics.length).toBe(2);
    expect(controlsTopics.map(t => t.id)).toContain('controls-canvas');
    expect(controlsTopics.map(t => t.id)).toContain('controls-patch');
  });
});

describe('getCategories', () => {
  it('returns categories in registry order without duplicates', () => {
    const cats = getCategories();
    expect(new Set(cats).size).toBe(cats.length);
    expect(cats[0]).toBe('debug-viz');
    expect(cats).toContain('controls');
  });
});
