"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { resolveGateView } from "@/lib/auth/gate-view";
import { mapAuthError } from "@/lib/auth/errors";
import { LoginFlow } from "./LoginFlow";
import { Brand } from "@/components/shell/Brand";
import { ConnectivityNotice } from "@/app/connectivity-notice";

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="public-shell" data-public-shell>
      <div className="public-shell__topline">
        <Brand heading />
        <span className="public-shell__private">Privado</span>
      </div>
      <ConnectivityNotice surface="access" />
      {children}
    </section>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => getSupabaseBrowserClient());
  const [status, setStatus] = useState<"loading" | "ready">(client ? "loading" : "ready");
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;

    client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(data.session);
      setSessionError(error ? mapAuthError(error) : null);
      setStatus("ready");
    }).catch(() => {
      if (!active) return;
      setSession(null);
      setSessionError(mapAuthError(null));
      setStatus("ready");
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      setSessionError(null);
      setStatus("ready");
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [client]);

  if (client === null) {
    return (
      <PublicShell>
        <p data-auth-config-missing>
          Autenticação não está configurada para este ambiente.
        </p>
      </PublicShell>
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
        <PublicShell>
          <p data-auth-loading>Carregando o acesso…</p>
        </PublicShell>
      );
    case "login":
      return (
        <PublicShell>
          <LoginFlow client={client} initialError={sessionError} />
        </PublicShell>
      );
    case "authenticated":
      return <>{children}</>;
  }
}
