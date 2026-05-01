do $$ begin
  create type public.message_channel as enum ('whatsapp', 'sms', 'voice');
exception
  when duplicate_object then null;
end $$;

alter table if exists public.contacts
  add column if not exists phone_e164 text;

update public.contacts
set phone_e164 = case
  when phone is null or btrim(phone) = '' then null
  when left(regexp_replace(phone, '[^\d+]', '', 'g'), 1) = '+'
    then regexp_replace(phone, '[^\d+]', '', 'g')
  else '+' || regexp_replace(phone, '[^\d]', '', 'g')
end
where phone_e164 is null;

with ranked_contacts as (
  select
    id,
    row_number() over (
      partition by workspace_id, phone_e164
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.contacts
  where phone_e164 is not null
)
update public.contacts c
set phone_e164 = null
from ranked_contacts rc
where c.id = rc.id
  and rc.rn > 1;

create unique index if not exists idx_contacts_phone_e164
  on public.contacts(workspace_id, phone_e164);

alter table if exists public.conversations
  add column if not exists identity_phone text;

update public.conversations c
set identity_phone = ct.phone_e164
from public.contacts ct
where c.contact_id = ct.id
  and c.identity_phone is null
  and ct.phone_e164 is not null;

create index if not exists idx_conversations_identity_phone
  on public.conversations(workspace_id, identity_phone);

alter table if exists public.messages
  add column if not exists channel public.message_channel;

update public.messages
set channel = case
  when lower(coalesce(source_provider, '')) = 'voice' then 'voice'::public.message_channel
  when lower(coalesce(source_provider, '')) = 'sms' then 'sms'::public.message_channel
  else 'whatsapp'::public.message_channel
end
where channel is null;

alter table if exists public.messages
  alter column channel set default 'whatsapp'::public.message_channel,
  alter column channel set not null;

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

create index if not exists idx_business_knowledge_workspace
  on public.business_knowledge(workspace_id);

alter table if exists public.business_knowledge enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'business_knowledge'
      and policyname = 'scoped_select'
  ) then
    create policy "scoped_select" on public.business_knowledge
      for select using (
        exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = business_knowledge.workspace_id and wm.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'business_knowledge'
      and policyname = 'scoped_write'
  ) then
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
  end if;
end $$;
