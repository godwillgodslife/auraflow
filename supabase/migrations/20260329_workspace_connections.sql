create table if not exists public.workspace_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  connection_type text not null default 'oauth',
  status text not null default 'pending',
  display_name text,
  external_account_id text,
  external_account_label text,
  connection_metadata jsonb not null default '{}'::jsonb,
  credentials jsonb not null default '{}'::jsonb,
  scopes text[] not null default '{}'::text[],
  token_expires_at timestamptz,
  last_connected_at timestamptz,
  last_refreshed_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_workspace_connections_provider
  on public.workspace_connections(workspace_id, provider);

create index if not exists idx_workspace_connections_workspace
  on public.workspace_connections(workspace_id, updated_at desc);

alter table if exists public.workspace_connections enable row level security;

create policy "workspace_connections_scoped_select" on public.workspace_connections
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_connections.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "workspace_connections_scoped_write" on public.workspace_connections
  for all using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_connections.workspace_id
        and wm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_connections.workspace_id
        and wm.user_id = auth.uid()
    )
  );
