import { test, expect, assertAccessibility, assertNoConsoleError, assertNoNetworkError, assertNoHorizontalScroll, QA_VIEWPORTS } from "./fixtures";

const ROUTES = [
  "/",
  "/analytics/management",
  "/analytics/store",
  "/analytics/cast",
  "/analytics/trend",
  "/analytics/time",
  "/analytics/diary",
  "/analytics/performance",
  "/data-health",
  "/settings/goals",
];

test.describe("Analytics release smoke", () => {
  test("all required routes load with no blocking accessibility violations", async ({ qaPage, browserIssues, login, waitAnalyticsLoaded }) => {
    for (const route of ROUTES) {
      await qaPage.goto(route);
      await login();
      await waitAnalyticsLoaded();
      await expect(qaPage).not.toHaveTitle(/Application error|エラー/);
      await assertAccessibility(qaPage);
      await assertNoHorizontalScroll(qaPage);
    }
    assertNoConsoleError(browserIssues);
    assertNoNetworkError(browserIssues);
  });

  for (const [name, viewport] of Object.entries(QA_VIEWPORTS)) {
    test(`responsive smoke: ${name}`, async ({ qaPage, login, waitAnalyticsLoaded }) => {
      await qaPage.setViewportSize(viewport);
      await qaPage.goto("/analytics/management");
      await login();
      await waitAnalyticsLoaded();
      await assertNoHorizontalScroll(qaPage);
    });
  }
});
