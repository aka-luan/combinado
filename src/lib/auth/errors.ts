const GENERIC_MESSAGE =
  "Não foi possível concluir a operação. Tente novamente em instantes.";

const MESSAGES_BY_CODE: Record<string, string> = {
  over_email_send_rate_limit: "Aguarde antes de solicitar um novo código.",
  otp_disabled: "Não foi possível concluir o login. Verifique o e-mail e tente novamente.",
  signup_disabled: "Não foi possível concluir o login. Verifique o e-mail e tente novamente.",
  otp_expired: "Código inválido ou expirado. Solicite um novo código.",
  over_request_rate_limit: "Muitas tentativas. Aguarde antes de tentar novamente.",
};

function readCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Maps a Supabase Auth error into a fixed, user-facing message. Only the
 * error `code` is ever inspected — the raw `message`/`status` from the
 * provider is never surfaced, since it can echo back SMTP/account details.
 */
export function mapAuthError(error: unknown): string {
  const code = readCode(error);
  if (code && code in MESSAGES_BY_CODE) {
    return MESSAGES_BY_CODE[code];
  }
  return GENERIC_MESSAGE;
}
