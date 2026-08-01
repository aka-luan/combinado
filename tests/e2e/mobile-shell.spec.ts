import { expect, test, type Page } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function installWaitingWorkerMock(page: Page) {
  await page.addInitScript(() => {
    const waitingWorker = {
      addEventListener() {},
      postMessage() {},
      state: "installed",
    };
    const registration = {
      addEventListener() {},
      installing: null,
      removeEventListener() {},
      update: async () => undefined,
      waiting: waitingWorker,
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: async () => registration },
    });
  });
}

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.test-signature`;
}

async function openAuthenticatedShell(
  page: Page,
  options: { agenda?: "none" | "ready" | "error" } = {},
) {
  test.skip(!supabaseUrl, "Build-time Supabase URL is required for the authenticated shell");

  const projectRef = new URL(supabaseUrl!).hostname.split(".")[0];
  const userId = "00000000-0000-4000-8000-000000000052";
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = fakeJwt({
    aud: "authenticated",
    email: "adulto@example.com",
    exp: expiresAt,
    role: "authenticated",
    sub: userId,
  });

  await page.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    {
      key: `sb-${projectRef}-auth-token`,
      session: {
        access_token: accessToken,
        expires_at: expiresAt,
        expires_in: 3600,
        refresh_token: "test-refresh-token",
        token_type: "bearer",
        user: {
          app_metadata: { provider: "email", providers: ["email"] },
          aud: "authenticated",
          created_at: "2026-08-01T12:00:00.000Z",
          email: "adulto@example.com",
          id: userId,
          role: "authenticated",
          user_metadata: {},
        },
      },
    },
  );

  let snapshotRequests = 0;
  let snapshotGate: Promise<void> | null = null;
  let releaseSnapshotGate: (() => void) | null = null;
  await page.route(`${supabaseUrl}/rest/v1/**`, async (route) => {
    const url = route.request().url();
    if (options.agenda && url.includes("/rpc/current_household_id")) {
      await route.fulfill({ json: "00000000-0000-4000-8000-000000000051" });
      return;
    }
    if (options.agenda && url.includes("/children?")) {
      await route.fulfill({
        json: [
          {
            active_from: "2026-08-01",
            archived_at: null,
            created_at: "2026-08-01T12:00:00.000Z",
            household_id: "00000000-0000-4000-8000-000000000051",
            id: "00000000-0000-4000-8000-000000000053",
            name: "Nina",
            updated_at: "2026-08-01T12:00:00.000Z",
          },
        ],
      });
      return;
    }
    if (options.agenda && url.includes("/rpc/household_agenda_snapshot")) {
      snapshotRequests += 1;
      if (options.agenda === "error") {
        await route.fulfill({ status: 503, json: { message: "temporarily unavailable" } });
        return;
      }
      if (snapshotGate) await snapshotGate;
      await route.fulfill({
        json: {
          server_time: "2026-08-01T15:00:00.000Z",
          timezone: "America/Sao_Paulo",
          today: { empty_message: "Nada combinado para hoje", local_date: "2026-08-01", occurrences: [] },
          tomorrow: { count: 0, empty_message: "Nada combinado para amanhã", local_date: "2026-08-02", occurrences: [], reveal: false },
          version: "issue-52-test",
        },
      });
      return;
    }
    await route.fulfill({ json: [] });
  });
  await page.goto("/");

  return {
    holdSnapshots() {
      if (snapshotRequests < 1 || snapshotGate) return;
      snapshotGate = new Promise<void>((resolve) => {
        releaseSnapshotGate = resolve;
      });
    },
    releaseSnapshots() {
      releaseSnapshotGate?.();
      snapshotGate = null;
      releaseSnapshotGate = null;
    },
  };
}

test.describe("authenticated mobile shell", () => {
  // Keep mocked Supabase requests routable after reconnect; WebKit bypasses
  // Playwright routes for requests controlled by a service worker.
  test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });

  test("identifies the Casa, Hoje, privacy, and Configurações", async ({ page }) => {
    await openAuthenticatedShell(page);

    const shell = page.locator("[data-authenticated-shell]");
    await expect(shell).toBeVisible();
    await expect(shell.getByText("Combinado", { exact: true })).toBeVisible();
    await expect(shell.getByText("Privado", { exact: true })).toBeVisible();
    await expect(shell.getByRole("heading", { name: "Hoje", level: 1 })).toBeVisible();
    await expect(shell.getByRole("button", { name: "Configurações" })).toBeVisible();
  });

  test("uses complete light and dark semantic tokens", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openAuthenticatedShell(page);

    const light = await page.locator("[data-authenticated-shell]").evaluate((element) => {
      const style = getComputedStyle(element);
      return [
        "--color-background",
        "--color-surface",
        "--color-text",
        "--color-focus",
        "--color-attention",
        "--color-error",
        "--color-offline",
        "--color-persisted",
      ].map((token) => style.getPropertyValue(token).trim());
    });
    expect(light.every(Boolean)).toBe(true);

    await page.emulateMedia({ colorScheme: "dark" });
    const dark = await page.locator("[data-authenticated-shell]").evaluate((element) => {
      const style = getComputedStyle(element);
      return [
        "--color-background",
        "--color-surface",
        "--color-text",
        "--color-focus",
        "--color-attention",
        "--color-error",
        "--color-offline",
        "--color-persisted",
      ].map((token) => style.getPropertyValue(token).trim());
    });
    expect(dark.every(Boolean)).toBe(true);
    expect(dark).not.toEqual(light);
  });

  test("keeps controls reachable with visible keyboard focus", async ({ page }) => {
    await openAuthenticatedShell(page);

    const settings = page.getByRole("button", { name: "Configurações" });
    const box = await settings.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);

    await settings.focus();
    const focus = await settings.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(focus.outlineStyle).not.toBe("none");
    expect(Number.parseFloat(focus.outlineWidth)).toBeGreaterThan(0);

    const shellBox = await page.locator("[data-authenticated-shell]").boundingBox();
    expect(shellBox?.x).toBeGreaterThanOrEqual(0);
    expect((shellBox?.x ?? 0) + (shellBox?.width ?? 0)).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

    await settings.click();
    await expect(page.locator("[data-settings-content]")).toBeVisible();
    const targets = await page.locator("button, input, select, textarea").evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        })
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            height: box.height,
            label: `${element.tagName.toLowerCase()} ${element.getAttribute("type") ?? ""} ${element.textContent?.trim() ?? element.getAttribute("name") ?? ""}`,
            width: box.width,
          };
        }),
    );
    expect(targets.length).toBeGreaterThan(1);
    for (const target of targets) {
      expect(target.width, target.label).toBeGreaterThanOrEqual(44);
      expect(target.height, target.label).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });

  test("distinguishes offline, reconnecting, and ready without enabling writes early", async ({
    page,
    context,
  }) => {
    const network = await openAuthenticatedShell(page, { agenda: "ready" });
    await expect(page.locator('[data-agenda="ready"]')).toBeVisible();

    await context.setOffline(true);
    await expect(page.locator('[data-shell-status="offline"]')).toContainText("Sem conexão");
    await expect(page.locator('[data-agenda="offline"]')).toHaveAttribute(
      "data-writes-allowed",
      "false",
    );

    network.holdSnapshots();
    await context.setOffline(false);
    await page.waitForFunction(() => navigator.onLine);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.locator('[data-shell-status="reconnecting"]')).toContainText(
      "Atualizando o Registro",
    );
    network.releaseSnapshots();
    await expect(page.locator('[data-shell-status="ready"]')).toBeVisible();
  });

  test("explains an update error without claiming persistence", async ({ page }) => {
    await openAuthenticatedShell(page, { agenda: "error" });

    const status = page.locator('[data-shell-status="error"]');
    await expect(status).toContainText("Não foi possível atualizar o Registro");
    await expect(status).toContainText("Nada foi alterado");
    await expect(page.locator('[data-agenda="error"]')).toBeVisible();
  });

  test("does not claim to show cached Registro when offline data is unavailable", async ({
    page,
    context,
  }) => {
    await openAuthenticatedShell(page, { agenda: "error" });
    await expect(page.locator('[data-agenda="error"]')).toBeVisible();

    await context.setOffline(true);
    await expect(page.locator('[data-shell-status="offline"]')).toContainText(
      "Registro está indisponível",
    );
    await expect(page.locator('[data-agenda="unavailable"]')).toContainText(
      "Dados indisponíveis",
    );
  });

  test("keeps the PWA update action exposed with enlarged text and a short viewport", async ({
    page,
  }) => {
    await installWaitingWorkerMock(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await openAuthenticatedShell(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    await page.setViewportSize({ width: 320, height: 420 });

    const banner = page.locator("[data-pwa-update-offer]");
    const update = banner.getByRole("button", { name: "Atualizar" });
    await expect(banner).toBeVisible();
    await expect(update).toBeVisible();
    const bannerBox = await banner.boundingBox();
    const updateBox = await update.boundingBox();
    expect((bannerBox?.y ?? 0) + (bannerBox?.height ?? 0)).toBeLessThanOrEqual(420);
    expect(updateBox?.width).toBeGreaterThanOrEqual(44);
    expect(updateBox?.height).toBeGreaterThanOrEqual(44);

    await update.focus();
    expect(
      await update.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe("none");
    const reservedSpace = await page.locator("main").evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).paddingBottom),
    );
    expect(reservedSpace).toBeGreaterThanOrEqual(bannerBox?.height ?? 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });

  test("keeps the existing desktop shell centered and usable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openAuthenticatedShell(page);

    const shellBox = await page.locator("[data-authenticated-shell]").boundingBox();
    expect(shellBox?.width).toBeLessThanOrEqual(1152);
    expect(shellBox?.x).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Configurações" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
  });
});
