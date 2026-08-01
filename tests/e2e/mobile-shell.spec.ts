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
  options: { agenda?: "none" | "ready" | "error" | "setup" | "dense" | "tomorrow" } = {},
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
  let setupChildCreated = false;
  let setupRoutineCreated = false;
  await page.route(`${supabaseUrl}/rest/v1/**`, async (route) => {
    const url = route.request().url();
    if (options.agenda === "setup" && route.request().method() === "POST" && url.includes("/children")) {
      setupChildCreated = true;
      await route.fulfill({
        json: {
          active_from: "2026-08-01",
          archived_at: null,
          created_at: "2026-08-01T12:00:00.000Z",
          household_id: "00000000-0000-4000-8000-000000000051",
          id: "00000000-0000-4000-8000-000000000053",
          name: "Nina",
          updated_at: "2026-08-01T12:00:00.000Z",
        },
      });
      return;
    }
    if (options.agenda === "setup" && url.includes("/children?")) {
      await route.fulfill({
        json: setupChildCreated
          ? [
              {
                active_from: "2026-08-01",
                archived_at: null,
                created_at: "2026-08-01T12:00:00.000Z",
                household_id: "00000000-0000-4000-8000-000000000051",
                id: "00000000-0000-4000-8000-000000000053",
                name: "Nina",
                updated_at: "2026-08-01T12:00:00.000Z",
              },
            ]
          : [],
      });
      return;
    }
    if (options.agenda === "setup" && url.includes("/rpc/create_weekly_routine")) {
      setupRoutineCreated = true;
      await route.fulfill({ json: "00000000-0000-4000-8000-000000000054" });
      return;
    }
    if (options.agenda === "setup" && url.includes("/weekly_routines?")) {
      await route.fulfill({
        json: setupRoutineCreated
          ? [
              {
                id: "00000000-0000-4000-8000-000000000054",
                weekly_routine_versions: [
                  {
                    archived: false,
                    child_id: "00000000-0000-4000-8000-000000000053",
                    created_at: "2026-08-01T12:00:00.000Z",
                    default_owner_user_id: null,
                    effective_from: "2026-08-01",
                    id: "00000000-0000-4000-8000-000000000055",
                    requires_confirmation: true,
                    scheduled_time: "08:00",
                    target_kind: "child",
                    title: "Rotina de teste",
                    valid_from: "2026-08-01",
                    valid_until: null,
                    weekdays: [1, 2, 3, 4, 5],
                  },
                ],
              },
            ]
          : [],
      });
      return;
    }
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
    if (
      (options.agenda === "ready" ||
        options.agenda === "error" ||
        options.agenda === "dense" ||
        options.agenda === "tomorrow") &&
      url.includes("/weekly_routines?")
    ) {
      await route.fulfill({
        json: [
          {
            id: "00000000-0000-4000-8000-000000000054",
            weekly_routine_versions: [
              {
                archived: false,
                child_id: "00000000-0000-4000-8000-000000000053",
                created_at: "2026-08-01T12:00:00.000Z",
                default_owner_user_id: null,
                effective_from: "2026-08-01",
                id: "00000000-0000-4000-8000-000000000055",
                requires_confirmation: true,
                scheduled_time: "08:00",
                target_kind: "child",
                title: "Rotina de teste",
                valid_from: "2026-08-01",
                valid_until: null,
                weekdays: [1, 2, 3, 4, 5],
              },
            ],
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
      const dense = options.agenda === "dense";
      const tomorrow = options.agenda === "tomorrow";
      const todayOccurrences = dense
        ? Array.from({ length: 100 }, (_, index) => fixtureOccurrence(index + 1))
        : tomorrow
          ? [fixtureOccurrence(1)]
          : [];
      const tomorrowOccurrences = tomorrow ? [fixtureOccurrence(101, "2026-08-02")] : [];
      await route.fulfill({
        json: {
          server_time: tomorrow ? "2026-08-01T22:00:00.000Z" : "2026-08-01T15:00:00.000Z",
          timezone: "America/Sao_Paulo",
          today: {
            empty_message: todayOccurrences.length === 0 ? "Nada combinado para hoje" : null,
            local_date: "2026-08-01",
            occurrences: todayOccurrences,
          },
          tomorrow: {
            count: tomorrowOccurrences.length,
            empty_message: tomorrowOccurrences.length === 0 ? "Nada combinado para amanhã" : null,
            local_date: "2026-08-02",
            occurrences: tomorrowOccurrences,
            reveal: tomorrow,
          },
          version: `issue-54-${options.agenda}`,
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

function fixtureOccurrence(index: number, localDate = "2026-08-01") {
  const padded = String(index).padStart(3, "0");
  return {
    key: `event:00000000-0000-4000-8000-0000000000${padded}:${localDate}`,
    source: "event",
    source_id: `00000000-0000-4000-8000-0000000000${padded}`,
    local_date: localDate,
    slot: null,
    title:
      index === 1
        ? "Levar a Criança para uma atividade importante com um título comprido para detalhes"
        : `Compromisso ${padded}`,
    target_kind: "child",
    child_id: "00000000-0000-4000-8000-000000000053",
    target_label: index % 5 === 0 ? "Casa" : `Criança ${((index - 1) % 5) + 1}`,
    scheduled_time: `${String(6 + ((index - 1) % 12)).padStart(2, "0")}:${String(index % 4).padStart(2, "0")}0`,
    requires_confirmation: true,
    owner_user_id: index % 3 === 0 ? null : "00000000-0000-4000-8000-000000000052",
    owner_display_name: index % 3 === 0 ? null : "Adulto teste",
    status: index === 100 ? "completed" : "scheduled",
    needs_owner_alert: index % 3 === 0,
    confirmed_by_display_name: index === 100 ? "Adulto teste" : null,
    confirmed_at: index === 100 ? "2026-08-01T12:00:00.000Z" : null,
    confirmation_id: index === 100 ? "00000000-0000-4000-8000-000000000099" : null,
  };
}

async function openLogin(page: Page, options: { otpError?: boolean } = {}) {
  test.skip(!supabaseUrl, "Build-time Supabase URL is required for the login flow");
  await page.route(`${supabaseUrl}/auth/v1/**`, async (route) => {
    if (route.request().url().includes("/otp")) {
      if (options.otpError) {
        await route.fulfill({
          status: 429,
          json: { error_code: "over_email_send_rate_limit", message: "rate limited" },
        });
        return;
      }
      await route.fulfill({ status: 200, json: {} });
      return;
    }
    await route.fulfill({ status: 200, json: {} });
  });
  await page.goto("/");
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

  test("allows correcting the OTP e-mail without reloading and names pending states", async ({ page }) => {
    await openLogin(page);
    await page.getByLabel("E-mail").fill("adulto@exemplo.com");
    await page.getByRole("button", { name: "Continuar com e-mail" }).click();
    await expect(page.locator('[data-login-step="code"]')).toBeVisible();
    await expect(page.locator('[data-login-step="code"]')).toContainText("autorizado");
    await page.getByRole("button", { name: "Corrigir e-mail" }).click();
    await expect(page.locator('[data-login-step="email"]')).toBeVisible();
    await expect(page.getByLabel("E-mail")).toHaveValue("adulto@exemplo.com");
  });

  test("shows a generic authentication error without exposing provider details", async ({ page }) => {
    await openLogin(page, { otpError: true });
    await page.getByLabel("E-mail").fill("adulto@exemplo.com");
    await page.getByRole("button", { name: "Continuar com e-mail" }).click();
    const error = page.locator('[data-login-step="email"] [role="alert"]');
    await expect(error).toContainText("Aguarde");
    await expect(error).not.toContainText("rate limited");
  });

  test("keeps Hoje behind Criança plus a useful setup until the final CTA", async ({ page }) => {
    await openAuthenticatedShell(page, { agenda: "setup" });
    await expect(page.locator('[data-household-home="setup"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Configurar casa" })).toBeVisible();

    await page.getByLabel("Nome da Criança").fill("Nina");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.locator("[data-setup-choice]")).toBeVisible();
    await page.getByRole("button", { name: "Criar Rotina semanal" }).click();
    await page.getByLabel("O que precisa ser combinado?").fill("Levar para a escola");
    await page.getByRole("button", { name: "Salvar Rotina semanal" }).click();
    await expect(page.locator("[data-setup-finish]")).toBeVisible();
    await expect(page.locator('[data-agenda]')).toHaveCount(0);

    await page.getByRole("button", { name: "Criar combinado e abrir o Hoje" }).click();
    await expect(page.locator('[data-agenda="ready"]')).toBeVisible();
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

  test("keeps the snapshot order while giving the first item a Próximo block", async ({ page }) => {
    await openAuthenticatedShell(page, { agenda: "dense" });

    await expect(page.locator("[data-agenda-next]")).toBeVisible();
    await expect(page.locator("[data-agenda-next] h3")).toHaveText("Próximo");
    await expect(page.locator("[data-agenda-next] [data-occurrence-key]")).toHaveAttribute(
      "data-occurrence-key",
      /0001:2026-08-01$/,
    );
    await expect(page.locator("[data-today-list] [data-occurrence-key]")).toHaveCount(99);
    await expect(page.locator("[data-occurrence-key]").filter({ hasText: "Compromisso 100" })).toBeVisible();

    const titles = await page.locator("[data-occurrence-key]").evaluateAll((rows) =>
      rows.slice(0, 4).map((row) => row.querySelector(".occurrence__title")?.textContent),
    );
    expect(titles[0]).toContain("Levar a Criança");
    expect(titles[1]).toBe("Compromisso 002");
    expect(titles[2]).toBe("Compromisso 003");
    expect(titles[3]).toBe("Compromisso 004");
  });

  test("opens one accessible bottom sheet and restores focus on Escape and Voltar", async ({ page }) => {
    await openAuthenticatedShell(page, { agenda: "dense" });

    const trigger = page.locator("[data-agenda-next] [data-occurrence-details]");
    await expect(trigger).toHaveAccessibleName(
      /06:010.*Levar a Criança.*Criança 1.*Programado.*Responsável: Adulto teste/,
    );
    await trigger.click();
    const sheet = page.locator("[data-occurrence-sheet]");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("role", "dialog");
    await expect(sheet).toHaveAttribute("aria-modal", "true");
    await expect(sheet.getByRole("heading").first()).toBeFocused();
    await expect(page.locator("[data-authenticated-shell]")).toHaveAttribute("inert", "");
    await expect(page.locator("[data-occurrence-sheet]")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(page.locator("[data-occurrence-sheet]")).toBeVisible();
    await page.evaluate(() => window.history.back());
    await expect(page.locator("[data-occurrence-sheet]")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("reveals Amanhã at 19h and keeps it readable from a same-day offline cache", async ({
    page,
    context,
  }) => {
    await openAuthenticatedShell(page, { agenda: "tomorrow" });
    await expect(page.locator("[data-tomorrow-inline]")).toBeVisible();
    await expect(page.locator("[data-tomorrow-list] [data-occurrence-key]")).toHaveCount(1);

    await context.setOffline(true);
    await expect(page.locator('[data-agenda="offline"]')).toBeVisible();
    await expect(page.locator("[data-tomorrow-inline]")).toBeVisible();
    await expect(page.locator("[data-tomorrow-date]")).toHaveText("02/08");
    await expect(page.locator("[data-agenda-operational-state]")).toContainText(
      "ações bloqueadas",
    );
  });

  test("shows the primary decision but blocks its write while offline", async ({ page, context }) => {
    await openAuthenticatedShell(page, { agenda: "dense" });
    const confirm = page.locator('[data-agenda-next] [data-complete-event="true"]');
    await expect(confirm).toBeEnabled();

    await context.setOffline(true);
    await expect(page.locator('[data-agenda="offline"]')).toBeVisible();
    await expect(confirm).toBeDisabled();
    await expect(page.locator('[data-agenda="offline"]')).toHaveAttribute(
      "data-writes-allowed",
      "false",
    );
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
