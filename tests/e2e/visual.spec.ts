import { test, expect } from "./fixtures";

const VISUAL_ROUTES = ["/", "/analytics/management", "/analytics/store", "/analytics/cast", "/analytics/trend", "/analytics/time", "/data-health"];

for (const route of VISUAL_ROUTES) {
  test(`visual baseline: ${route}`, async ({ qaPage, login, waitAnalyticsLoaded }) => {
    await qaPage.goto(route);
    await login();
    await waitAnalyticsLoaded();
    await expect(qaPage).toHaveScreenshot(`${route.replaceAll("/", "_") || "home"}.png`, { fullPage: true, animations: "disabled" });
  });
}
