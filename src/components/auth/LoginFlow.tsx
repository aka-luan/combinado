"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestOtp, verifyOtp, signInWithTemporaryPassword } from "@/lib/auth/session";
import { mapAuthError } from "@/lib/auth/errors";
import { secondsUntilResend, isCodeExpired } from "@/lib/auth/otp-timing";
import { IconEnvelope } from "@/components/ui/icons";

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

  async function handleRequestSubmit(e: FormEvent) {
    e.preventDefault();
    await sendCode();
  }

  async function handleVerifySubmit(e: FormEvent) {
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

  async function handlePasswordSubmit(e: FormEvent) {
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
      <form
        onSubmit={handlePasswordSubmit}
        data-login-step="password"
        className="login-form"
      >
        <div className="login-form__heading">
          <h2>Senha temporária</h2>
          <p>Use a senha definida administrativamente para recuperar o acesso.</p>
        </div>
        <label htmlFor="login-password-email">E-mail</label>
        <div className="login-field">
          <IconEnvelope className="login-field__icon" />
          <input
            id="login-password-email"
            type="email"
            required
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <label htmlFor="login-password">Senha temporária</label>
        <div className="login-field login-field--bare">
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="login-form__error">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="login-form__primary"
          disabled={pending || email.length === 0 || password.length === 0}
        >
          Entrar
        </button>
        <button
          type="button"
          className="login-form__secondary"
          onClick={() => setStep("email")}
        >
          Voltar para o código por e-mail
        </button>
      </form>
    );
  }

  if (step === "email") {
    return (
      <form
        onSubmit={handleRequestSubmit}
        data-login-step="email"
        className="login-form"
      >
        <div className="login-form__heading">
          <h2>Entrar com e-mail</h2>
          <p>Enviaremos um código de acesso.</p>
        </div>
        <label className="login-form__sr-label" htmlFor="login-email">
          E-mail
        </label>
        <div className="login-field">
          <IconEnvelope className="login-field__icon" />
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="login-form__error">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="login-form__primary"
          disabled={pending || email.length === 0}
        >
          Enviar código
        </button>
        <button
          type="button"
          className="login-form__secondary"
          onClick={() => setStep("password")}
        >
          Usar senha temporária
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleVerifySubmit}
      data-login-step="code"
      className="login-form"
    >
      <div className="login-form__heading">
        <h2>Digite o código</h2>
        <p>Enviamos um código de seis dígitos para {email}.</p>
      </div>
      <label htmlFor="login-code">Código</label>
      <div className="login-field login-field--bare">
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
      </div>
      {expired && (
        <p role="alert" className="login-form__error">
          Código expirado. Solicite um novo código.
        </p>
      )}
      {error && (
        <p role="alert" className="login-form__error">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="login-form__primary"
        disabled={pending || expired || code.length !== 6}
      >
        Confirmar
      </button>
      <button
        type="button"
        className="login-form__secondary"
        disabled={pending || cooldown > 0}
        onClick={sendCode}
      >
        {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
      </button>
    </form>
  );
}
