"use client";

import { useEffect, useRef, useState } from "react";
import { shouldOfferPwaUpdate } from "@/lib/pwa/update-gate";
import { useIsInteractionBusy } from "@/lib/pwa/use-interaction-busy";

/**
 * Registers the app shell SW, downloads updates in the background, and offers
 * activation only when no confirmation/edit is in progress (PRD §18).
 */
export function RegisterServiceWorker() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const interactionBusy = useIsInteractionBusy();
  const offerUpdate = shouldOfferPwaUpdate({
    hasWaitingWorker: waitingWorker !== null,
    interactionBusy,
  });
  const updateIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | undefined;

    const trackWaiting = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) setWaitingWorker(reg.waiting);
    };

    const onUpdateFound = () => {
      if (!registration) return;
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          trackWaiting(registration!);
        }
      });
    };

    void navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (cancelled) return;
        registration = reg;
        trackWaiting(reg);
        reg.addEventListener("updatefound", onUpdateFound);
        updateIntervalRef.current = window.setInterval(() => {
          void reg.update().catch(() => {});
        }, 60 * 60 * 1000);
      })
      .catch(() => {
        // Registration failures are non-fatal: the app still works online.
      });

    return () => {
      cancelled = true;
      registration?.removeEventListener("updatefound", onUpdateFound);
      if (updateIntervalRef.current !== null) {
        window.clearInterval(updateIntervalRef.current);
      }
    };
  }, []);

  function applyUpdate() {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    waitingWorker.addEventListener("statechange", () => {
      if (waitingWorker.state === "activated") {
        window.location.reload();
      }
    });
  }

  if (!offerUpdate) return null;

  return (
    <div className="pwa-update-banner" data-pwa-update-offer role="status">
      <p>Nova versão disponível.</p>
      <button type="button" onClick={applyUpdate}>
        Atualizar
      </button>
    </div>
  );
}
