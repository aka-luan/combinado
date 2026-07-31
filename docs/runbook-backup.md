# Runbook: backup e restauração

Procedimentos para o backup cifrado diário e a restauração da Casa (issue #13 /
PRD §§15.2, 16, 21). Operação **best effort** no plano gratuito — sem SLA e sem
upgrade automático pago quando a cota do GitHub Actions, do artefato ou do
Postgres for atingida; o job simplesmente falha ou atrasa e o estado de backup
fica visível (e “desatualizado” após 26 h sem sucesso).

## O que a automação faz

Workflow [`.github/workflows/backup.yml`](../.github/workflows/backup.yml):

1. `pg_dumpall` (roles, best effort on Supabase Free — may write a stub when
   globals are denied) + `pg_dump` (schema e dados de `public`) + export
   mínimo de `auth.users` (**somente ids**, sem email) para FKs;
2. `tar` + `gzip`;
3. criptografia com `age` usando **somente a chave pública**;
4. upload do artefato **`.tar.gz.age`** (retenção 7 dias);
5. grava `backup_status` (sucesso/falha + código operacional curto).

Nenhum dump em claro é enviado como artefato. Logs passam por
`scripts/backup/with-redacted-logs.sh` (mascara `DATABASE_URL`, senhas,
`AGE-SECRET-KEY-…` e e-mails).

Rehearsal semanal:
[`.github/workflows/backup-restore-rehearsal.yml`](../.github/workflows/backup-restore-rehearsal.yml)
prova dump → cifrar → decifrar → restaurar → verificar numa Postgres descartável
com **keypair efêmero** e dados sintéticos representativos. Isso valida o
caminho de scripts **sem** carregar a chave privada de produção. A restauração
real de um artefato de produção é o procedimento offline abaixo.

## Segredos e chaves

| Material | Onde fica |
| --- | --- |
| `SUPABASE_DB_URL` | GitHub Actions secret (connection string direta do Postgres) |
| `BACKUP_AGE_PUBLIC_KEY` | GitHub Actions secret (`age1…`) |
| Chave privada `age` | **Offline**, em **duas cópias controladas** — nunca no repositório, no Actions, nem no bundle estático |
| Frontend | só `NEXT_PUBLIC_*` públicos; nenhuma chave de backup |

Gerar o par (uma vez, em máquina confiável):

```bash
age-keygen -o combinado-backup.key
# Imprime a public key age1… → guardar como BACKUP_AGE_PUBLIC_KEY
# combinado-backup.key → duas cópias offline controladas; não commitar
```

## Aplicar a migration de status

No SQL Editor (service role), aplicar
`supabase/migrations/20260731130000_backup_status.sql` e:

```sql
notify pgrst, 'reload schema';
```

Adultos autenticados leem via `get_backup_status()` / RLS. Gravação só com papel
privilegiado (`record_backup_run`, `record_backup_restore_rehearsal`).

## Restauração real (produção)

1. Baixar o artefato `.tar.gz.age` do run desejado (Actions → Household backup).
2. Em ambiente offline/controlado, com a chave privada:

```bash
export DATABASE_URL='postgres://…'   # alvo descartável ou staging, nunca improvisar em produção sem plano
export AGE_IDENTITY_FILE=/caminho/offline/combinado-backup.key
./scripts/backup/restore-dump.sh ./combinado-household-….tar.gz.age
./scripts/backup/verify-restore.sh
```

3. Validar Adultos, crianças e ocorrências representativas antes de apontar o app.

## Rehearsal local

Com Postgres 16 local (e opcionalmente uma segunda instância na porta 5433):

```bash
sudo pg_ctlcluster 16 main start   # se necessário
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres \
  node scripts/backup/seed-rehearsal-source.mjs

# segunda base (exemplo: createdb restore_target)
RESTORE_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/restore_target \
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres \
  ./scripts/backup/rehearse-restore.sh
```

## Limites e falhas (best effort)

- Jobs gratuitos podem atrasar ou ser enfileirados; não há retry pago.
- Projeto Supabase Free pode pausar — o backup falha até reativação.
- Artefatos expiram em 7 dias; exclusão total da Casa deixa backups expirarem
  pela política (PRD §16).
- Configurações mostra sucesso/falha e alerta quando o último sucesso passa de
  26 h; sem expor segredos nem dados da família.

## Exclusão total e rotação

Pedido administrativo de exclusão remove household, dados, sessões e
subscriptions; backups restantes apenas expiram. Procedimento canônico:

```sql
select public.delete_household_total('DELETE_CASA');
```

Detalhes e tabletop: [runbook-ops.md](./runbook-ops.md). Ao rotacionar a chave
`age`, gere novo par, atualize `BACKUP_AGE_PUBLIC_KEY`, e mantenha as duas
cópias offline da nova privada (e retire as antigas após a retenção dos
artefatos antigos).
