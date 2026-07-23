"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { resolveGateView } from "@/lib/auth/gate-view";
import { LoginFlow } from "./LoginFlow";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => getSupabaseBrowserClient());
  const [status, setStatus] = useState<"loading" | "ready">(client ? "loading" : "ready");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;

    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setStatus("ready");
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      setStatus("ready");
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [client]);

  if (client === null) {
    return (
      <p data-auth-config-missing>
        Autenticação não está configurada para este ambiente.
      </p>
    );
  }

  const view = resolveGateView({ configured: true, status, hasSession: session !== null });

  switch (view) {
    case "config-missing":
      // Unreachable: `configured` is always true here — `client` was already
      // checked above. Kept so resolveGateView's return type stays exhaustive.
      return null;
    case "loading":
      return <p data-auth-loading>Carregando…</p>;
    case "login":
      return <LoginFlow client={client} />;
    case "authenticated":
      return <>{children}</>;
  }
}
