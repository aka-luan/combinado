"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestOtp, signInWithTemporaryPassword, verifyOtp } from "@/lib/auth/session";
import { mapAuthError } from "@/lib/auth/errors";
import { isCodeExpired, secondsUntilResend } from "@/lib/auth/otp-timing";

type Step = "email" | "code" | "password";

function LoginPending({ children }: { children: React.ReactNode }) {
  return (
    <p className="login-card__pending" data-login-pending role="status" aria-live="polite">
      {children}
    </p>
  );
}

export function LoginFlow({
  client,
  initialError = null,
}: {
  client: SupabaseClient;
  initialError?: string | null;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (step !== "code") return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [step]);

  const cooldown = sentAt ? secondsUntilResend(sentAt, now) : 0;
  const expired = sentAt ? isCodeExpired(sentAt, now) : false;

  async function sendCode() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Informe um e-mail para continuar.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const result = await requestOtp(client, normalizedEmail);
      if (!result.ok) {
        setError(mapAuthError(result.error));
        return;
      }
      setEmail(normalizedEmail);
      const sent = new Date();
      setSentAt(sent);
      setNow(sent);
      setCode("");
      setStep("code");
    } catch {
      setError(mapAuthError(null));
    } finally {
      setPending(false);
    }
  }

  async function handleRequestSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendCode();
  }

  async function handleVerifySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await verifyOtp(client, email, code);
      if (!result.ok) setError(mapAuthError(result.error));
      // On success, Supabase's onAuthStateChange fires SIGNED_IN and AuthGate
      // renders the authenticated surface; no local transition is needed.
    } catch {
      setError(mapAuthError(null));
    } finally {
      setPending(false);
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    setPending(true);
    setError(null);
    try {
      const result = await signInWithTemporaryPassword(client, normalizedEmail, password);
      if (!result.ok) setError(mapAuthError(result.error));
    } catch {
      setError(mapAuthError(null));
    } finally {
      setPending(false);
    }
  }

  function correctEmail() {
    setStep("email");
    setCode("");
    setSentAt(null);
    setError(null);
  }

  if (step === "password") {
    return (
      <form className="login-card" onSubmit={handlePasswordSubmit} data-login-step="password">
        <p className="login-card__eyebrow">Acesso alternativo</p>
        <h1>Senha temporária</h1>
        <p>Use a senha definida administrativamente para recuperar o acesso.</p>
        <p className="login-card__privacy">Este acesso é privado aos dois Adultos da Casa.</p>
        <label htmlFor="login-password-email">E-mail</label>
        <input
          id="login-password-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          disabled={pending}
          autoFocus
        />
        <label htmlFor="login-password">Senha temporária</label>
        <input
          id="login-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
        />
        {pending ? <LoginPending>Entrando…</LoginPending> : null}
        {error ? <p className="login-card__error" role="alert">{error}</p> : null}
        <button type="submit" disabled={pending || email.trim().length === 0 || password.length === 0}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
        <button type="button" className="login-card__secondary" onClick={() => { setStep("email"); setError(null); }} disabled={pending}>
          Voltar para o código por e-mail
        </button>
      </form>
    );
  }

  if (step === "email") {
    return (
      <form className="login-card" onSubmit={handleRequestSubmit} data-login-step="email">
        <p className="login-card__eyebrow">Acesso por e-mail</p>
        <h1>Entrar na Casa</h1>
        <p>Use o e-mail autorizado para receber um código de acesso.</p>
        <p className="login-card__privacy">O Registro é privado e compartilhado apenas pelos dois Adultos da Casa.</p>
        <label htmlFor="login-email">E-mail</label>
        <input
          id="login-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          disabled={pending}
          autoFocus
        />
        {email.trim().length === 0 ? <p className="login-card__hint">Digite seu e-mail para continuar.</p> : null}
        {pending ? <LoginPending>Enviando código…</LoginPending> : null}
        {error ? <p className="login-card__error" role="alert">{error}</p> : null}
        <button type="submit" disabled={pending || email.trim().length === 0}>
          {pending ? "Enviando…" : "Continuar com e-mail"}
        </button>
        <button type="button" className="login-card__secondary" onClick={() => { setStep("password"); setError(null); }} disabled={pending}>
          Usar senha temporária
        </button>
      </form>
    );
  }

  return (
    <form className="login-card" onSubmit={handleVerifySubmit} data-login-step="code">
      <p className="login-card__eyebrow">Confirmação por e-mail</p>
      <h1>Digite o código</h1>
      <p>Se este e-mail estiver autorizado, o código chega em instantes. Ele vale por 10 minutos.</p>
      <button type="button" className="login-card__email" data-login-correct-email onClick={correctEmail} disabled={pending}>
        Corrigir e-mail
      </button>
      <label htmlFor="login-code">Código de seis dígitos</label>
      <input
        id="login-code"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoComplete="one-time-code"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        disabled={pending || expired}
        autoFocus
      />
      {expired ? <p className="login-card__error" role="alert">Código expirado. Solicite um novo código.</p> : null}
      {cooldown > 0 ? <p className="login-card__hint" data-login-cooldown>Você poderá reenviar em {cooldown}s.</p> : null}
      {pending ? <LoginPending>Verificando código…</LoginPending> : null}
      {error ? <p className="login-card__error" role="alert">{error}</p> : null}
      <button type="submit" disabled={pending || expired || code.length !== 6}>
        {pending ? "Verificando…" : "Confirmar código"}
      </button>
      <button type="button" className="login-card__secondary" disabled={pending || cooldown > 0} onClick={() => void sendCode()}>
        {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
      </button>
    </form>
  );
}
