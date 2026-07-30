# AGENTS.md — Combinado operating contract

Combinado is a private family-coordination PWA for exactly two Adults in one
Casa. Hoje is the only primary surface; Amanhã appears inline after 19h. Each
confirmable compromisso has at most one Responsável. Shared Registro of
compromissos and medicação doses matters more than push. The app never offers
medical advice.

Stack: Next.js static export + TypeScript (`src/`), Cloudflare Pages Free
(`*.pages.dev`), Supabase Postgres + Auth OTP + Realtime + RLS + Edge Functions
+ Cron, Web Push + VAPID, pnpm. UI locale is `pt-BR`; household timezone is
fixed `America/Sao_Paulo`.

## Start here

- [`README.md`](README.md): setup, commands, env, auth/push/deploy pointers.
- [`PRD.md`](PRD.md): product law — domain, screens, auth, offline, milestones.
- Runbooks before touching an area: [`docs/runbook-auth.md`](docs/runbook-auth.md),
  [`docs/runbook-household.md`](docs/runbook-household.md),
  [`docs/runbook-push.md`](docs/runbook-push.md).
- Read `CONTEXT.md` when present and relevant ADRs under `docs/adr/`; see
  [`docs/agents/domain.md`](docs/agents/domain.md). Absence is not an error.

## Non-negotiables

1. Use PRD vocabulary in code, tests, issues, and proposals: **Adulto** (not
   admin/owner), **Casa** / **household**, **Ocorrência**, **Responsável**,
   **Hoje** / **Amanhã**, **Registro**. Surface missing concepts as gaps.
2. Exactly one household and two authenticated Adults with identical
   permissions. No public signup, no visible multi-tenancy, no child accounts.
3. Hoje is the only primary navigation. Do not add weekly/monthly calendars or
   views beyond Hoje/Amanhã without an explicit PRD change.
4. Shared Registro beats push. Push may fail; never leave shared state wrong or
   confirm visually without persistence.
5. Frontend gets only public Supabase credentials (`NEXT_PUBLIC_*`). Secrets
   (VAPID private, Gmail App Password, DB password, backup keys) stay in
   Supabase, GitHub Actions, or offline — never in the static bundle or git.
6. Authorization is RLS by `household_id` + membership via `auth.uid()`. Never
   authorize from `user_metadata`. Unauthenticated users read nothing.
7. The app is not medical advice: no dosing guidance, delay interpretation, or
   compensation suggestions.
8. Stay inside PRD §23 out-of-scope unless the PRD itself changes.

## Working principles

- Explore boldly while planning; implementation stays within agreed scope.
- Prefer the simplest complete solution. Do not solve hypothetical problems or
  add single-use abstractions and unrequested configurability.
- Make surgical changes, remove only orphans your work creates, and verify in
  proportion to risk.
- Free-tier limits are real: name budgets and failures explicitly; migrate to
  paid only after proven central pain or sustained quota pressure (PRD §15.2).

## Verification baseline

Use Node 22, matching CI. Prefer root scripts: `pnpm lint`, `pnpm typecheck`,
`pnpm test:unit`, `pnpm test:rls`, `pnpm build`, `pnpm test:e2e`, and full
`pnpm test` when touching shared logic, auth, RLS, or build/SW output. UI work
should be checked on an iPhone-sized viewport (≈390×844) as well as desktop.

## Deploy discipline

- Prefer a branch and PR. Push to `main` that passes CI deploys production via
  Cloudflare Pages (`wrangler pages deploy out --project-name=combinado`).
- Never commit secrets. CI injects `NEXT_PUBLIC_*` from GitHub Actions secrets
  at build time; Cloudflare Pages dashboard env vars do not feed this path.
- Manual deploy only when needed, after a production `pnpm build`:
  `pnpm dlx wrangler@4 pages deploy out --project-name combinado`.

## Trackers

Issues and PRDs live in GitHub Issues for `aka-luan/combinado`; follow
[`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md). Use the five
labels mapped in [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).
External PRs are not a triage intake surface.
