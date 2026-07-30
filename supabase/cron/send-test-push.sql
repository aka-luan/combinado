-- Schedule the Web Push spike sender on Supabase Free (pg_cron + pg_net).
-- Replace PROJECT_REF and set secrets before enabling. Pause after the
-- go/no-go matrix — see docs/runbook-push.md.

-- Prerequisites (once per project, via Dashboard SQL if not already on):
--   create extension if not exists pg_cron with schema pg_catalog;
--   create extension if not exists pg_net with schema extensions;

-- Store the invoke secret in Vault (Dashboard → Project Settings → Vault),
-- then reference it below. Do not commit real secrets.

select cron.unschedule(jobid)
from cron.job
where jobname = 'combinado-send-test-push';

select cron.schedule(
  'combinado-send-test-push',
  -- Every 15 minutes during the spike; unschedule after verification.
  '*/15 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.push_function_url', true),
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
--   alter database postgres set app.settings.push_function_url =
--     'https://PROJECT_REF.supabase.co/functions/v1/send-test-push';
--   alter database postgres set app.settings.service_role_key = 'SERVICE_ROLE_KEY';
--   alter database postgres set app.settings.push_cron_secret = 'PUSH_CRON_SECRET';
--
-- Prefer Vault + a SECURITY DEFINER wrapper in production ops; the settings
-- above are documented for the Free-plan spike only.
