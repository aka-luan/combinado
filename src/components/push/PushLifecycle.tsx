"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { getPushConfig } from "@/lib/push/config";
import { isInstalledPwa, readInstallProbe } from "@/lib/push/install";
import { repairPushSubscription } from "@/lib/push/subscription";

/**
 * On open: if the PWA is installed and notification permission remains
 * granted, recreate a missing local subscription and upsert it (PRD §10.4).
 * Never prompts for permission — that requires an explicit Settings action.
 */
export function PushLifecycle() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const client = getSupabaseBrowserClient();
    const config = getPushConfig();
    if (!client || !config) return;
    if (!isInstalledPwa(readInstallProbe())) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "granted") return;

    let cancelled = false;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (cancelled) return;
        await repairPushSubscription({
          client,
          registration,
          vapidPublicKey: config.vapidPublicKey,
          permission: Notification.permission,
          userAgent: navigator.userAgent,
        });
      } catch {
        // Repair is best-effort; Settings surfaces reinstall/repair when needed.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
