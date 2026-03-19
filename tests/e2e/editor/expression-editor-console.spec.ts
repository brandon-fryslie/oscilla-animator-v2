import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

interface BrowserIssue {
  readonly source: 'console' | 'pageerror';
  readonly level: 'warning' | 'error';
  readonly text: string;
}

function attachBrowserIssueCollector(page: Page): { issues: BrowserIssue[]; clear: () => void } {
  const issues: BrowserIssue[] = [];

  page.on('console', (message: ConsoleMessage) => {
    const type = message.type();
    if (type !== 'warning' && type !== 'error') {
      return;
    }
    issues.push({
      source: 'console',
      level: type,
      text: message.text(),
    });
  });

  page.on('pageerror', (error: Error) => {
    issues.push({
      source: 'pageerror',
      level: 'error',
      text: error.message,
    });
  });

  return {
    issues,
    clear: () => {
      issues.length = 0;
    },
  };
}

function filterNonEditorNoise(issues: readonly BrowserIssue[]): BrowserIssue[] {
  return issues.filter((issue) => {
    if (issue.text.includes('Failed to initialize runtime:')) {
      return false;
    }
    if (issue.text.includes('request_adapter failed: no compatible adapter')) {
      return false;
    }
    return true;
  });
}

test.describe('Expression Editor browser console', () => {
  test('opens the docked expression editor without warnings or errors', async ({ page }) => {
    const collector = attachBrowserIssueCollector(page);

    await page.goto('/?loadDemoPatch=expression-operator-showcase.hcl');
    await expect.poll(async () => page.locator('.react-flow__node').count()).toBeGreaterThan(0);
    await page.waitForTimeout(500);

    // [LAW:verifiable-goals] The regression boundary is the real editor-open
    // flow; clear unrelated startup noise before driving that interaction.
    collector.clear();

    await page.locator('.react-flow__node', { hasText: /\bscale\b/ }).first().dispatchEvent('click');
    await expect(page.getByRole('button', { name: 'Pop out' })).toBeVisible();
    await page.getByRole('button', { name: 'Pop out' }).click();

    // [LAW:behavior-not-structure] Assert the user-visible workbench labels
    // instead of implementation details beyond the actual editor flow.
    const workbench = page.locator('.expression-workbench').last();
    await expect(workbench.getByText('Expression Editor', { exact: true })).toBeVisible();
    await expect(workbench.getByText('Reference', { exact: true })).toBeVisible();
    await expect(workbench.getByText('Diagnostics', { exact: true })).toBeVisible();
    await expect(workbench.getByText('Tips', { exact: true })).toBeVisible();
    await expect(workbench.locator('.token-expr-editor')).toBeVisible();

    await page.waitForTimeout(500);

    const issues = filterNonEditorNoise(collector.issues);
    expect(issues, issues.map((issue) => `${issue.level}:${issue.source}: ${issue.text}`).join('\n')).toEqual([]);
  });
});
