# Mission: Email OTP authentication

## Why
You already understand session cookies. You want a general mental model of email OTP so you can reason about designs like Combinado’s (and the next app you touch) without treating “OTP” as a black box.

## Success looks like
- Explain the difference between a one-time code and a session in one sentence
- Sketch the request → deliver → verify → session dance without looking it up
- Name the usual safeguards (TTL, single-use, rate limits) and why each exists
- Map Combinado’s issue #2 choices onto those general concepts

## Constraints
- Short interactive lessons (completable quickly)
- Build on session/cookie knowledge; do not re-teach that from scratch
- Prefer retrieval practice over long reading

## Out of scope
- Implementing an auth server from scratch
- Deep TOTP/HOTP cryptography (authenticator apps) — later, only if useful
- Push notifications, RLS, and household schema (adjacent Combinado topics)
