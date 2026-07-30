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
