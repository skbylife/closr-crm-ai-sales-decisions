import { expect, test, type Page } from '@playwright/test';

const demoAccessPassword = process.env.DEMO_ACCESS_PASSWORD;
const relationshipAccountId = process.env.CLOSR_SMOKE_RELATIONSHIP_ACCOUNT_ID ?? 'acc_eastchina_platform_001';

async function waitForDashboardReady(page: Page) {
  await expect(async () => {
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/^Loading\.\.\.$/);
    expect(text.trim().length).toBeGreaterThan(20);
  }).toPass({ timeout: 45_000 });
}

test.describe('production smoke', () => {
  test('health endpoint is available', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  test('demo relationship intelligence opens without runtime failure', async ({ page }, testInfo) => {
    expect(demoAccessPassword, 'Set DEMO_ACCESS_PASSWORD to run production demo smoke.').toBeTruthy();

    const pageErrors: string[] = [];
    const serverErrors: { status: number; url: string }[] = [];
    const baseURL = String(testInfo.project.use.baseURL ?? '');

    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 500 && response.url().startsWith(baseURL)) {
        serverErrors.push({ status: response.status(), url: response.url() });
      }
    });

    await page.goto('/login?demo=true', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const accessPasswordInput = page.getByPlaceholder('访问密码');
    await accessPasswordInput.fill(demoAccessPassword!);
    await expect(accessPasswordInput).toHaveValue(demoAccessPassword!);
    const verifyResponse = page.waitForResponse((response) =>
      response.url().includes('/api/verify-demo') && response.request().method() === 'POST'
    );
    const loginResponse = page.waitForResponse((response) =>
      response.url().includes('/api/demo-login') && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: '进入' }).click();
    expect((await verifyResponse).ok()).toBe(true);
    expect((await loginResponse).ok()).toBe(true);
    await page.waitForFunction(() => window.location.pathname === '/horizon', null, { timeout: 90_000 });
    await waitForDashboardReady(page);

    await page.goto(`/accounts/${relationshipAccountId}?tab=relationship`, { waitUntil: 'domcontentloaded' });
    await waitForDashboardReady(page);
    await expect(page.getByRole('button', { name: '关系智能' })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('heading', { name: /当前已有/ })).toBeVisible();

    await expect(page.getByText('外部顾问', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/外部顾问 \/ 咨询顾问 \/ 渠道影响者|代录外部顾问信号/, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/不进入内部团队权限|不会给外部顾问账号/, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/关系覆盖|李洁/, { exact: false }).first()).toBeVisible();
    await expect(page.getByText('客户A：某智能制造集团', { exact: false })).toHaveCount(0);
    await expect(page.getByText(/Application error|Unhandled Runtime Error/)).toHaveCount(0);

    await testInfo.attach('relationship-intelligence-page', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    expect(pageErrors).toEqual([]);
    expect(serverErrors).toEqual([]);
  });
});
