create table if not exists public.training_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_type text not null default 'document',
  title text not null,
  body text not null,
  tags text[] not null default '{}'::text[],
  relevance text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.conversations
  add column if not exists ai_draft_reply text;

create index if not exists idx_training_sources_workspace on public.training_sources(workspace_id);
alter table public.messages enable row level security;
alter table public.conversations enable row level security;
alter table public.training_sources enable row level security;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;

create policy "scoped_select" on public.training_sources
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = training_sources.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy "scoped_write" on public.training_sources
  for all using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = training_sources.workspace_id and wm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = training_sources.workspace_id and wm.user_id = auth.uid()
    )
  );
