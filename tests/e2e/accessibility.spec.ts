import { test, assertAccessibility } from "./fixtures";

const ACCESSIBILITY_ROUTES = [
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

for (const route of ACCESSIBILITY_ROUTES) {
  test(`axe: ${route}`, async ({ qaPage, login, waitAnalyticsLoaded }) => {
    await qaPage.goto(route);
    await login();
    await waitAnalyticsLoaded();
    await assertAccessibility(qaPage);
  });
}
