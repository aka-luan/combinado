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
pnpm run test:unit   # node --test, valida manifest.webmanifest e o gerador do Service Worker
pnpm run build       # next build → exporta site estático em out/, gera ícones e sw.js
pnpm run test:e2e    # Playwright: registro do Service Worker, casca offline
pnpm test            # typecheck + test:unit + build + test:e2e
```

### Variáveis de ambiente

Somente variáveis prefixadas com `NEXT_PUBLIC_` chegam ao cliente — nenhum segredo deve
usar esse prefixo. `.env.development` e `.env.production` versionam a configuração pública
não sensível de cada ambiente; `.env.example` documenta o que precisa existir. Segredos
(Supabase, VAPID, etc.) nunca são lidos pelo frontend estático e não pertencem a este
repositório — ver seção 15 do [PRD](./PRD.md).

## Deploy

O app é exportado como site estático (`next build` com `output: "export"`) e publicado no
Cloudflare Pages (plano Free), hostname estável `*.pages.dev`.

1. `pnpm run build` gera `out/`.
2. No Cloudflare Pages, crie um projeto Git conectado a este repositório com:
   - Build command: `pnpm run build`
   - Output directory: `out`
   - Variável de build `NEXT_PUBLIC_APP_ENV=production` (já default via `.env.production`)
3. Alternativamente, publique manualmente com a Cloudflare CLI autenticada:
   `pnpm exec wrangler pages deploy out --project-name combinado`.

Nenhuma credencial do Cloudflare ou do Supabase é armazenada neste repositório.

## PWA

- `public/manifest.webmanifest` define nome, ícones, `display: standalone` e `id` estável.
- `scripts/generate-sw.mjs` roda após o build e escreve `out/sw.js`: cache com nome
  versionado (hash do conteúdo exportado) contendo somente a casca pública do app.
  Cada deploy invalida o cache anterior.
- Após um primeiro carregamento com sucesso, a casca abre offline; login e dados seguem
  exigindo conexão, o que é sinalizado na tela.
