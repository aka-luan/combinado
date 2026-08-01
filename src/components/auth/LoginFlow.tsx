"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestOtp, verifyOtp, signInWithTemporaryPassword } from "@/lib/auth/session";
import { mapAuthError } from "@/lib/auth/errors";
import { secondsUntilResend, isCodeExpired } from "@/lib/auth/otp-timing";

type Step = "email" | "code" | "password";

export function LoginFlow({ client }: { client: SupabaseClient }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (step !== "code") return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [step]);

  const cooldown = sentAt ? secondsUntilResend(sentAt, now) : 0;
  const expired = sentAt ? isCodeExpired(sentAt, now) : false;

  async function sendCode() {
    setPending(true);
    setError(null);
    const result = await requestOtp(client, email);
    setPending(false);
    if (!result.ok) {
      setError(mapAuthError(result.error));
      return;
    }
    setSentAt(new Date());
    setCode("");
    setStep("code");
  }

  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    await sendCode();
  }

  async function handleVerifySubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await verifyOtp(client, email, code);
    setPending(false);
    if (!result.ok) {
      setError(mapAuthError(result.error));
    }
    // On success, Supabase's onAuthStateChange fires SIGNED_IN and AuthGate
    // re-renders as authenticated — no local state transition needed here.
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await signInWithTemporaryPassword(client, email, password);
    setPending(false);
    if (!result.ok) {
      setError(mapAuthError(result.error));
    }
  }

  if (step === "password") {
    return (
      <form onSubmit={handlePasswordSubmit} data-login-step="password">
        <h1>Senha temporária</h1>
        <p>Use a senha definida administrativamente para recuperar o acesso.</p>
        <label htmlFor="login-password-email">E-mail</label>
        <input
          id="login-password-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="login-password">Senha temporária</label>
        <input
          id="login-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={pending || email.length === 0 || password.length === 0}>
          Entrar
        </button>
        <button type="button" onClick={() => setStep("email")}>
          Voltar para o código por e-mail
        </button>
      </form>
    );
  }

  if (step === "email") {
    return (
      <form onSubmit={handleRequestSubmit} data-login-step="email">
        <h1>Entrar</h1>
        <label htmlFor="login-email">E-mail</label>
        <input
          id="login-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={pending || email.length === 0}>
          Enviar código
        </button>
        <button type="button" onClick={() => setStep("password")}>
          Usar senha temporária
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleVerifySubmit} data-login-step="code">
      <h1>Digite o código</h1>
      <p>Enviamos um código de seis dígitos para {email}.</p>
      <label htmlFor="login-code">Código</label>
      <input
        id="login-code"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {expired && <p role="alert">Código expirado. Solicite um novo código.</p>}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending || expired || code.length !== 6}>
        Confirmar
      </button>
      <button type="button" disabled={pending || cooldown > 0} onClick={sendCode}>
        {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
      </button>
    </form>
  );
}
