import { test, expect } from "@playwright/test";

test("without Supabase credentials, the app shows a clear config-missing state instead of a broken login", async ({
  page,
}) => {
  // This test is only meaningful when the build has no Supabase env vars.
  // In CI the production build always includes them, so skip there.
  test.skip(!!process.env.CI, "Supabase is configured in CI builds");

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

  await expect(page.locator("h1").first()).toHaveText("Combinado");
  await expect(page.locator("[data-offline-notice]")).toBeVisible();

  await context.setOffline(false);
});

test.describe("authenticated household shell", () => {
  test.skip(
    !process.env.TEST_LOGIN_USERNAME || !process.env.TEST_LOGIN_PASSWORD,
    "Hosted authenticated UI credentials are required for this smoke test",
  );

  test("second Adult lands on Hoje and sees the complete settings catalog", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Usar senha temporária" }).click();
    await page.getByLabel("E-mail").fill(process.env.TEST_LOGIN_USERNAME!);
    await page.getByLabel("Senha temporária").fill(process.env.TEST_LOGIN_PASSWORD!);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.locator('[data-today-primary="true"]')).toBeVisible();
    await page.getByRole("button", { name: "Configurações" }).click();
    await expect(page.locator("[data-ops-status]")).toBeVisible();
    await expect(page.locator("[data-adults-settings]")).toBeVisible();
    await expect(page.locator("[data-children-settings]")).toBeVisible();
    await expect(page.locator("[data-routines-settings]")).toBeVisible();
    await expect(page.locator("[data-medications-settings]")).toBeVisible();
    await expect(page.locator("[data-events-settings]")).toBeVisible();
    await expect(page.locator("[data-push-settings]")).toBeVisible();
    await expect(page.locator("[data-household-information]")).toBeVisible();

    await page.getByRole("button", { name: "Sair" }).click();
    await page.getByRole("button", { name: "Confirmar saída" }).click();
    await expect(page.locator('[data-login-step="email"]')).toBeVisible();
  });
});
