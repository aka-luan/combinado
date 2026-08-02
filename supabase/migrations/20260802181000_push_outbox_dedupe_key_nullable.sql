-- Old enqueue_due_push_deliveries does not populate dedupe_key. The Aug 1
-- push-copy rewrite added dedupe_key as NOT NULL, so dose inserts still 500
-- after the unique-key restore. Drop the NOT NULL so the proven worker path
-- can enqueue again; the unfinished push-worker rewrite can tighten this later.
--
-- Guarded for databases that never received the push-copy columns.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_outbox'
      and column_name = 'dedupe_key'
  ) then
    alter table public.push_outbox
      alter column dedupe_key drop not null;
  end if;
end $$;
