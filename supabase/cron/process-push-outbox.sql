-- Schedule the production push outbox worker (issue #11 / PRD §10, M7).
-- Replace PROJECT_REF and set secrets before enabling. Prefer this over the
-- spike job in send-test-push.sql once dose reminders are live.
-- See docs/runbook-push.md.

-- Prerequisites (once per project, via Dashboard SQL if not already on):
--   create extension if not exists pg_cron with schema pg_catalog;
--   create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'combinado-process-push-outbox';

select cron.schedule(
  'combinado-process-push-outbox',
  -- Every minute: enqueue due doses / 22:00 summary, claim, send, complete.
  '* * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.push_outbox_function_url', true),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'x-cron-secret', current_setting('app.settings.push_cron_secret', true)
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Configure once (session/database settings or wrap in a Vault-backed function):
--   alter database postgres set app.settings.push_outbox_function_url =
--     'https://PROJECT_REF.supabase.co/functions/v1/process-push-outbox';
--   alter database postgres set app.settings.service_role_key = 'SERVICE_ROLE_KEY';
--   alter database postgres set app.settings.push_cron_secret = 'PUSH_CRON_SECRET';
--
-- Unschedule the spike job when cutting over:
--   select cron.unschedule(jobid) from cron.job where jobname = 'combinado-send-test-push';
