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

export function isComplexityMetric(row) {
  return row?.direction !== 'info';
}

function absRelativePct(row) {
  const raw = row?.relativeDeltaPct;
  if (raw === null || raw === undefined || raw === '') return null;
  const pct = Number(raw);
  return Number.isFinite(pct) ? Math.abs(pct) : null;
}

export function rowStatus(row) {
  const delta = Number(row?.delta ?? 0);
  if (!Number.isFinite(delta) || delta === 0 || row?.classification === 'unchanged') {
    return { kind: 'unchanged', level: 'unchanged', emoji: '⬜️', severity: 0 };
  }

  const pctAbs = absRelativePct(row);
  if (pctAbs !== null && pctAbs < 2) {
    return { kind: 'neutral', level: 'neutral', emoji: '😐', severity: 0 };
  }

  if (row?.classification === 'regressed') {
    const severe = row?.signal === 'high' && (row?.magnitude === 'moderate' || row?.magnitude === 'large');
    if (severe || (pctAbs !== null && pctAbs >= 25)) return { kind: 'regression', level: 'regression-4', emoji: '‼️', severity: 4 };
    if (row?.impact === 'high-priority regression' || (pctAbs !== null && pctAbs >= 10)) {
      return { kind: 'regression', level: 'regression-3', emoji: '🟥', severity: 3 };
    }
    if (row?.impact === 'meaningful regression' || (pctAbs !== null && pctAbs >= 5)) {
      return { kind: 'regression', level: 'regression-2', emoji: '🟧', severity: 2 };
    }
    return { kind: 'regression', level: 'regression-1', emoji: '🟨', severity: 1 };
  }

  if (row?.classification === 'improved') {
    const strong = row?.signal === 'high' && (row?.magnitude === 'moderate' || row?.magnitude === 'large');
    if (strong || (pctAbs !== null && pctAbs >= 25)) return { kind: 'improvement', level: 'improvement-4', emoji: '🤑', severity: 4 };
    if (row?.impact === 'high-value improvement' || (pctAbs !== null && pctAbs >= 10)) {
      return { kind: 'improvement', level: 'improvement-3', emoji: '❇️', severity: 3 };
    }
    if (row?.impact === 'meaningful improvement' || (pctAbs !== null && pctAbs >= 5)) {
      return { kind: 'improvement', level: 'improvement-2', emoji: '✅', severity: 2 };
    }
    return { kind: 'improvement', level: 'improvement-1', emoji: '🟩', severity: 1 };
  }

  return { kind: 'neutral', level: 'neutral', emoji: '😐', severity: 0 };
}

function signalRank(signal) {
  if (signal === 'high') return 0;
  if (signal === 'medium') return 1;
  return 2;
}

function worstToBestRank(row) {
  const status = rowStatus(row);
  const pct = absRelativePct(row) ?? 0;
  if (status.kind === 'regression') return -(status.severity * 1000 + pct);
  if (status.kind === 'neutral') return 0;
  if (status.kind === 'unchanged') return 1;
  return status.severity * 1000 + pct;
}

export function sortRowsForDisplay(rows) {
  return [...rows].sort((a, b) => {
    const signalOrder = signalRank(a.signal) - signalRank(b.signal);
    if (signalOrder !== 0) return signalOrder;
    const trendOrder = worstToBestRank(a) - worstToBestRank(b);
    if (trendOrder !== 0) return trendOrder;
    return String(a.label ?? '').localeCompare(String(b.label ?? ''));
  });
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
  const severeRegressions = rows.filter((row) => {
    const status = rowStatus(row);
    return status.kind === 'regression' && status.severity >= 3;
  }).length;

  if (severeRegressions > 0 && weightedScore <= -20) {
    return { label: 'very bad', badgeLabel: 'very bad', badgeColor: 'red', emphasize: true };
  }
  if (weightedScore <= -8) {
    return { label: 'bad', badgeLabel: 'bad', badgeColor: 'red', emphasize: false };
  }
  if (weightedScore <= 0) {
    return { label: 'warning', badgeLabel: 'warning', badgeColor: 'yellow', emphasize: false };
  }
  if (weightedScore <= 7) {
    return { label: 'improvement', badgeLabel: 'improvement', badgeColor: 'yellowgreen', emphasize: false };
  }
  if (weightedScore <= 20) {
    return { label: 'solid improvement', badgeLabel: 'solid improvement', badgeColor: 'green', emphasize: false };
  }
  return { label: 'awesome improvement', badgeLabel: 'awesome improvement', badgeColor: 'brightgreen', emphasize: true };
}

export function summarizeTrendNarrative(rows) {
  const complexityRows = rows.filter(isComplexityMetric);
  const regressions = complexityRows.filter((row) => rowStatus(row).kind === 'regression');
  const improvements = complexityRows.filter((row) => rowStatus(row).kind === 'improvement');
  const neutral = complexityRows.filter((row) => rowStatus(row).kind === 'neutral').length;
  const severeRegressions = regressions.filter((row) => rowStatus(row).severity >= 3).length;
  const strongImprovements = improvements.filter((row) => rowStatus(row).severity >= 3).length;

  if (complexityRows.length === 0) return 'No complexity metrics changed.';
  if (regressions.length === 0 && improvements.length === 0) return `Mostly unchanged (${neutral} near-zero deltas).`;
  if (severeRegressions > 0) return `${severeRegressions} severe regressions detected.`;
  if (regressions.length > improvements.length) return `Net regression (${regressions.length} regressions, ${improvements.length} improvements, ${neutral} near-zero changes).`;
  if (improvements.length > regressions.length) return `Net improvement (${improvements.length} improvements, ${regressions.length} regressions, ${neutral} near-zero changes).`;
  if (strongImprovements > 0) return `Mixed trend with notable improvements (${strongImprovements} strong).`;
  return `Mixed trend (${improvements.length} improvements, ${regressions.length} regressions, ${neutral} near-zero changes).`;
}
