insert into public.contact_identities (
  workspace_id,
  contact_id,
  provider,
  provider_account_id,
  external_identity_id,
  external_thread_id,
  email,
  phone,
  display_name,
  metadata,
  last_seen_at,
  updated_at
)
select distinct on (c.workspace_id, identity_provider, identity_value)
  c.workspace_id,
  c.id as contact_id,
  identity_provider as provider,
  nullif(ch.provider_account_id, '') as provider_account_id,
  identity_value as external_identity_id,
  conv.external_conversation_id as external_thread_id,
  nullif(c.email, '') as email,
  nullif(c.phone, '') as phone,
  c.name as display_name,
  jsonb_strip_nulls(jsonb_build_object(
    'source', 'backfill',
    'contact_source_provider', c.source_provider,
    'conversation_id', conv.id,
    'conversation_external_id', conv.external_conversation_id
  )) as metadata,
  coalesce(msg.last_message_at, conv.last_message_at, c.updated_at, now()) as last_seen_at,
  now() as updated_at
from public.contacts c
left join lateral (
  select
    conv1.id,
    conv1.source_provider,
    conv1.external_conversation_id,
    conv1.last_message_at
  from public.conversations conv1
  where conv1.contact_id = c.id
  order by conv1.last_message_at desc nulls last, conv1.updated_at desc nulls last
  limit 1
) conv on true
left join lateral (
  select
    max(m.created_at) as last_message_at
  from public.messages m
  where m.conversation_id = conv.id
) msg on true
left join public.channels ch
  on ch.workspace_id = c.workspace_id
 and lower(ch.provider) = lower(coalesce(conv.source_provider, c.source_provider))
cross join lateral (
  select
    lower(coalesce(conv.source_provider, c.source_provider, 'manual')) as identity_provider,
    case
      when lower(coalesce(conv.source_provider, c.source_provider, 'manual')) = 'gmail'
        then nullif(lower(c.email), '')
      when lower(coalesce(conv.source_provider, c.source_provider, 'manual')) = 'whatsapp'
        then nullif(regexp_replace(coalesce(c.phone, c.external_contact_id, ''), '[^0-9+]', '', 'g'), '')
      when lower(coalesce(conv.source_provider, c.source_provider, 'manual')) in ('instagram', 'messenger')
        then nullif(c.external_contact_id, '')
      else nullif(coalesce(c.external_contact_id, lower(c.email), regexp_replace(coalesce(c.phone, ''), '[^0-9+]', '', 'g')), '')
    end as identity_value
) identity_seed
where identity_value is not null
on conflict (workspace_id, provider, external_identity_id)
do update
set
  contact_id = excluded.contact_id,
  provider_account_id = coalesce(excluded.provider_account_id, public.contact_identities.provider_account_id),
  external_thread_id = coalesce(excluded.external_thread_id, public.contact_identities.external_thread_id),
  email = coalesce(excluded.email, public.contact_identities.email),
  phone = coalesce(excluded.phone, public.contact_identities.phone),
  display_name = coalesce(excluded.display_name, public.contact_identities.display_name),
  metadata = public.contact_identities.metadata || excluded.metadata,
  last_seen_at = greatest(public.contact_identities.last_seen_at, excluded.last_seen_at),
  updated_at = now();
