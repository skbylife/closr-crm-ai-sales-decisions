-- Tasks table for task board / kanban
create table if not exists tasks (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  account_id text,
  opportunity_id text,
  contact_id text,
  title text not null,
  description text,
  status text default 'todo',       -- todo / in_progress / done / blocked
  priority text default 'medium',   -- low / medium / high / urgent
  due_date text,
  assigned_to text,
  source text,                      -- manual / decode / intel / meddicc
  source_id text,                   -- 关联的 decode/intel ID
  ai_generated boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table tasks enable row level security;

create policy "Users can manage their own tasks"
  on tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
