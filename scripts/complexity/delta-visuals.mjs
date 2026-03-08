export const SIGNAL_WEIGHTS = {
  high: 5,
  medium: 3,
  low: 1,
};

export const MAGNITUDE_WEIGHTS = {
  none: 0,
  tiny: 1,
  small: 2,
  moderate: 3,
  large: 5,
};

export function rowStatus(row) {
  if (row.classification === 'regressed') {
    const severe = row.signal === 'high' && (row.magnitude === 'moderate' || row.magnitude === 'large');
    if (severe) return { level: 'very-bad', label: 'very bad', emoji: '🟥' };
    return { level: 'bad', label: 'bad', emoji: '🔴' };
  }
  if (row.classification === 'improved') {
    const excellent = row.signal === 'high' && (row.magnitude === 'moderate' || row.magnitude === 'large');
    if (excellent) return { level: 'awesome', label: 'awesome improvement', emoji: '🟩✨' };
    if (row.magnitude === 'moderate' || row.magnitude === 'large') {
      return { level: 'solid', label: 'solid improvement', emoji: '🟩' };
    }
    return { level: 'improvement', label: 'improvement', emoji: '🟨🟩' };
  }
  return { level: 'warning', label: 'warning', emoji: '🟡' };
}

export function scoreRows(rows) {
  // [LAW:one-source-of-truth] Trend score derives strictly from canonical per-metric delta rows.
  return rows.reduce((total, row) => {
    if (row.classification !== 'improved' && row.classification !== 'regressed') return total;
    const signalWeight = SIGNAL_WEIGHTS[row.signal] ?? 1;
    const magnitudeWeight = MAGNITUDE_WEIGHTS[row.magnitude] ?? 1;
    const contribution = signalWeight * magnitudeWeight;
    return row.classification === 'improved' ? total + contribution : total - contribution;
  }, 0);
}

export function classifyTrend(weightedScore, rows) {
  const severeRegressions = rows.filter((row) => rowStatus(row).level === 'very-bad').length;
  if (severeRegressions > 0 && weightedScore <= -20) {
    return {
      label: 'very bad',
      badgeLabel: 'very bad',
      badgeColor: 'red',
      emphasize: true,
    };
  }
  if (weightedScore <= -8) {
    return {
      label: 'bad',
      badgeLabel: 'bad',
      badgeColor: 'red',
      emphasize: false,
    };
  }
  if (weightedScore <= 0) {
    return {
      label: 'warning',
      badgeLabel: 'warning',
      badgeColor: 'yellow',
      emphasize: false,
    };
  }
  if (weightedScore <= 7) {
    return {
      label: 'improvement',
      badgeLabel: 'improvement',
      badgeColor: 'yellowgreen',
      emphasize: false,
    };
  }
  if (weightedScore <= 20) {
    return {
      label: 'solid improvement',
      badgeLabel: 'solid improvement',
      badgeColor: 'green',
      emphasize: false,
    };
  }
  return {
    label: 'awesome improvement',
    badgeLabel: 'awesome improvement',
    badgeColor: 'brightgreen',
    emphasize: true,
  };
}

export function summarizeTrendNarrative(rows) {
  const regressed = rows.filter((row) => row.classification === 'regressed');
  const improved = rows.filter((row) => row.classification === 'improved');
  const severe = regressed.filter((row) => rowStatus(row).level === 'very-bad').length;
  const minorRegressed = regressed.filter((row) => row.impact === 'minor regression').length;
  const meaningfulRegressed = regressed.filter((row) => row.impact === 'meaningful regression').length;
  const highValueImproved = improved.filter((row) => row.impact === 'high-value improvement').length;
  const meaningfulImproved = improved.filter((row) => row.impact === 'meaningful improvement').length;

  if (regressed.length === 0 && improved.length === 0) return 'No metric-level movement.';
  if (severe > 0) return `${severe} severe row-level regressions detected.`;
  if (regressed.length > improved.length) {
    return `Net regression with mostly minor impacts (${minorRegressed}/${regressed.length} minor, ${meaningfulRegressed} meaningful).`;
  }
  if (improved.length > regressed.length) {
    return `Net improvement (${highValueImproved} high-value, ${meaningfulImproved} meaningful improvements).`;
  }
  return 'Mixed trend with offsetting improvements and regressions.';
}
