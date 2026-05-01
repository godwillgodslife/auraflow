alter table if exists public.contacts
  add column if not exists source_provider text,
  add column if not exists external_contact_id text;

alter table if exists public.conversations
  add column if not exists source_provider text,
  add column if not exists external_conversation_id text;

alter table if exists public.messages
  add column if not exists source_provider text,
  add column if not exists external_message_id text,
  add column if not exists provider_message_id text,
  add column if not exists delivery_state text not null default 'received',
  add column if not exists delivery_receipts jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.conversations
  add column if not exists draft_reply text,
  add column if not exists intent text,
  add column if not exists intent_confidence numeric(5, 2);

alter table if exists public.channels
  add column if not exists connection_state text not null default 'disconnected',
  add column if not exists webhook_state text not null default 'unknown',
  add column if not exists relay_setup jsonb not null default '{}'::jsonb,
  add column if not exists token_health jsonb not null default '{}'::jsonb,
  add column if not exists last_webhook_at timestamptz,
  add column if not exists last_sync_at timestamptz;

create table if not exists public.reliability_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  event_type text not null,
  status text not null default 'received',
  replay_key text,
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_contacts_external
  on public.contacts(workspace_id, source_provider, external_contact_id);

create unique index if not exists idx_conversations_external
  on public.conversations(workspace_id, source_provider, external_conversation_id);

create unique index if not exists idx_messages_external
  on public.messages(workspace_id, source_provider, external_message_id);

create unique index if not exists idx_reliability_replay
  on public.reliability_events(workspace_id, provider, replay_key);

create unique index if not exists idx_reliability_dedupe
  on public.reliability_events(workspace_id, provider, dedupe_key);
