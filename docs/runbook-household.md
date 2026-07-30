# Runbook: household bootstrap

Procedimentos para o household singleton e os dois adultos (issue #4 / PRD §§3, 15.1).
Executados no Supabase SQL Editor com privilégio de service role — nunca a partir
do app público.

## Pré-requisito

1. Aplicar as migrations em `supabase/migrations/`, em especial
   `20260730140000_household_foundation.sql`.
2. Provisionar os dois adultos em Authentication (ver `docs/runbook-auth.md`).
3. Anotar os `user_id` (UUID) de cada adulto em Authentication → Users.

## Bootstrap idempotente

No SQL Editor:

```sql
select public.bootstrap_household(
  'ADULT_1_USER_UUID'::uuid,
  'Nome de exibição 1',
  'ADULT_2_USER_UUID'::uuid,
  'Nome de exibição 2'
);
```

Reexecutar com os mesmos UUIDs é seguro: reutiliza o household singleton,
reativa/atualiza as duas memberships e **arquiva** qualquer outro membro ativo
que não esteja no par informado (sempre exatamente dois adultos ativos).

## Verificar

```sql
select * from public.households;
select user_id, display_name, archived_at from public.household_members;
select public.casa_target_label(); -- always 'Casa'
```

Os dois adultos devem ver as mesmas crianças no app (Configurações). Um usuário
autenticado sem membership não lê nem grava dados da casa.

## Troca de adulto

1. `update household_members set archived_at = now() where user_id = 'OLD'`;
2. Provisionar o novo usuário (runbook-auth);
3. `select public.bootstrap_household(...)` incluindo o novo UUID (e o adulto
   que permanece), **ou** inserir a nova membership manualmente no mesmo
   `household_id`.
4. Não apagar registros históricos do adulto substituído.

## Rotina semanal e agenda (M2 / issues #5 e #16)

Aplicar também `20260730160000_agenda_snapshot.sql` e
`20260730170000_create_weekly_routine.sql`.

### Caminho dos adultos (PWA)

Com o household bootstrapado, o primeiro adulto configura a casa **no app**:

1. Sem criança ativa, Hoje mostra `Configurar casa` e aponta para Configurações.
2. Em Configurações → crianças, cadastrar ao menos uma criança (CRUD existente).
3. Em Configurações → rotinas semanais, criar uma rotina (create-only, campos §8.5).
4. Voltar a Hoje: `household_agenda_snapshot` deriva a ocorrência do dia quando a
   rotina começa hoje e o weekday bate — sem semear SQL no dia a dia.

A RPC autenticada é `create_weekly_routine` (ligada a `current_household_id()`).
Edição, versionamento, exceções e arquivo de rotinas ficam em tickets posteriores
(#9 / #10). Rotina informativa (sem confirmação) não pode ter responsável.

### Semente SQL (só testes / service role)

`seed_weekly_routine` **não** é concedida a `authenticated`. Use só em testes
automatizados ou, excepcionalmente, no SQL Editor com service role:

```sql
-- Substitua HOUSEHOLD_ID e CHILD_ID (ou use target_kind 'casa' com child null).
select public.seed_weekly_routine(
  'HOUSEHOLD_ID'::uuid,
  'Levar à escola',
  'child',                  -- ou 'casa'
  'CHILD_ID'::uuid,         -- null se Casa
  array[1,2,3,4,5]::smallint[], -- DOW Postgres: 0=dom … 6=sáb
  '08:30',                  -- ou null (sem horário)
  true,                     -- requer confirmação
  null,                     -- responsável padrão (null = sem responsável → alerta)
  current_date,             -- valid_from (inclusivo)
  null,                     -- valid_until (inclusivo; null = sem fim)
  current_date              -- effective_from da versão
);
```

Verificar o snapshot (como membro autenticado no app, ou no SQL com
`request.jwt.claim.sub` do adulto):

```sql
select public.household_agenda_snapshot();
-- ou relógio controlado:
select public.household_agenda_snapshot(
  ('2026-07-30 19:00:00'::timestamp at time zone 'America/Sao_Paulo')
);
```

Ocorrências **não** são tabela: a RPC deriva Hoje/Amanhã, `server_time`, e
`version` (hash). Antes das 19h (fuso da casa) Amanhã só entra como `count`;
a partir das 19h, `reveal` fica true e a seção inline aparece no app.

