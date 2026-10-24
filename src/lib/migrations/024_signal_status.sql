-- Signal handling status for email_decodes.
-- Idempotent: safe to run multiple times.

alter table if exists public.email_decodes
  add column if not exists signal_status text not null default 'new',
  add column if not exists signal_task_id text,
  add column if not exists signal_status_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_decodes_signal_status_check'
  ) then
    alter table public.email_decodes
      add constraint email_decodes_signal_status_check
      check (signal_status in ('new', 'task_created', 'in_play', 'ignored'));
  end if;
end $$;

create index if not exists idx_email_decodes_signal_status
  on public.email_decodes (org_id, signal_status, created_at desc);
