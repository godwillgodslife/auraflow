create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_provider text not null default 'manual',
  external_lead_id text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  name text not null,
  email text,
  phone text,
  phone_e164 text,
  company text,
  lead_stage text not null default 'new',
  lead_score numeric(12, 2) not null default 0,
  capture_reason text,
  captured_from text,
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, source_provider, external_lead_id)
);

create index if not exists leads_workspace_email_idx on public.leads (workspace_id, email);
create index if not exists leads_workspace_phone_idx on public.leads (workspace_id, phone_e164);
create index if not exists leads_workspace_stage_idx on public.leads (workspace_id, lead_stage);
