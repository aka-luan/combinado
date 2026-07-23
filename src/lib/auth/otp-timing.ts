export const RESEND_COOLDOWN_MS = 60_000;
export const CODE_EXPIRY_MS = 10 * 60_000;

export function secondsUntilResend(sentAt: Date, now: Date): number {
  const elapsed = now.getTime() - sentAt.getTime();
  const remaining = RESEND_COOLDOWN_MS - elapsed;
  return Math.max(0, Math.ceil(remaining / 1000));
}

export function isCodeExpired(sentAt: Date, now: Date): boolean {
  return now.getTime() - sentAt.getTime() >= CODE_EXPIRY_MS;
}
