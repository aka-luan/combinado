// A successful session must survive closing and reopening the installed PWA
// (persistSession + autoRefreshToken); detectSessionInUrl is off because the
// app never signs in via a redirect — the OTP code is entered in-app.
export const AUTH_CLIENT_OPTIONS = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
} as const;
