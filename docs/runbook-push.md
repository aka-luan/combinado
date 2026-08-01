# Runbook: Web Push

Procedimentos administrativos para VAPID, Cron e o spike de entrega nos dois
iPhones (issue #3 / PRD §§10, 15, M0, 21). Segredos ficam no Supabase e no
CI — nunca neste repositório.

## Gerar e guardar VAPID

1. No workstation: `node scripts/generate-vapid-keys.mjs`.
2. Copie `NEXT_PUBLIC_VAPID_PUBLIC_KEY` para o secret/variável de build do
   GitHub Actions (e localmente em `.env.development` se for testar).
3. No Supabase → Edge Functions → Secrets, defina:
   - `VAPID_KEYS` — **somente** o JSON bruto do script (sem aspas e sem
     `VAPID_KEYS=`). Valor típico começa com `{"publicKey":...`;
   - **ou** `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` em base64url;
   - `VAPID_SUBJECT` — `mailto:` do contato administrativo;
   - `PUSH_CRON_SECRET` — string longa aleatória para o Cron.
4. A chave pública no GitHub e o `VAPID_KEYS` no Supabase devem ser do
   **mesmo** `generate-vapid-keys` — regenerar um lado sem o outro quebra o push.
5. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são injetados nas
   Functions pelo projeto.

## Schema e Function

1. Aplique `supabase/migrations/20260730120000_push_subscriptions.sql` no
   SQL Editor (ou via CLI `supabase db push`).
2. Faça deploy de `supabase/functions/send-test-push`:
   `supabase functions deploy send-test-push --no-verify-jwt`
   (`--no-verify-jwt` porque a autenticação é service role / `x-cron-secret`,
   não o JWT do adulto).
3. Disparo manual de verificação:
   ```bash
   curl -X POST "$SUPABASE_URL/functions/v1/send-test-push" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "x-cron-secret: $PUSH_CRON_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"source":"manual"}'
   ```
4. Endpoints que respondem **404** ou **410** são removidos da tabela
   automaticamente pela Function.

Para validar copy específica nos aparelhos reais, a mesma Function aceita um
payload manual autenticado com a service role. O corpo padrão continua sendo o
teste aprovado (`Teste do Combinado`); o Cron não pode sobrescrever a copy.
Nunca cole a service role, nomes reais ou dados de saúde em issues ou no git.

Exemplo de payload manual:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/send-test-push" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "x-cron-secret: $PUSH_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"source":"manual","title":"Hora de verificar","body":"Criança · Medicamento · 08:00.\nInstrução registrada: texto literal."}'
```

Envie um caso por vez. Para o resumo, use `Amanhã no Combinado` no título e
as contagens/casos sem Responsável no corpo. A Function entrega o mesmo
payload a todas as inscrições ativas; depois observe cada iPhone com o PWA
fechado, na Tela Bloqueada e na Central de Notificações sem expandir.

## Cron no plano Free

1. Habilite as extensões `pg_cron` e `pg_net` no projeto (Database →
   Extensions), se ainda não estiverem.
2. Configure URL/secret conforme os comentários em
   `supabase/cron/send-test-push.sql` e execute o schedule.
3. Durante o spike o job roda a cada 15 minutos. Depois do go/no-go:
   ```sql
   select cron.unschedule(jobid)
   from cron.job
   where jobname = 'combinado-send-test-push';
   ```
4. Falhas de cota Free / pausa do projeto são best effort (PRD §15.2) — não
   tratam push como critério de encerramento do produto (PRD §21).

## Permissão e Focus (iPhone)

- Pedir permissão **somente** no PWA instalado (Tela de Início), depois de
  explicação em Configurações e toque explícito em **Ativar notificações**.
- Focus **sem** allowlist do Combinado pode silenciar alertas — isso é
  limitação esperada, não falha do app.
- Oriente cada adulto a permitir o Combinado nos Modos Foco relevantes
  quando quiserem receber lembretes com Focus ligado.

## Matriz manual (M0)

Executar com o app **fechado** em cada iPhone após login e inscrição ativa:

| Cenário | Resultado esperado |
| --- | --- |
| Wi‑Fi, Focus desligado | Notificação de teste visível |
| Dados móveis, Focus desligado | Notificação de teste visível |
| Focus ligado **com** Combinado permitido | Notificação de teste visível |
| Focus ligado **sem** allowlist | Silêncio esperado — documentar, não tratar como regressão |

Estados em Configurações:

- **Notificações ativas** — permissão concedida + inscrição presente;
- **Permissão necessária** — instalado, ainda sem permissão (ou negada);
- **Reinstalação ou reparo necessário** — não instalado como PWA, ou
  permissão concedida sem inscrição recuperável (botão Reparar quando
  aplicável).

## Diagnóstico rápido

- Sem linhas em `push_subscriptions` → o aparelho não upsertou (instalação,
  permissão ou VAPID público ausente).
- Function `401` → Cron secret / service role incorretos.
- Function `sent` mas tela sem alerta → Focus/rede; repetir matriz.
- `removed > 0` → endpoints obsoletos limpos (404/410); o adulto deve
  reabrir o PWA para reparar.

## Go / no-go do spike

Registrar o resultado em `docs/push-spike-result.md` (modelo versionado) ou
num comentário da issue #3:

- **Go** — ambos os iPhones receberam o teste com app fechado em Wi‑Fi e
  dados; Focus off e Focus+allowlist ok; silence sem allowlist anotado.
- **No-go para notificações no v1** — falha sistêmica de Web Push/Cron no
  Free; o produto segue sem push (PRD M0 / §21). O registro compartilhado
  permanece obrigatório.

## Monitoramento operacional

Último cron, outbox e falhas: [runbook-ops.md](./runbook-ops.md)
(`get_ops_monitor_snapshot` / `scripts/ops/print-monitor.mjs`). A Function
`send-test-push` grava `record_cron_heartbeat` em cada disparo autorizado.
