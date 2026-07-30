-- Push subscriptions for the Web Push spike (issue #3 / PRD §10.4).
-- Each installed PWA gets a distinct endpoint; rows are scoped to the
-- authenticated adult via RLS. Household membership arrives in M1.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint)
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "Adults manage their own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role (Edge Functions) bypasses RLS by default; no policy needed
-- for privileged send/cleanup.
