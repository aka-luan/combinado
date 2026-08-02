-- Applied remotely on 2026-08-01 during the push-copy rewrite (Codex session),
-- but the SQL file was never committed. Kept as a no-op stub so local and
-- remote migration histories can converge.
--
-- That rewrite left public.push_outbox in a hybrid shape that broke
-- enqueue_due_push_deliveries (missing unique key for ON CONFLICT). See
-- 20260802180000_restore_push_outbox_unique.sql.
select 1;
