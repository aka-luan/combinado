"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { resolveGateView } from "@/lib/auth/gate-view";
import { BrandMark } from "@/components/brand/BrandMark";
import { LoginScreen } from "./LoginScreen";

function GateBrand() {
  return (
    <header className="login-screen__brand login-screen__brand--compact">
      <BrandMark className="login-screen__mark" />
      <h1 className="login-screen__wordmark">Combinado</h1>
    </header>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
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
      <div data-login-screen className="login-screen">
        <GateBrand />
        <p data-auth-config-missing className="login-screen__gate-message">
          Autenticação não está configurada para este ambiente.
        </p>
      </div>
    );
  }

  const view = resolveGateView({ configured: true, status, hasSession: session !== null });

  switch (view) {
    case "config-missing":
      // Unreachable: `configured` is always true here — `client` was already
      // checked above. Kept so resolveGateView's return type stays exhaustive.
      return null;
    case "loading":
      return (
        <div data-login-screen className="login-screen">
          <GateBrand />
          <p data-auth-loading className="login-screen__gate-message">
            Carregando…
          </p>
        </div>
      );
    case "login":
      return <LoginScreen client={client} />;
    case "authenticated":
      return <>{children}</>;
  }
}
