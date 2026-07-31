# Combinado

PWA privada para dois adultos coordenarem compromissos familiares e registros de medicação em uma única casa.

O produto está definido em [PRD.md](./PRD.md).

## Estado

O projeto está na fase de especificação e decomposição em tickets.

## Princípios

- Hoje é a única navegação primária.
- Amanhã aparece inline a partir das 19h.
- Cada compromisso confirmável possui no máximo um responsável.
- O registro compartilhado é mais importante que notificações.
- O aplicativo não oferece orientação médica.

## Desenvolvimento local

Requisitos: Node.js 22+, [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Outros comandos:

```bash
pnpm run typecheck   # tsc --noEmit
pnpm run test:unit   # node --test, valida helpers de auth/push/household e o SW
pnpm run test:rls    # Postgres: policies do household (CI; local skip se sem psql)
pnpm run build       # next build → exporta site estático em out/, gera ícones e sw.js
pnpm run test:e2e    # Playwright: registro do Service Worker, casca offline
pnpm test            # typecheck + test:unit + test:rls + build + test:e2e
```

### Variáveis de ambiente

Somente variáveis prefixadas com `NEXT_PUBLIC_` chegam ao cliente — nenhum segredo deve
usar esse prefixo. `.env.development` e `.env.production` versionam a configuração pública
não sensível de cada ambiente; `.env.example` documenta o que precisa existir. Segredos
(Supabase, VAPID, etc.) nunca são lidos pelo frontend estático e não pertencem a este
repositório — ver seção 15 do [PRD](./PRD.md).

`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` são as únicas credenciais do
Supabase que o cliente recebe (públicas por design). Sem elas, o app mostra um estado
"não configurado" em vez de uma tela de login quebrada.

## Autenticação

Login por OTP de seis dígitos enviado por Gmail SMTP dedicado, verificado dentro do PWA
instalado — sem cadastro público e sem Magic Link (ver seção 11 do [PRD](./PRD.md)).
Procedimentos administrativos (provisionar os dois adultos, recuperar acesso sem Gmail,
trocar de adulto) estão em [docs/runbook-auth.md](./docs/runbook-auth.md).
O household singleton e as crianças usam RLS por membership —
[docs/runbook-household.md](./docs/runbook-household.md).
A agenda de Hoje/Amanhã vem de `household_agenda_snapshot` (ocorrências derivadas).
Após o bootstrap, o adulto cadastra criança e rotina semanal em Configurações
(`create_weekly_routine`); `seed_weekly_routine` fica só para testes/service role
— ver o mesmo runbook.
Backup cifrado e restauração: [docs/runbook-backup.md](./docs/runbook-backup.md).

## Web Push

Notificações usam Web Push + VAPID (PRD §10). A chave **pública** VAPID entra no build
como `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; a privada e o Cron ficam só no Supabase.
Gere o par com `node scripts/generate-vapid-keys.mjs`. Procedimentos (Function, Cron
Free, matriz nos iPhones, go/no-go) estão em [docs/runbook-push.md](./docs/runbook-push.md).
O resultado do spike fica em [docs/push-spike-result.md](./docs/push-spike-result.md).

## Deploy

O app é exportado como site estático (`next build` com `output: "export"`) e publicado no
Cloudflare Pages (plano Free), hostname estável `*.pages.dev`.

`.github/workflows/ci.yml` faz o deploy automaticamente: todo push em `main` que passa em
typecheck/testes/build roda `wrangler pages deploy out --project-name=combinado`. O build
do Actions embute `NEXT_PUBLIC_*` no bundle estático a partir de secrets do repositório —
variáveis do painel Cloudflare Pages **não** entram nesse caminho. Requer secrets no
GitHub (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN` — token com permissão de "Cloudflare Pages: Edit" para a conta.
- `CLOUDFLARE_ACCOUNT_ID` — Account ID do Cloudflare.
- `NEXT_PUBLIC_SUPABASE_URL` — URL pública do projeto Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon/publishable key (pública por design; ainda assim
  fica fora do git e só entra no build via CI).
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — chave pública VAPID para `PushManager.subscribe`.

Backup diário cifrado (PRD §16 / [`docs/runbook-backup.md`](./docs/runbook-backup.md))
usa secrets adicionais no Actions — **nunca** no frontend:

- `SUPABASE_DB_URL` — connection string Postgres direta (dump/status).
- `BACKUP_AGE_PUBLIC_KEY` — recipient `age1…`. A chave privada permanece offline
  em duas cópias controladas.

Deploy manual (sem esperar o CI), com a Cloudflare CLI autenticada:
`pnpm dlx wrangler@4 pages deploy out --project-name combinado`.

Se o projeto Pages estiver ligado ao Git, use o preset **Next.js (Static HTML
Export)** (`npx next build` → diretório `out`). O preset Next.js padrão
(`@cloudflare/next-on-pages`) não é necessário para este export estático.

Nenhuma credencial do Cloudflare ou do Supabase é armazenada neste repositório.

## PWA

- `public/manifest.webmanifest` define nome, ícones, `display: standalone` e `id` estável.
- `scripts/generate-sw.mjs` roda após o build e escreve `out/sw.js`: cache com nome
  versionado (hash do conteúdo exportado) contendo somente a casca pública do app.
  Cada deploy invalida o cache anterior. A nova versão baixa em segundo plano e só é
  oferecida quando não há confirmação/edição em andamento (PRD §18).
- Após um primeiro carregamento com sucesso, a casca abre offline; login e dados seguem
  exigindo conexão, o que é sinalizado na tela.
- Checklist manual de acessibilidade/performance nos dois iPhones:
  [docs/checklist-a11y-perf.md](./docs/checklist-a11y-perf.md).
