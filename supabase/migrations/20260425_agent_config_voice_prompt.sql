create table if not exists public.agent_config (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null default 'active',
  tone text not null default 'professional',
  instructions text not null default '',
  knowledge_sources jsonb not null default '{}'::jsonb,
  voice_system_prompt text not null default '',
  sms_followup_policy jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id)
);

create index if not exists idx_agent_config_workspace on public.agent_config(workspace_id);

alter table public.agent_config enable row level security;

drop policy if exists "scoped_select" on public.agent_config;
create policy "scoped_select" on public.agent_config
  for select using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = agent_config.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "scoped_write" on public.agent_config;
create policy "scoped_write" on public.agent_config
  for all using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = agent_config.workspace_id
        and wm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = agent_config.workspace_id
        and wm.user_id = auth.uid()
    )
  );

