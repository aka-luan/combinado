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
3. Em Configurações → rotinas semanais, criar uma rotina (campos §8.5).
4. Voltar a Hoje: `household_agenda_snapshot` deriva a ocorrência do dia quando a
   rotina começa hoje e o weekday bate — sem semear SQL no dia a dia.

A RPC autenticada é `create_weekly_routine` (ligada a `current_household_id()`).
Edição, versionamento, exceções e arquivo de rotinas ficam em tickets posteriores
(#9 / #10). Rotina informativa (sem confirmação) não pode ter responsável.

### Medicamentos (M3 / issue #6)

O app em Cloudflare Pages só ganha a UI; o banco precisa da migration
`supabase/migrations/20260730200000_medications.sql` aplicada no **mesmo**
projeto Supabase do `NEXT_PUBLIC_SUPABASE_URL`.

No SQL Editor (service role):

1. Cole e execute o conteúdo de `20260730200000_medications.sql`.
2. Recarregue o cache do PostgREST:

```sql
notify pgrst, 'reload schema';
```

3. Confirme:

```sql
select to_regprocedure(
  'public.create_medication(uuid, text, text, text[], date, date)'
) is not null as create_medication_ready;

select to_regclass('public.medications') is not null as medications_table_ready;
```

Sem isso, Configurações → Medicamentos mostra formulário mas falha ao salvar
(RPC/tabela ausente). Com a migration aplicada, o Adulto cadastra doses no PWA.

### Compromissos avulsos (M5 / issue #8)

Aplicar também `supabase/migrations/20260731000000_one_off_events.sql` no mesmo
projeto Supabase e recarregar o cache do PostgREST:

```sql
notify pgrst, 'reload schema';
```

Em Configurações → Compromissos avulsos, qualquer Adulto pode criar um
compromisso de hoje ou de uma data futura para uma criança ou para a Casa. Os
dois Adultos veem o mesmo registro; responsável planejado e executor real são
campos distintos. O evento informativo não possui responsável nem ação de
conclusão. Cancelamento, conclusão e correção são RPCs auditadas e não apagam
linhas.

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

### Planejamento de rotinas (M6 / issue #9)

Aplicar também `supabase/migrations/20260731100000_weekly_routine_planning.sql`.
Edições e arquivamento criam uma versão efetiva amanhã; não alteram versões
históricas. O app separa rotinas ativas e arquivadas.

Em Hoje ou Amanhã, tocar uma ocorrência de rotina permite cancelar, remarcar o
horário, trocar/remover o Responsável ou editar esses campos juntos. Cada ação
grava uma exceção imutável para `rotina + data local`; `Restaurar rotina` grava
outra exceção auditada e volta ao padrão. A RPC aceita somente Hoje/Amanhã e
detecta conflitos com a versão/exceção que o Adulto leu.

### Catálogo e manutenção (M6 / issue #10)

Aplicar também `supabase/migrations/20260731110000_household_maintenance.sql` e
recarregar o cache do PostgREST. Depois dessa migration, Configurações deixa de
depender de acesso administrativo para a manutenção comum:

- rotinas e medicamentos podem ser editados, arquivados e reativados; a alteração
  de catálogo vira versão efetiva amanhã e não reescreve o histórico;
- crianças só são arquivadas quando não há rotina ou medicamento ativo dependente;
  reativação grava `active_from` para amanhã e não recria ocorrências anteriores;
- compromissos avulsos cancelados permanecem no catálogo como arquivados;
- os dois Adultos aparecem em uma lista compartilhada, mas troca de Adulto continua
  administrativa e deve preservar autoria, confirmações e auditoria.

O PWA mostra o estado de backup como informação operacional. O backup real continua
sendo o dump cifrado executado pelo GitHub Actions, conforme PRD §16; nenhuma chave
ou senha de backup chega ao bundle estático.
