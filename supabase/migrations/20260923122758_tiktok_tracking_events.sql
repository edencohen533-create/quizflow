-- Browser destination only: no server token is stored or made public.
alter table public.quiz_tracking_events
  add column if not exists send_to_tiktok boolean not null default false;
