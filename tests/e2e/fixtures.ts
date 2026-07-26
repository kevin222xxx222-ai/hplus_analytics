/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture callbacks are named `use` by its API. */
import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { QA_VIEWPORTS } from "../../playwright.config";

type BrowserIssue = { type: string; message: string; url?: string };

export type QaFixtures = {
  qaPage: Page;
  browserIssues: BrowserIssue[];
  login: () => Promise<void>;
  waitAnalyticsLoaded: () => Promise<void>;
};

export const test = base.extend<QaFixtures>({
  browserIssues: async ({}, use) => {
    await use([]);
  },
  qaPage: async ({ page, browserIssues }, use, testInfo) => {
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        browserIssues.push({ type: `console.${message.type()}`, message: message.text(), url: page.url() });
      }
    });
    page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", message: error.message, url: page.url() }));
    page.on("requestfailed", (request) => browserIssues.push({ type: "requestfailed", message: request.failure()?.errorText ?? "request failed", url: request.url() }));
    page.on("response", (response) => {
      if (response.status() >= 400) browserIssues.push({ type: `http.${response.status()}`, message: response.statusText(), url: response.url() });
      if (response.status() >= 300 && response.status() < 400 && !response.url().includes("/login")) browserIssues.push({ type: "http.redirect", message: response.statusText(), url: response.url() });
    });
    await use(page);
    if (browserIssues.length > 0) {
      await testInfo.attach("browser-issues.json", { body: JSON.stringify(browserIssues, null, 2), contentType: "application/json" });
    }
  },
  login: async ({ qaPage }, use) => {
    await use(async () => {
      if (qaPage.url().includes("/login")) {
        const identifier = process.env.QA_LOGIN_ID;
        const password = process.env.QA_LOGIN_PASSWORD;
        if (!identifier || !password) throw new Error("QA_LOGIN_ID and QA_LOGIN_PASSWORD are required for authenticated E2E tests");
        await qaPage.getByLabel(/ログインID|メールアドレス/).fill(identifier);
        await qaPage.getByLabel("パスワード").fill(password);
        await qaPage.getByRole("button", { name: "ログイン" }).click();
        await qaPage.waitForLoadState("domcontentloaded");
      }
    });
  },
  waitAnalyticsLoaded: async ({ qaPage }, use) => {
    await use(async () => {
      await qaPage.waitForLoadState("domcontentloaded");
      await qaPage.locator("text=読み込み中...").waitFor({ state: "detached", timeout: 20_000 }).catch(() => undefined);
    });
  },
});

export { expect, AxeBuilder, QA_VIEWPORTS };

export async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow, "unexpected horizontal scroll").toBe(false);
}

export async function assertAccessibility(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

export async function assertAvailability(page: Page): Promise<void> {
  const text = await page.locator("body").innerText();
  expect(text).toMatch(/利用可能|0件|データ不足|利用できません|算出不能|サンプル不足|データ状態/);
}

export function assertNoConsoleError(browserIssues: BrowserIssue[]): void {
  const errors = browserIssues.filter((issue) => issue.type === "console.error" || issue.type === "pageerror");
  expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
}

export function assertNoNetworkError(browserIssues: BrowserIssue[]): void {
  const errors = browserIssues.filter((issue) => issue.type === "requestfailed" || issue.type.startsWith("http.4") || issue.type.startsWith("http.5") || issue.type === "http.redirect");
  expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
}
