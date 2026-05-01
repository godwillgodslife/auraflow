create extension if not exists "pgcrypto";

do $$ begin
  create type public.message_channel as enum ('whatsapp', 'sms', 'voice', 'instagram', 'messenger');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type public.message_channel add value if not exists 'instagram';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type public.message_channel add value if not exists 'messenger';
exception
  when duplicate_object then null;
end $$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text not null default 'starter',
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  tone text not null default 'balanced',
  instructions text,
  knowledge_sources jsonb not null default '[]'::jsonb,
  channel_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_provider text,
  external_contact_id text,
  name text not null,
  email text,
  phone text,
  phone_e164 text,
  company text,
  lead_stage text not null default 'new',
  owner_name text,
  tags text[] not null default '{}'::text[],
  lifetime_value numeric(12, 2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.business_knowledge (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  topic text not null,
  question text not null,
  answer text not null,
  priority integer not null default 100,
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  channel_type text not null,
  display_name text not null,
  status text not null default 'pending',
  provider_account_id text,
  connection_state text not null default 'disconnected',
  webhook_state text not null default 'unknown',
  relay_setup jsonb not null default '{}'::jsonb,
  token_health jsonb not null default '{}'::jsonb,
  last_webhook_at timestamptz,
  last_sync_at timestamptz,
  external_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  source_provider text,
  external_conversation_id text,
  identity_phone text,
  subject text,
  status text not null default 'open',
  priority text not null default 'normal',
  source text,
  last_message_at timestamptz,
  assigned_to text,
  summary text,
  draft_reply text,
  ai_draft_reply text,
  intent text,
  intent_confidence numeric(5, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_provider text,
  channel public.message_channel not null default 'whatsapp',
  external_message_id text,
  provider_message_id text,
  direction text not null,
  sender_name text,
  body text not null,
  delivery_state text not null default 'received',
  delivery_receipts jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.contacts
  add column if not exists source_provider text,
  add column if not exists external_contact_id text,
  add column if not exists phone_e164 text;

alter table if exists public.conversations
  add column if not exists source_provider text,
  add column if not exists external_conversation_id text,
  add column if not exists ai_draft_reply text,
  add column if not exists identity_phone text;

alter table if exists public.messages
  add column if not exists source_provider text,
  add column if not exists external_message_id text,
  add column if not exists channel public.message_channel;

create table if not exists public.follow_up_sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  channel text not null default 'email',
  trigger text,
  steps jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  trigger_event text not null,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  category text not null,
  status text not null default 'pending',
  external_account_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voice_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  label text not null,
  is_default boolean not null default false,
  consent_status text not null default 'approved',
  voice_source text not null default 'original',
  prompt_style text,
  audio_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  voice_profile_id uuid references public.voice_profiles(id) on delete set null,
  session_type text not null default 'call',
  status text not null default 'queued',
  disclosure_text text,
  transcript jsonb not null default '[]'::jsonb,
  outcome text,
  scheduled_for timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voice_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  voice_profile_id uuid references public.voice_profiles(id) on delete set null,
  title text not null,
  body text not null,
  audio_url text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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

create index if not exists idx_contacts_workspace on public.contacts(workspace_id);
create index if not exists idx_agent_config_workspace on public.agent_config(workspace_id);
create unique index if not exists idx_contacts_external on public.contacts(workspace_id, source_provider, external_contact_id);
create unique index if not exists idx_contacts_phone_e164 on public.contacts(workspace_id, phone_e164);
create index if not exists idx_contact_identities_workspace on public.contact_identities(workspace_id);
create index if not exists idx_contact_identities_contact on public.contact_identities(contact_id);
create unique index if not exists idx_contact_identities_external on public.contact_identities(workspace_id, provider, external_identity_id);
create index if not exists idx_training_sources_workspace on public.training_sources(workspace_id);
create index if not exists idx_business_knowledge_workspace on public.business_knowledge(workspace_id);
create index if not exists idx_conversations_workspace on public.conversations(workspace_id);
create index if not exists idx_conversations_identity_phone on public.conversations(workspace_id, identity_phone);
create unique index if not exists idx_conversations_external on public.conversations(workspace_id, source_provider, external_conversation_id);
create index if not exists idx_messages_conversation on public.messages(conversation_id);
create unique index if not exists idx_messages_external on public.messages(workspace_id, source_provider, external_message_id);
create index if not exists idx_channels_workspace on public.channels(workspace_id);
create index if not exists idx_sequences_workspace on public.follow_up_sequences(workspace_id);
create index if not exists idx_rules_workspace on public.automation_rules(workspace_id);
create index if not exists idx_integrations_workspace on public.integrations(workspace_id);
create index if not exists idx_voice_profiles_workspace on public.voice_profiles(workspace_id);
create index if not exists idx_voice_sessions_workspace on public.voice_sessions(workspace_id);
create index if not exists idx_voice_notes_workspace on public.voice_notes(workspace_id);
create index if not exists idx_reliability_workspace on public.reliability_events(workspace_id);
create unique index if not exists idx_reliability_replay on public.reliability_events(workspace_id, provider, replay_key);
create unique index if not exists idx_reliability_dedupe on public.reliability_events(workspace_id, provider, dedupe_key);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.agents enable row level security;
alter table public.agent_config enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_identities enable row level security;
alter table public.training_sources enable row level security;
alter table public.business_knowledge enable row level security;
alter table public.channels enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter table public.follow_up_sequences enable row level security;
alter table public.automation_rules enable row level security;
alter table public.integrations enable row level security;
alter table public.voice_profiles enable row level security;
alter table public.voice_sessions enable row level security;
alter table public.voice_notes enable row level security;
alter table public.activity_events enable row level security;
alter table public.reliability_events enable row level security;

create policy "workspaces_select_member" on public.workspaces
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspaces.id and wm.user_id = auth.uid()
    )
  );

create policy "workspaces_insert_authenticated" on public.workspaces
  for insert with check (auth.uid() is not null);

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

create policy "scoped_select" on public.business_knowledge
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = business_knowledge.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy "scoped_write" on public.business_knowledge
  for all using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = business_knowledge.workspace_id and wm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = business_knowledge.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy "workspace_members_select_self" on public.workspace_members
  for select using (user_id = auth.uid());

create policy "workspace_members_insert_self" on public.workspace_members
  for insert with check (user_id = auth.uid());

create policy "workspace_members_update_self" on public.workspace_members
  for update using (user_id = auth.uid());

create policy "scoped_select" on public.agents
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = agents.workspace_id and wm.user_id = auth.uid())
  );
