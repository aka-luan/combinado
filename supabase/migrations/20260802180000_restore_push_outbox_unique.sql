-- Restore dose-reminder enqueue after the Aug 1 push-copy rewrite left a
-- hybrid push_outbox schema. public.enqueue_due_push_deliveries inserts with:
--   on conflict (delivery_type, occurrence_ref, user_id, subscription_id)
-- and that unique key must exist or every cron/manual worker run 500s.
--
-- Guarded: main's ops skeleton outbox has no occurrence_ref; only the
-- issue #11 / hybrid production shape needs this key.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_outbox'
      and column_name = 'occurrence_ref'
  ) then
    alter table public.push_outbox
      drop constraint if exists push_outbox_unique_delivery;

    alter table public.push_outbox
      add constraint push_outbox_unique_delivery unique (
        delivery_type, occurrence_ref, user_id, subscription_id
      );

    comment on constraint push_outbox_unique_delivery on public.push_outbox is
      'Idempotency key for enqueue_due_push_deliveries (issue #11).';
  end if;
end $$;
