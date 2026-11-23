-- Counts CV analyses per person per day. Only the server function can read or write it.
create table if not exists public.cv_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists cv_runs_user_time on public.cv_runs (user_id, created_at);
alter table public.cv_runs enable row level security;
