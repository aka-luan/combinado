# Runbook: operação e diagnóstico (M7)

Procedimentos administrativos para operar e diagnosticar o stack gratuito
(issue #14 / PRD §§15–17, 21, 22, M7). **Best effort, sem SLA** — pausas do
projeto, cotas Free, falha de Gmail/App Password e atraso de jobs gratuitos
interrompem ou atrasam o serviço; não são incidentes de contrato.

Nomes de fornecedores (Supabase, Cloudflare, GitHub, Gmail, VAPID) ficam
**somente** neste material administrativo. A interface dos Adultos mostra
estados úteis (conectividade, sincronização, notificações, frescor de backup)
sem jargão de vendor.

Pointers por área:

| Tema | Documento |
| --- | --- |
| Bootstrap da Casa | [runbook-household.md](./runbook-household.md) |
| Adultos / OTP / senha temporária | [runbook-auth.md](./runbook-auth.md) |
| Push / VAPID / Cron | [runbook-push.md](./runbook-push.md) |
| Backup / restauração | [runbook-backup.md](./runbook-backup.md) |

## Contrato Free (best effort)

- Plano Free pode **pausar** o backend — o app fica sem sync até reativação.
- Cotas Free **interrompem** o serviço; não geram cobrança automática.
- Jobs (Cron, GitHub Actions) podem **atrasar** ou enfileirar.
- Gmail SMTP / App Password pode falhar — OTP para; use senha temporária
  ([runbook-auth.md](./runbook-auth.md)).
- Push isolado falhando **não** encerra o produto se o Registro compartilhado
  funciona (PRD §21).

Migração para plano pago só após dor central comprovada ou pressão sustentada
de cota (PRD §15.2).

## Monitoramento administrativo

Aplicar `supabase/migrations/20260731140000_ops_monitor.sql` e, no SQL Editor
(service role):

```sql
select public.get_ops_monitor_snapshot();
```

Ou, com `DATABASE_URL` privilegiada:

```bash
DATABASE_URL='postgres://…' node scripts/ops/print-monitor.mjs
```

O snapshot expõe (códigos e contagens — sem criança, título, medicamento ou
instrução):

- último cron (`record_cron_heartbeat` — a Function `send-test-push` grava);
- tamanho da outbox pendente / falhas (`push_outbox`);
- erros de Realtime (`record_realtime_error` a partir do PWA);
- último backup com sucesso e último teste de restauração (`backup_status`).

Adultos autenticados **não** leem `ops_status` / outbox / o RPC de snapshot —
auditoria completa não é navegável no app (PRD §17).

Logs operacionais usam `src/lib/ops/redact.ts` (composto em
`scripts/backup/with-redacted-logs.sh` / `record-status.mjs`) e constraints de
código curto (`^[a-z][a-z0-9_]{0,63}$`) em resultados da outbox e em
`push_delivery_logs` (retenção 30 dias via `purge_push_delivery_logs`).

## Bootstrap

Ver [runbook-household.md](./runbook-household.md): provisionar Adultos, aplicar
migrations, `bootstrap_household(...)`.

## Troca de adulto

1. Revogar membership antiga.
2. Provisionar conta autorizada ([runbook-auth.md](./runbook-auth.md)).
3. `bootstrap_household` com o novo par — preservar autoria histórica.

## Recuperação de acesso

Quando OTP falhar: senha temporária no painel Auth → Adulto usa “Usar senha
temporária” no PWA → trocar senha ou voltar ao OTP após restabelecer SMTP
([runbook-auth.md](./runbook-auth.md)).

## Reativação do backend (projeto pausado)

1. Abrir o dashboard do projeto Postgres/Auth hospedado.
2. Se o projeto Free estiver pausado por inatividade, usar a ação de
   **reativar / restore** do painel.
3. Confirmar Auth OTP e uma leitura de `household_agenda_snapshot` com um
   Adulto.
4. Rodar `select public.get_ops_monitor_snapshot();` e, se necessário, um
   disparo manual de push ([runbook-push.md](./runbook-push.md)).
5. O backup diário volta no próximo schedule; se >26 h sem sucesso, Configurações
   mostra backup desatualizado.

## Gmail SMTP / App Password

1. Conta Gmail dedicada com 2FA.
2. Gerar App Password e gravar **somente** nos segredos SMTP do projeto Auth
   (nunca no git nem no bundle `NEXT_PUBLIC_*`).
3. Se App Password expirar ou Gmail falhar: atualizar o segredo SMTP **ou**
   usar recuperação por senha temporária até o SMTP voltar.
4. Testar pedindo OTP no PWA; se falhar, não expor detalhes SMTP ao Adulto —
   a UI já mapeia códigos Auth para mensagens fixas.

## Subscriptions e VAPID

Ver [runbook-push.md](./runbook-push.md): gerar par, alinhar chave pública no
build e privada nos segredos da Function, limpeza 404/410.

## Restauração de backup

Ver [runbook-backup.md](./runbook-backup.md): artefato `.tar.gz.age`, chave
privada offline, restore em alvo controlado, rehearsal semanal.

## Exclusão total da Casa

Pedido administrativo. No SQL Editor (service role):

```sql
select public.delete_household_total('DELETE_CASA');
```

Efeitos:

- remove o household e dados em cascata;
- remove subscriptions de push dos Adultos;
- limpa a outbox;
- invalida sessões / refresh tokens Auth quando o schema hospedado as expõe;
- limpa `ops_status` / `backup_status`;
- **backups cifrados restantes apenas expiram** pela retenção de 7 dias —
  não há restauração “oficial” após exclusão total.

Opcional após exclusão: desativar ou apagar os usuários Auth no painel, e
orientar os Adultos a limpar o PWA (logout remove snapshots locais).

## Rotação de segredos

Não há rotação periódica fixa (PRD §17). Rotacionar após suspeita, vazamento,
troca de operador ou exigência do provedor:

| Segredo | Onde | Notas |
| --- | --- | --- |
| VAPID | Function + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` no CI | Regenerar o par junto; Adultos precisam reinscrever |
| Gmail App Password | SMTP do Auth | Atualizar e testar OTP |
| `PUSH_CRON_SECRET` | Function + Cron SQL | Atualizar ambos |
| Service role / JWT | Projeto Auth | Rotação no painel; atualizar CI/Functions |
| `SUPABASE_DB_URL` | GitHub Actions | Nova connection string |
| Chave `age` de backup | Actions (pública) + offline (privada) | Ver [runbook-backup.md](./runbook-backup.md) |

## Diagnóstico rápido (cron e push)

1. `select public.get_ops_monitor_snapshot();` — cron recente? outbox presa?
2. `select jobname, schedule, active from cron.job;` (painel) — job ativo?
3. Disparo manual da Function ([runbook-push.md](./runbook-push.md)).
4. Configurações no aparelho: notificações ativas / permissão / reinstalação.
5. Falha Free/pausa → best effort; Registro compartilhado continua sendo a
   fonte de verdade.

## Exercício tabletop

Executar (papel e caneta ou checklist) **sem** alterar produção, usando este
runbook. Para cada cenário: sintoma observado → passos do runbook → resultado
esperado → classificação **best effort** (não SLA).

| # | Cenário | Sintoma | Passos | Esperado |
| --- | --- | --- | --- | --- |
| T1 | Recuperação de acesso | OTP não chega | runbook-auth → senha temporária → login no PWA | Adulto entra; SMTP tratado à parte |
| T2 | Backend pausado | Sync/agenda falham; Configurações offline/desatualizado | Reativação do projeto → verificar snapshot → monitor | Serviço volta; jobs atrasados ok |
| T3 | SMTP quebrado | Mesmo que T1 + falha ao reenviar OTP | App Password / SMTP secrets **ou** senha temporária | Login sem vazar Gmail na UI |
| T4 | Push falhou | Sem notificação; Registro ok | Monitor outbox/cron → Function manual → estados de push | Produto segue; push best effort |
| T5 | Restauração de DB | Perda lógica / drill | runbook-backup → restore em alvo controlado / rehearsal | Dados representativos ok; chave privada offline |

Marcar data, quem facilitou, e gaps encontrados no runbook. Não tratar atraso
Free ou silêncio de Focus como regressão de produto.
