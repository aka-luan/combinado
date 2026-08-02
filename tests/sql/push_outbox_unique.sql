-- Regression: dose enqueue needs the issue #11 unique key when occurrence_ref exists.
-- Catches the Aug 1 push-copy hybrid schema drift that 500'd process-push-outbox.

\set ON_ERROR_STOP on

do $$
declare
  has_occurrence_ref boolean;
  has_unique boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_outbox'
      and column_name = 'occurrence_ref'
  ) into has_occurrence_ref;

  if not has_occurrence_ref then
    raise notice 'skip: push_outbox has no occurrence_ref (ops skeleton only)';
    return;
  end if;

  select exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'push_outbox'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) like '%occurrence_ref%'
      and pg_get_constraintdef(c.oid) like '%delivery_type%'
      and pg_get_constraintdef(c.oid) like '%user_id%'
      and pg_get_constraintdef(c.oid) like '%subscription_id%'
  ) into has_unique;

  if not has_unique then
    raise exception
      'push_outbox missing unique(delivery_type, occurrence_ref, user_id, subscription_id) required by enqueue_due_push_deliveries';
  end if;
end $$;
