import { hasTwilioLookupConfig, lookupPhoneNumber } from '../server/twilio-service.js';

function getAdminConfig() {
  return {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.AURAFLOW_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    schema: process.env.SUPABASE_SCHEMA || 'public',
    ingestSecret: process.env.AURAFLOW_INGEST_SECRET || ''
  };
}

export function hasSupabaseAdminConfig() {
  const { url, serviceKey } = getAdminConfig();
  return Boolean(url && serviceKey);
}

function buildHeaders(serviceKey, schema) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Profile': schema || 'public',
    'Content-Profile': schema || 'public'
  };
}

async function readJson(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

async function requestJson(pathname, { method = 'GET', body = null, query = '', prefer = 'return=representation' } = {}) {
  const { url, serviceKey, schema } = getAdminConfig();
  if (!url || !serviceKey) {
    throw new Error('Supabase admin config is missing.');
  }

  const endpoint = new URL(`${url.replace(/\/$/, '')}/rest/v1/${pathname}`);
  if (query) {
    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
    params.forEach((value, key) => endpoint.searchParams.set(key, value));
  }

  const response = await fetch(endpoint, {
    method,
    headers: {
      ...buildHeaders(serviceKey, schema),
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return readJson(response);
}

function normalizeText(value, fallback = '') {
  return String(value || '').trim() || fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeEmail(value) {
  return normalizeText(value, '').toLowerCase();
}

function normalizePhone(value) {
  return normalizeText(value, '').replace(/[^\d+]/g, '');
}

function normalizeLookupLineType(value = '') {
  const normalized = normalizeText(value, '').toLowerCase();
  if (!normalized) return '';
  if (normalized === 'mobile') return 'mobile';
  if (normalized === 'landline' || normalized === 'fixedvoip') return 'landline';
  if (normalized === 'nonfixedvoip') return 'voip';
  return normalized;
}

function buildPhoneHealthSummary(lookup = {}, phone = '') {
  const lineType = normalizeLookupLineType(lookup?.line_type || lookup?.lineType);
  const valid = lookup?.valid === true;
  const status = !phone
    ? 'missing'
    : lookup?.lookup_status === 'lookup_failed'
      ? 'lookup_failed'
      : valid
        ? 'valid'
        : lookup?.valid === false
          ? 'invalid'
          : 'unknown';
  return {
    status,
    valid,
    phone_number: normalizeText(lookup?.phone_number || lookup?.phoneNumber || phone, phone),
    line_type: lineType,
    carrier_name: normalizeText(lookup?.carrier_name || lookup?.carrierName || '', ''),
    sms_capable: valid && !['landline', 'unknown'].includes(lineType),
    checked_at: lookup?.looked_up_at || lookup?.lookedUpAt || new Date().toISOString()
  };
}

async function enrichContactPhoneMetadata(phone = '', existingLookup = null) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return { phone: '', lookup: null, health: null };

  const existingPhone = normalizePhone(existingLookup?.phone_number || existingLookup?.phoneNumber || '');
  const existingStatus = normalizeText(existingLookup?.lookup_status || existingLookup?.status, '').toLowerCase();
  const existingValid = existingLookup?.valid === true || existingLookup?.valid === false;
  const canReuse = existingPhone === normalizedPhone && existingStatus !== 'lookup_failed' && existingValid;
  if (canReuse) {
    return {
      phone: normalizeText(existingLookup?.phone_number || existingLookup?.phoneNumber || normalizedPhone, normalizedPhone),
      lookup: existingLookup,
      health: buildPhoneHealthSummary(existingLookup, normalizedPhone)
    };
  }

  if (!hasTwilioLookupConfig()) {
    const fallbackLookup = {
      ...(existingLookup || {}),
      phone_number: normalizedPhone,
      lookup_status: existingLookup ? normalizeText(existingLookup.lookup_status || existingLookup.status, 'cached') : 'unconfigured',
      source: 'twilio_lookup',
      looked_up_at: existingLookup?.looked_up_at || existingLookup?.lookedUpAt || new Date().toISOString()
    };
    return {
      phone: normalizedPhone,
      lookup: fallbackLookup,
      health: buildPhoneHealthSummary(fallbackLookup, normalizedPhone)
    };
  }

  try {
    const lookup = await lookupPhoneNumber(normalizedPhone);
    const nextLookup = {
      source: 'twilio_lookup',
      lookup_status: 'ready',
      phone_number: lookup.phoneNumber,
      national_format: lookup.nationalFormat || null,
      country_code: lookup.countryCode || null,
      valid: lookup.valid,
      validation_errors: lookup.validationErrors,
      line_type: lookup.lineType || null,
      carrier_name: lookup.carrierName || null,
      mobile_country_code: lookup.mobileCountryCode || null,
      mobile_network_code: lookup.mobileNetworkCode || null,
      error_code: lookup.errorCode,
      looked_up_at: lookup.lookedUpAt
    };
    return {
      phone: lookup.phoneNumber || normalizedPhone,
      lookup: nextLookup,
      health: buildPhoneHealthSummary(nextLookup, lookup.phoneNumber || normalizedPhone)
    };
  } catch (error) {
    const failedLookup = {
      ...(existingLookup || {}),
      source: 'twilio_lookup',
      lookup_status: 'lookup_failed',
      phone_number: normalizedPhone,
      error_message: normalizeText(error?.message || 'Lookup failed.', 'Lookup failed.'),
      looked_up_at: new Date().toISOString()
    };
    return {
      phone: normalizedPhone,
      lookup: failedLookup,
      health: buildPhoneHealthSummary(failedLookup, normalizedPhone)
    };
  }
}

function normalizePhoneLoose(value) {
  const digits = normalizePhone(value).replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('234') && digits.length >= 10) return digits.slice(-10);
  if (digits.startsWith('1') && digits.length === 11) return digits.slice(-10);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

function providerToChannel(provider) {
  const normalized = normalizeText(provider, '').toLowerCase();
  if (normalized === 'gmail' || normalized === 'email') return 'email';
  if (normalized === 'facebook') return 'messenger';
  if (['whatsapp', 'sms', 'voice', 'instagram', 'messenger'].includes(normalized)) return normalized;
  return '';
}

function toISO(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function fallbackExternalId(prefix, parts = []) {
  const joined = parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('|')
    .toLowerCase();
  return `${prefix}:${joined || 'unknown'}`;
}

function normalizeMessage(provider, conversationKey, message, index) {
  const externalId = normalizeText(
    message.externalId || message.external_id || message.id,
    fallbackExternalId('message', [provider, conversationKey, index, message.body, message.createdAt || message.created_at])
  );
  return {
    externalId,
    channel: providerToChannel(provider) || 'whatsapp',
    direction: normalizeText(message.direction, 'inbound'),
    senderName: normalizeText(message.senderName || message.sender_name, ''),
    body: normalizeText(message.body, ''),
    createdAt: toISO(message.createdAt || message.created_at),
    rawPayload: message.rawPayload || message.raw_payload || {}
  };
}

function mergeUniqueStrings(...values) {
  return Array.from(new Set(values.flatMap((value) => normalizeArray(value)).map((item) => normalizeText(item, '')).filter(Boolean)));
}

function buildIdentitySnapshot(payload = {}) {
  const email = normalizeEmail(payload.contact?.email || payload.identity?.email);
  const phone = normalizePhone(payload.contact?.phone || payload.identity?.phone);
  const loosePhone = normalizePhoneLoose(phone);
  const displayName = normalizeText(payload.contact?.name || payload.identity?.displayName, '');
  const externalIdentityId = normalizeText(payload.identity?.externalIdentityId || payload.contact?.externalId, '');
  return {
    provider: normalizeText(payload.provider, '').toLowerCase(),
    providerAccountId: normalizeText(payload.accountId || payload.identity?.providerAccountId, ''),
    externalIdentityId,
    email,
    phone,
    loosePhone,
    displayName
  };
}

function normalizeStoredIdentityEntry(entry = {}) {
  const email = normalizeEmail(entry.email || entry.email_address);
  const phone = normalizePhone(entry.phone || entry.phone_e164);
  const externalIdentityId = normalizeText(entry.external_identity_id || entry.externalIdentityId || '', '');
  return {
    provider: normalizeText(entry.provider, '').toLowerCase(),
    providerAccountId: normalizeText(entry.provider_account_id || entry.providerAccountId, ''),
    externalIdentityId,
    email,
    phone,
    loosePhone: normalizePhoneLoose(phone),
    displayName: normalizeText(entry.display_name || entry.displayName || '', '')
  };
}

function scoreIdentityMatch(candidate = {}, target = {}) {
  let score = 0;
  if (candidate.externalIdentityId && target.externalIdentityId && candidate.externalIdentityId === target.externalIdentityId) score += 8;
  if (candidate.email && target.email && candidate.email === target.email) score += 6;
  if (candidate.phone && target.phone && candidate.phone === target.phone) score += 6;
  if (candidate.loosePhone && target.loosePhone && candidate.loosePhone === target.loosePhone) score += 5;
  if (candidate.provider && target.provider && candidate.provider === target.provider) score += 2;
  if (candidate.providerAccountId && target.providerAccountId && candidate.providerAccountId === target.providerAccountId) score += 2;
  if (candidate.displayName && target.displayName && candidate.displayName.toLowerCase() === target.displayName.toLowerCase()) score += 1;
  return score;
}

async function getWorkspaceContactIdentity(workspaceId, provider, externalIdentityId) {
  if (!workspaceId || !provider || !externalIdentityId) return null;
  const rows = await requestJson('contact_identities', {
    query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&provider=eq.${encodeURIComponent(provider)}&external_identity_id=eq.${encodeURIComponent(externalIdentityId)}&select=*`,
    prefer: 'return=representation'
  }).catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

async function findMatchingWorkspaceIdentity(workspaceId, payload) {
  if (!workspaceId) return null;
  const target = buildIdentitySnapshot(payload);
  const queries = [];

  if (target.email) {
    queries.push(`workspace_id=eq.${encodeURIComponent(workspaceId)}&email=eq.${encodeURIComponent(target.email)}&select=*`);
  }
  if (target.phone) {
    queries.push(`workspace_id=eq.${encodeURIComponent(workspaceId)}&phone=eq.${encodeURIComponent(target.phone)}&select=*`);
  }
  if (target.externalIdentityId) {
    queries.push(`workspace_id=eq.${encodeURIComponent(workspaceId)}&external_identity_id=eq.${encodeURIComponent(target.externalIdentityId)}&select=*`);
  }

  for (const query of queries) {
    const rows = await requestJson('contact_identities', {
      query,
      prefer: 'return=representation'
    }).catch(() => []);
    const identities = normalizeArray(rows);
    if (!identities.length) continue;
    const ranked = identities
      .map((identity) => ({ identity, score: scoreIdentityMatch(normalizeStoredIdentityEntry(identity), target) }))
      .sort((left, right) => right.score - left.score);
    if (ranked[0]?.score > 0) return ranked[0].identity;
  }

  return null;
}

async function getContactById(contactId) {
  if (!contactId) return null;
  const rows = await requestJson('contacts', {
    query: `id=eq.${encodeURIComponent(contactId)}&select=*`,
    prefer: 'return=representation'
  }).catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

async function findMatchingWorkspaceContact(workspaceId, payload) {
  if (!workspaceId) return null;
  const rows = await requestJson('contacts', {
    query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`,
    prefer: 'return=representation'
  }).catch(() => []);
  const contacts = normalizeArray(rows);
  const target = buildIdentitySnapshot(payload);
  const providerExternalId = normalizeText(payload.contact.externalId, '');
  const ranked = contacts
    .map((contact) => {
      const storedIdentities = normalizeArray(contact?.metadata?.identities).map((identity) => normalizeStoredIdentityEntry(identity));
      const contactEmail = normalizeEmail(contact.email);
      const contactPhone = normalizePhone(contact.phone);
      const contactLoosePhone = normalizePhoneLoose(contact.phone);
      const contactExternalId = normalizeText(contact.external_contact_id, '');
      let score = 0;

      if (target.email && contactEmail && contactEmail === target.email) score += 6;
      if (target.phone && contactPhone && contactPhone === target.phone) score += 6;
      if (target.loosePhone && contactLoosePhone && contactLoosePhone === target.loosePhone) score += 5;
      if (providerExternalId && contactExternalId && providerExternalId === contactExternalId) score += 4;
      if (target.displayName && normalizeText(contact.name, '').toLowerCase() === target.displayName.toLowerCase()) score += 2;
      if (target.provider && normalizeArray(contact.metadata?.unified_channels).map((item) => String(item).toLowerCase()).includes(target.provider)) score += 1;

      for (const identity of storedIdentities) {
        score = Math.max(score, scoreIdentityMatch(identity, target));
      }

      return { contact, score };
    })
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.score >= 4 ? ranked[0].contact : null;
}

async function resolveWorkspaceContact(payload) {
  const existingIdentity = await getWorkspaceContactIdentity(payload.workspaceId, payload.provider, payload.identity.externalIdentityId);
  if (existingIdentity?.contact_id) {
    const contact = await getContactById(existingIdentity.contact_id);
    if (contact) {
      return { contact, identity: existingIdentity, resolution: 'identity_match' };
    }
  }

  const matchedIdentity = await findMatchingWorkspaceIdentity(payload.workspaceId, payload);
  if (matchedIdentity?.contact_id) {
    const contact = await getContactById(matchedIdentity.contact_id);
    if (contact) {
      return { contact, identity: matchedIdentity, resolution: 'identity_address_match' };
    }
  }

  const matchedContact = await findMatchingWorkspaceContact(payload.workspaceId, payload);
  if (matchedContact) {
    return { contact: matchedContact, identity: matchedIdentity || existingIdentity, resolution: 'profile_match' };
  }

  return { contact: null, identity: matchedIdentity || existingIdentity, resolution: 'new_contact' };
}

async function saveWorkspaceContact(payload, existingContact = null) {
  const now = new Date().toISOString();
  const identitySnapshot = buildIdentitySnapshot(payload);
  const existingIdentities = normalizeArray(existingContact?.metadata?.identities)
    .map((identity) => normalizeStoredIdentityEntry(identity))
    .filter((identity) => identity.externalIdentityId || identity.email || identity.phone);
  const nextIdentity = {
    provider: identitySnapshot.provider,
    provider_account_id: identitySnapshot.providerAccountId || null,
    external_identity_id: identitySnapshot.externalIdentityId || null,
    email: identitySnapshot.email || null,
    phone: identitySnapshot.phone || null,
    display_name: identitySnapshot.displayName || null
  };
  const mergedIdentities = [...existingIdentities];
  const existingIndex = mergedIdentities.findIndex((identity) => scoreIdentityMatch(identity, identitySnapshot) >= 6);
  if (existingIndex >= 0) {
    mergedIdentities[existingIndex] = {
      ...mergedIdentities[existingIndex],
      ...nextIdentity
    };
  } else if (nextIdentity.external_identity_id || nextIdentity.email || nextIdentity.phone) {
    mergedIdentities.push(nextIdentity);
  }
  const nextMetadata = {
    ...(existingContact?.metadata || {}),
    provider: payload.provider,
    account_id: payload.accountId || existingContact?.metadata?.account_id || null,
    source: payload.source || existingContact?.metadata?.source || null,
    last_identity_resolution: payload.identity.externalIdentityId || null,
    unified_channels: mergeUniqueStrings(existingContact?.metadata?.unified_channels, [payload.provider]),
    last_contact_address_match: payload.contact.email || payload.contact.phone || null,
    identity_count: mergedIdentities.length,
    identities: mergedIdentities
  };
  const resolvedPhone = payload.contact.phone || existingContact?.phone || '';
  const phoneEnrichment = await enrichContactPhoneMetadata(resolvedPhone, nextMetadata.phone_lookup || existingContact?.metadata?.phone_lookup || null);
  if (phoneEnrichment.lookup) {
    nextMetadata.phone_lookup = phoneEnrichment.lookup;
  }
  if (phoneEnrichment.health) {
    nextMetadata.phone_health = phoneEnrichment.health;
  }

  const contactBody = {
    workspace_id: payload.workspaceId,
    source_provider: existingContact?.source_provider || payload.provider,
    external_contact_id: existingContact?.external_contact_id || payload.contact.externalId,
    name: payload.contact.name || existingContact?.name || 'Unknown contact',
    email: payload.contact.email || existingContact?.email || null,
    phone: phoneEnrichment.phone || resolvedPhone || null,
    company: payload.contact.company || existingContact?.company || null,
    lead_stage: payload.contact.leadStage || existingContact?.lead_stage || 'new',
    owner_name: payload.contact.ownerName || existingContact?.owner_name || null,
    tags: mergeUniqueStrings(existingContact?.tags, payload.contact.tags),
    metadata: nextMetadata,
    updated_at: now
  };

  if (existingContact?.id) {
    const rows = await requestJson('contacts', {
      method: 'PATCH',
      query: `id=eq.${encodeURIComponent(existingContact.id)}`,
      prefer: 'return=representation',
      body: contactBody
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  const rows = await requestJson('contacts', {
    method: 'POST',
    prefer: 'return=representation',
    body: [contactBody]
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function enrichExistingContactPhoneHealth(contact = {}) {
  const phone = normalizePhone(contact?.phone || '');
  if (!phone) {
    return {
      changed: false,
      skipped: true,
      reason: 'missing_phone',
      contact
    };
  }

  const metadata = { ...(contact?.metadata || {}) };
  const existingLookup = metadata.phone_lookup || null;
  const existingHealth = metadata.phone_health || null;
  const phoneEnrichment = await enrichContactPhoneMetadata(phone, existingLookup);
  const nextLookup = phoneEnrichment.lookup || existingLookup;
  const nextHealth = phoneEnrichment.health || existingHealth;
  const nextPhone = phoneEnrichment.phone || phone;

  const currentSignature = JSON.stringify({
    phone: normalizePhone(contact?.phone || ''),
    lookup: existingLookup,
    health: existingHealth
  });
  const nextSignature = JSON.stringify({
    phone: normalizePhone(nextPhone),
    lookup: nextLookup,
    health: nextHealth
  });

  if (currentSignature === nextSignature) {
    return {
      changed: false,
      skipped: false,
      reason: 'unchanged',
      contact
    };
  }

  return {
    changed: true,
    skipped: false,
    patch: {
      phone: nextPhone || contact?.phone || null,
      metadata: {
        ...metadata,
        ...(nextLookup ? { phone_lookup: nextLookup } : {}),
        ...(nextHealth ? { phone_health: nextHealth } : {})
      },
      updated_at: new Date().toISOString()
    }
  };
}

async function saveWorkspaceContactIdentity(payload, contact) {
  if (!contact?.id || !payload.identity.externalIdentityId) return null;
  const rows = await requestJson('contact_identities', {
    method: 'POST',
    query: 'on_conflict=workspace_id,provider,external_identity_id',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: [{
      workspace_id: payload.workspaceId,
      contact_id: contact.id,
      provider: payload.provider,
      provider_account_id: payload.accountId || null,
      external_identity_id: payload.identity.externalIdentityId,
      external_thread_id: payload.identity.externalThreadId || null,
      email: payload.contact.email || null,
      phone: payload.contact.phone || null,
      display_name: payload.contact.name || null,
      metadata: {
        source_provider: payload.provider,
        conversation_external_id: payload.conversation.externalId,
        source: payload.source || null
      },
      last_seen_at: payload.messages.at(-1)?.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export function normalizeProviderPayload(input = {}) {
  const provider = (() => {
    const normalized = normalizeText(input.provider, 'gmail').toLowerCase();
    return normalized === 'email' ? 'gmail' : normalized;
  })();
  const workspaceId = normalizeText(input.workspaceId || input.workspace_id);
  const contact = input.contact || {};
  const conversation = input.conversation || {};
  const messages = normalizeArray(input.messages).map((message, index) => normalizeMessage(provider, conversation.externalId || conversation.external_id || conversation.threadId || conversation.thread_id || conversation.id || conversation.subject || workspaceId, message, index));
  const contactExternalId = normalizeText(
    contact.externalId || contact.external_id || contact.email || contact.phone || contact.id,
    fallbackExternalId('contact', [provider, workspaceId, contact.name, contact.email, contact.phone])
  );
  const conversationExternalId = normalizeText(
    conversation.externalId || conversation.external_id || conversation.threadId || conversation.thread_id || conversation.id || conversation.subject,
    fallbackExternalId('conversation', [provider, workspaceId, contactExternalId, conversation.subject, conversation.source])
  );
  const derivedRouting = {
    recipientId: provider === 'instagram' || provider === 'messenger'
      ? normalizeText(
        conversation.recipientId
        || conversation.recipient_id
        || input.recipientId
        || input.recipient_id
        || contactExternalId,
        ''
      )
      : '',
    recipientEmail: provider === 'gmail'
      ? normalizeText(
        conversation.recipientEmail
        || conversation.recipient_email
        || input.recipientEmail
        || input.recipient_email
        || contact.email,
        ''
      )
      : '',
    recipientPhone: provider === 'whatsapp'
      ? normalizeText(
        conversation.recipientPhone
        || conversation.recipient_phone
        || input.recipientPhone
        || input.recipient_phone
        || contact.phone
        || contactExternalId,
        ''
      )
      : ''
  };
  const normalizedEmail = normalizeEmail(contact.email);
  const normalizedPhone = normalizePhone(contact.phone);
  const externalIdentityId = provider === 'gmail'
    ? normalizeText(normalizedEmail || contactExternalId, contactExternalId)
    : normalizeText(contactExternalId || normalizedPhone || normalizedEmail, contactExternalId || normalizedPhone || normalizedEmail);

  return {
    provider,
    workspaceId,
    accountId: normalizeText(input.accountId || input.account_id || ''),
    source: normalizeText(input.source || input.contact?.source || input.conversation?.source || provider, provider),
    contact: {
      ...contact,
      externalId: contactExternalId,
      name: normalizeText(contact.name, 'Unknown contact'),
      email: normalizedEmail,
      phone: normalizedPhone,
      company: normalizeText(contact.company, ''),
      leadStage: normalizeText(contact.leadStage || contact.lead_stage, 'new'),
      ownerName: normalizeText(contact.ownerName || contact.owner_name, ''),
      tags: normalizeArray(contact.tags)
    },
    conversation: {
      ...conversation,
      externalId: conversationExternalId,
      subject: normalizeText(conversation.subject, messages[0]?.body?.slice(0, 80) || 'Incoming thread'),
      status: normalizeText(conversation.status, 'open'),
      priority: normalizeText(conversation.priority, 'normal'),
      source: normalizeText(conversation.source || provider, provider),
      assignedTo: normalizeText(conversation.assignedTo || conversation.assigned_to, ''),
      summary: normalizeText(conversation.summary, messages[0]?.body?.slice(0, 160) || ''),
      routing: derivedRouting
    },
    messages,
    identity: {
      provider,
      providerAccountId: normalizeText(input.accountId || input.account_id || ''),
      externalIdentityId,
      externalThreadId: conversationExternalId,
      email: normalizedEmail,
      phone: normalizedPhone,
      displayName: normalizeText(contact.name, 'Unknown contact')
    }
  };
}

export async function ingestProviderPayload(input = {}) {
  const payload = normalizeProviderPayload(input);
  if (!payload.workspaceId) {
    throw new Error('workspaceId is required for provider ingestion.');
  }

  const resolvedContact = await resolveWorkspaceContact(payload);
  const contact = await saveWorkspaceContact(payload, resolvedContact.contact);
  const identity = await saveWorkspaceContactIdentity(payload, contact);

  const conversationRow = await requestJson('conversations', {
    method: 'POST',
    query: 'on_conflict=workspace_id,source_provider,external_conversation_id',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: [{
      workspace_id: payload.workspaceId,
      contact_id: contact?.id || null,
      source_provider: payload.provider,
      external_conversation_id: payload.conversation.externalId,
      subject: payload.conversation.subject,
      status: payload.conversation.status,
      priority: payload.conversation.priority,
      source: payload.conversation.source,
      assigned_to: payload.conversation.assignedTo || null,
      summary: payload.conversation.summary || null,
      last_message_at: payload.messages.at(-1)?.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]
  });

  const conversation = Array.isArray(conversationRow) ? conversationRow[0] : conversationRow;
  const messageRows = [];

  for (const message of payload.messages) {
    const rows = await requestJson('messages', {
      method: 'POST',
      query: 'on_conflict=workspace_id,source_provider,external_message_id',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: [{
        workspace_id: payload.workspaceId,
        conversation_id: conversation?.id || conversationRow?.id || null,
        source_provider: payload.provider,
        external_message_id: message.externalId,
        direction: message.direction,
        sender_name: message.senderName || null,
      body: message.body,
      channel: message.channel || providerToChannel(payload.provider) || 'whatsapp',
      raw_payload: {
        ...message.rawPayload,
        provider: payload.provider,
          conversation_external_id: payload.conversation.externalId,
          contact_external_id: payload.contact.externalId,
          account_id: payload.accountId || null,
          recipient_id: payload.conversation.routing?.recipientId || null,
          recipient_email: payload.conversation.routing?.recipientEmail || null,
          recipient_phone: payload.conversation.routing?.recipientPhone || null
        },
        created_at: message.createdAt
      }]
    });
    messageRows.push(Array.isArray(rows) ? rows[0] : rows);
  }

  await requestJson('conversations', {
    method: 'PATCH',
    query: `id=eq.${encodeURIComponent(conversation?.id || conversationRow?.id || '')}`,
    prefer: 'return=representation',
    body: {
      last_message_at: payload.messages.at(-1)?.createdAt || new Date().toISOString(),
      summary: payload.conversation.summary || conversation?.summary || null,
      updated_at: new Date().toISOString()
    }
  });

  const activity = await requestJson('activity_events', {
    method: 'POST',
    prefer: 'return=representation',
    body: [{
      workspace_id: payload.workspaceId,
      entity_type: 'conversation',
      entity_id: conversation?.id || conversationRow?.id || null,
      event_type: `${payload.provider}_inbound_sync`,
      payload: {
        provider: payload.provider,
        message_count: messageRows.length,
        account_id: payload.accountId || null,
        contact_external_id: payload.contact.externalId,
        conversation_external_id: payload.conversation.externalId,
        contact_identity_id: identity?.id || null,
        contact_resolution: resolvedContact.resolution
      }
    }]
  });

  return {
    provider: payload.provider,
    workspaceId: payload.workspaceId,
    contact,
    identity,
    conversation,
    messages: messageRows,
    activity: Array.isArray(activity) ? activity[0] : activity
  };
}

export function validateIngestSecret(headers = {}) {
  const { ingestSecret } = getAdminConfig();
  if (!ingestSecret) return true;
  const secret = headers['x-auraflow-ingest-secret'] || headers['X-Auraflow-Ingest-Secret'];
  return secret === ingestSecret;
}

export function getIngestContract() {
  return {
    providers: ['gmail', 'whatsapp', 'instagram', 'messenger'],
    required: ['workspaceId', 'provider', 'contact', 'conversation', 'messages']
  };
}
