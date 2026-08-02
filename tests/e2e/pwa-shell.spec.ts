import { test, expect } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function listExportedFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listExportedFiles(path) : Promise.resolve([path]);
    }),
  );
  return files.flat();
}

test("without Supabase credentials, the app shows a clear config-missing state instead of a broken login", async ({
  page,
}) => {
  await page.goto("/");

  // This check is meaningful only for an intentionally unconfigured build.
  // The same E2E suite also exercises the configured production build, so
  // detect the build mode from the public UI rather than the test process env.
  const configMissing = page.locator("[data-auth-config-missing]");
  await expect(
    page.locator("[data-auth-config-missing], [data-login-step], [data-authenticated-shell]"),
  ).toBeVisible();
  if (!(await configMissing.isVisible().catch(() => false))) {
    test.skip(true, "Supabase is configured in this build");
  }

  await expect(configMissing).toBeVisible();
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

test("static export does not contain private operational credentials", async () => {
  const files = await listExportedFiles(join(process.cwd(), "out"));
  const text = (
    await Promise.all(files.map((file) => readFile(file, "utf8").catch(() => "")))
  ).join("\n");
  for (const marker of [
    "PUSH_CRON_SECRET",
    "VAPID_PRIVATE_KEY",
    "SUPABASE_DB_URL",
    "BACKUP_AGE_SECRET_KEY",
    "GMAIL_APP_PASSWORD",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    expect(text, marker).not.toContain(marker);
  }
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

  test("second Adult lands on Hoje and navigates the focused settings catalog", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Usar senha temporária" }).click();
    await page.getByLabel("E-mail").fill(process.env.TEST_LOGIN_USERNAME!);
    await page.getByLabel("Senha temporária").fill(process.env.TEST_LOGIN_PASSWORD!);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.locator('[data-today-primary="true"]')).toBeVisible();
    await page.getByRole("button", { name: "Configurações" }).click();
    await expect(page.locator("[data-settings-index]")).toBeVisible();
    await expect(page.locator("[data-settings-index] h2")).toBeFocused();
    await expect(page.locator("[data-adults-settings]")).toHaveCount(0);
    await page.getByRole("button", { name: "Adultos" }).click();
    await expect(page.locator("[data-adults-settings]")).toBeVisible();
    await expect(page.locator("[data-settings-focused] h2")).toBeFocused();
    await expect(page.locator("[data-adults-settings]")).toContainText("mesmas permissões");
    await expect(page.locator("[data-children-settings]")).toHaveCount(0);
    await page.evaluate(() => window.history.back());
    await expect(page.locator("[data-settings-index]")).toBeVisible();
    await expect(page.locator("[data-settings-index] h2")).toBeFocused();
    await page.evaluate(() => window.history.back());
    await expect(page.locator("[data-settings-content]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Configurações" })).toBeFocused();
    await page.getByRole("button", { name: "Configurações" }).click();
    await page.getByRole("button", { name: "Estado da Casa" }).click();
    await expect(page.locator("[data-ops-status]")).toBeVisible();
    await expect(page.locator("[data-household-information]")).toBeVisible();
    await expect(page.locator("[data-backup-status]")).toHaveCount(0);
    await page.getByRole("button", { name: "Voltar" }).click();
    await page.getByRole("button", { name: "Crianças" }).click();
    await expect(page.locator("[data-children-settings]")).toBeVisible();
    await expect(page.locator("[data-routines-settings]")).toHaveCount(0);
    await expect(page.getByLabel("Nome da Criança")).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Voltar" }).click();
    await page.getByRole("button", { name: "Rotinas semanais" }).click();
    await expect(page.locator("[data-routines-settings]")).toBeVisible();
    await expect(page.locator("[data-medications-settings]")).toHaveCount(0);
    await page.getByRole("button", { name: "Voltar" }).click();
    await page.getByRole("button", { name: "Medicamentos" }).click();
    await expect(page.locator("[data-medications-settings]")).toBeVisible();
    await expect(page.locator("[data-events-settings]")).toHaveCount(0);
    await page.getByRole("button", { name: "Voltar" }).click();
    await page.getByRole("button", { name: "Eventos avulsos" }).click();
    await expect(page.locator("[data-events-settings]")).toBeVisible();
    await expect(page.locator("[data-push-settings]")).toHaveCount(0);
    await page.getByRole("button", { name: "Voltar" }).click();
    await page.getByRole("button", { name: "Notificações" }).click();
    await expect(page.locator("[data-push-settings]")).toBeVisible();
    await page.getByRole("button", { name: "Voltar" }).click();

    await page.getByRole("button", { name: "Medicamentos" }).click();
    await expect(page.locator("[data-medication-slots]")).toBeVisible();
    await expect(page.locator("[data-medication-slots] input[type=time]")).toHaveCount(1);
    await page.getByRole("button", { name: "Adicionar horário" }).click();
    await expect(page.locator("[data-medication-slots] input[type=time]")).toHaveCount(2);
    await page.getByRole("button", { name: "Voltar" }).click();

    await page.evaluate(async (userId) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("combinado-agenda", 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("snapshots")) {
            request.result.createObjectStore("snapshots", { keyPath: "userId" });
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("snapshots", "readwrite");
          transaction.objectStore("snapshots").put({ userId });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    }, "00000000-0000-4000-8000-000000000052");

    await page.getByRole("button", { name: "Sair" }).click();
    await page.getByRole("button", { name: "Confirmar saída" }).click();
    await expect(page.locator('[data-login-step="email"]')).toBeVisible();
    const cachedAfterLogout = await page.evaluate(async (userId) => {
      return await new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open("combinado-agenda", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("snapshots", "readonly");
          const read = transaction.objectStore("snapshots").get(userId);
          read.onsuccess = () => {
            db.close();
            resolve(read.result ?? null);
          };
          read.onerror = () => reject(read.error);
        };
      });
    }, "00000000-0000-4000-8000-000000000052");
    expect(cachedAfterLogout).toBeNull();
  });
});
