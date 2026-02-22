export type RenderIssueLevel = 'warn' | 'error';

export interface RenderIssue {
  readonly level: RenderIssueLevel;
  readonly message: string;
  readonly detail?: unknown;
}

const MAX_RENDER_ISSUES = 100;
const renderIssues: RenderIssue[] = [];
let renderIssueReporter: ((issue: RenderIssue) => void) | null = null;

export function setRenderIssueReporter(
  reporter: ((issue: RenderIssue) => void) | null
): void {
  renderIssueReporter = reporter;
}

export function getRenderIssues(): readonly RenderIssue[] {
  return renderIssues;
}

export function clearRenderIssues(): void {
  renderIssues.length = 0;
}

export function reportRenderIssue(level: RenderIssueLevel, message: string, detail?: unknown): void {
  const issue: RenderIssue = { level, message, detail };
  renderIssues.push(issue);
  if (renderIssues.length > MAX_RENDER_ISSUES) {
    renderIssues.shift();
  }
  try {
    // [LAW:single-enforcer] Render issue classification and dispatch are centralized
    // in this module so render sinks do not emit ad-hoc console side effects.
    renderIssueReporter?.(issue);
  } catch (reporterError) {
    renderIssues.push({
      level: 'error',
      message: 'Render issue reporter failed',
      detail: reporterError,
    });
    if (renderIssues.length > MAX_RENDER_ISSUES) {
      renderIssues.shift();
    }
  }
}
