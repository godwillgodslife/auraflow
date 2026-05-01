create table if not exists public.contact_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  provider text not null,
  provider_account_id text,
  external_identity_id text not null,
  external_thread_id text,
  email text,
  phone text,
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contact_identities_workspace on public.contact_identities(workspace_id);
create index if not exists idx_contact_identities_contact on public.contact_identities(contact_id);
create unique index if not exists idx_contact_identities_external on public.contact_identities(workspace_id, provider, external_identity_id);

alter table public.contact_identities enable row level security;

create policy "scoped_select" on public.contact_identities
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = contact_identities.workspace_id and wm.user_id = auth.uid())
  );

create policy "scoped_write" on public.contact_identities
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = contact_identities.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = contact_identities.workspace_id and wm.user_id = auth.uid())
  );
