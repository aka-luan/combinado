# Email OTP Resources

## Knowledge

- [NIST SP 800-63B-4 — Authenticators](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/)
  Official taxonomy: passwords, out-of-band secrets, OTP devices, and **session secrets**. Use for: precise vocabulary and why OTP ≠ session.
- [OWASP Multifactor Authentication Cheat Sheet — OTP handling](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
  Practical rules: short TTL, single-use, attempt limits, no logging codes. Use for: what a safe OTP implementation must enforce.
- [Supabase — Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless)
  Primary source for the APIs Combinado uses (`signInWithOtp`, `verifyOtp`, `shouldCreateUser`). Use for: how a real provider turns OTP verify into a session.
- [Combinado — `docs/runbook-auth.md`](./docs/runbook-auth.md)
  How the two adults are provisioned outside the app. Use for: closed signup / admin gate as a product pattern.

## Wisdom (Communities)

- [r/netsec](https://www.reddit.com/r/netsec/)
  High-signal security discussion; use sparingly for “is email OTP good enough for X?” debates.
- Prefer primary docs (NIST / OWASP / Supabase) over forum answers when they conflict.

## Gaps

- No single short “email OTP for web developers” canonical tutorial that is both accurate and non-marketing. Lessons bridge NIST/OWASP vocabulary to Supabase practice using Combinado as the worked example.
