import { test, expect } from "@playwright/test";

test("without Supabase credentials, the app shows a clear config-missing state instead of a broken login", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator("[data-auth-config-missing]")).toBeVisible();
  await expect(page.locator("[data-login-step]")).toHaveCount(0);
});

test("manifest is linked and installable metadata is present", async ({ page }) => {
  await page.goto("/");

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBe("/manifest.webmanifest");

  const manifest = await page.evaluate(async (href) => {
    const res = await fetch(href!);
    return res.json();
  }, manifestHref);

  expect(manifest.name).toBe("Combinado");
  expect(manifest.display).toBe("standalone");
});

test("service worker registers and precaches the app shell", async ({ page }) => {
  await page.goto("/");

  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));

  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames.some((name) => name.startsWith("combinado-app-shell-"))).toBe(true);

  const cachedIndex = await page.evaluate(async () => {
    const names = await caches.keys();
    for (const name of names) {
      const cache = await caches.open(name);
      if (await cache.match("/")) return true;
    }
    return false;
  });
  expect(cachedIndex).toBe(true);
});

test("shell opens offline after one successful load and reports the offline state", async ({
  page,
  context,
  browserName,
}) => {
  // Playwright's WebKit build crashes internally when a Service Worker
  // intercepts a reload under emulated offline conditions (unrelated to our
  // SW code — Chromium exercises the same fetch handler without issue).
  // Real Safari behavior is verified manually per PRD M0.
  test.skip(browserName === "webkit", "Playwright WebKit + SW + offline is unreliable");

  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));

  // The first load registers the worker but isn't controlled by it yet.
  // Reload once online so this client is claimed and future navigations
  // are served through the worker's fetch handler.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();

  await expect(page.locator("h1")).toHaveText("Combinado");
  await expect(page.locator("[data-offline-notice]")).toBeVisible();

  await context.setOffline(false);
});