create policy "scoped_write" on public.agents
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = agents.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = agents.workspace_id and wm.user_id = auth.uid())
  );

create policy "scoped_select" on public.agent_config
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = agent_config.workspace_id and wm.user_id = auth.uid())
  );
create policy "scoped_write" on public.agent_config
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = agent_config.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = agent_config.workspace_id and wm.user_id = auth.uid())
  );

create policy "scoped_select" on public.contacts
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = contacts.workspace_id and wm.user_id = auth.uid())
  );
create policy "scoped_write" on public.contacts
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = contacts.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = contacts.workspace_id and wm.user_id = auth.uid())
  );

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

create policy "scoped_select" on public.channels
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = channels.workspace_id and wm.user_id = auth.uid())
  );
create policy "scoped_write" on public.channels
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = channels.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = channels.workspace_id and wm.user_id = auth.uid())
  );

create policy "scoped_select" on public.conversations
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = conversations.workspace_id and wm.user_id = auth.uid())
  );
create policy "scoped_write" on public.conversations
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = conversations.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = conversations.workspace_id and wm.user_id = auth.uid())
  );

create policy "scoped_select" on public.messages
  for select using (
    exists (
      select 1
      from public.conversations c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = messages.conversation_id and wm.user_id = auth.uid()
    )
  );
create policy "scoped_write" on public.messages
  for all using (
    exists (
      select 1
      from public.conversations c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = messages.conversation_id and wm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.conversations c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = messages.conversation_id and wm.user_id = auth.uid()
    )
  );

create policy "scoped_select" on public.follow_up_sequences
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = follow_up_sequences.workspace_id and wm.user_id = auth.uid())
  );
create policy "scoped_write" on public.follow_up_sequences
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = follow_up_sequences.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = follow_up_sequences.workspace_id and wm.user_id = auth.uid())
  );

create policy "scoped_select" on public.automation_rules
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = automation_rules.workspace_id and wm.user_id = auth.uid())
  );
create policy "scoped_write" on public.automation_rules
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = automation_rules.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = automation_rules.workspace_id and wm.user_id = auth.uid())
  );

create policy "scoped_select" on public.integrations
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = integrations.workspace_id and wm.user_id = auth.uid())
  );
create policy "scoped_write" on public.integrations
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = integrations.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = integrations.workspace_id and wm.user_id = auth.uid())
  );

create policy "scoped_select" on public.voice_profiles
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = voice_profiles.workspace_id and wm.user_id = auth.uid())
  );
create policy "scoped_write" on public.voice_profiles
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = voice_profiles.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = voice_profiles.workspace_id and wm.user_id = auth.uid())
  );

create policy "scoped_select" on public.voice_sessions
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = voice_sessions.workspace_id and wm.user_id = auth.uid())
  );
create policy "scoped_write" on public.voice_sessions
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = voice_sessions.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = voice_sessions.workspace_id and wm.user_id = auth.uid())
  );

create policy "scoped_select" on public.voice_notes
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = voice_notes.workspace_id and wm.user_id = auth.uid())
  );
create policy "scoped_write" on public.voice_notes
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = voice_notes.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = voice_notes.workspace_id and wm.user_id = auth.uid())
  );

create policy "scoped_select" on public.activity_events
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = activity_events.workspace_id and wm.user_id = auth.uid())
  );
create policy "scoped_write" on public.activity_events
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = activity_events.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = activity_events.workspace_id and wm.user_id = auth.uid())
  );

create policy "scoped_select" on public.reliability_events
  for select using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = reliability_events.workspace_id and wm.user_id = auth.uid())
  );
create policy "scoped_write" on public.reliability_events
  for all using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = reliability_events.workspace_id and wm.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = reliability_events.workspace_id and wm.user_id = auth.uid())
  );
