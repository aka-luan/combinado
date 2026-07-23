export type AuthSession = {
  access_token: string;
};

type AuthClientLike = {
  auth: {
    signInWithOtp(args: {
      email: string;
      options: { shouldCreateUser: false };
    }): Promise<{ data: unknown; error: unknown }>;
    verifyOtp(args: {
      email: string;
      token: string;
      type: "email";
    }): Promise<{ data: { session: AuthSession | null }; error: unknown }>;
    signInWithPassword(args: {
      email: string;
      password: string;
    }): Promise<{ data: { session: AuthSession | null }; error: unknown }>;
    signOut(): Promise<{ error: unknown }>;
  };
};

// `error` is always the raw provider error, never a display string — callers
// map it to a user-facing message (see lib/auth/errors) at the point they
// render it, keeping this module's job to "talk to Supabase", not "word it".
export type AuthResult = { ok: true } | { ok: false; error: unknown };
export type VerifyResult =
  | { ok: true; session: AuthSession }
  | { ok: false; error: unknown; session?: undefined };

export async function requestOtp(client: AuthClientLike, email: string): Promise<AuthResult> {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) return { ok: false, error };
  return { ok: true };
}

export async function verifyOtp(
  client: AuthClientLike,
  email: string,
  code: string,
): Promise<VerifyResult> {
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.session) {
    return { ok: false, error: error ?? { code: "otp_expired" } };
  }
  return { ok: true, session: data.session };
}

export async function signInWithTemporaryPassword(
  client: AuthClientLike,
  email: string,
  password: string,
): Promise<VerifyResult> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return { ok: false, error };
  }
  return { ok: true, session: data.session };
}

export async function signOut(client: AuthClientLike): Promise<void> {
  await client.auth.signOut();
}
