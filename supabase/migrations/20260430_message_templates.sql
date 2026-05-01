create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'sms')),
  name text not null,
  template_key text not null,
  content_sid text,
  approval_status text not null default 'pending' check (approval_status in ('ready', 'pending', 'rejected', 'approved')),
  description text,
  variables jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists message_templates_workspace_template_key_idx
  on public.message_templates (workspace_id, template_key);

create index if not exists message_templates_workspace_channel_idx
  on public.message_templates (workspace_id, channel);

alter table public.message_templates enable row level security;
alter table public.message_templates force row level security;

drop policy if exists "workspace members can view message templates" on public.message_templates;
create policy "workspace members can view message templates"
  on public.message_templates
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = message_templates.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "workspace owners can manage message templates" on public.message_templates;
create policy "workspace owners can manage message templates"
  on public.message_templates
  for all
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = message_templates.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = message_templates.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );
