function normalizeText(value, fallback = '') {
  return String(value || '').trim() || fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toIso(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(Number(value) > 1e12 ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      if (value.length) return value;
      continue;
    }
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

export function extractNangoRecords(payload = {}) {
  const source = [
    payload.records,
    payload.data?.records,
    payload.result?.records,
    payload.items,
    payload.data?.items,
    payload.value?.records
  ].find(Array.isArray);
  if (source) return source;
  if (payload.record) return [payload.record];
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return [payload.data];
  }
  if (payload.value && typeof payload.value === 'object' && !Array.isArray(payload.value)) {
    return [payload.value];
  }
  return [];
}

function buildContactEnvelope(provider, record = {}, body = {}, index = 0) {
  const contact = record.contact || record.person || record.sender || record.from || {};
  const email = normalizeText(firstNonEmpty(contact.email, record.email, record.sender_email, record.senderEmail, body.email), '');
  const phone = normalizeText(firstNonEmpty(contact.phone, contact.wa_id, record.phone, record.phone_number, body.phone), '');
  const externalId = normalizeText(firstNonEmpty(
    contact.id,
    contact.externalId,
    record.contact_id,
    record.contactId,
    record.external_contact_id,
    record.externalContactId,
    email,
    phone,
    record.id,
    `${provider}:contact:${index + 1}`
  ), `${provider}:contact:${index + 1}`);

  return {
    externalId,
    name: normalizeText(firstNonEmpty(contact.name, contact.displayName, record.name, record.sender_name, record.senderName, email, phone), 'Unknown contact'),
    email,
    phone,
    company: normalizeText(firstNonEmpty(contact.company, record.company, record.organization, body.company), ''),
    leadStage: normalizeText(firstNonEmpty(contact.leadStage, contact.lead_stage, record.lead_stage, record.stage), 'new'),
    ownerName: normalizeText(firstNonEmpty(contact.ownerName, contact.owner_name, record.owner_name, body.owner_name), ''),
    tags: normalizeArray(firstNonEmpty(contact.tags, record.tags, body.tags)).map((tag) => normalizeText(tag)).filter(Boolean)
  };
}

function buildConversationEnvelope(provider, record = {}, body = {}, index = 0) {
  const conversation = record.conversation || record.thread || {};
  const externalId = normalizeText(firstNonEmpty(
    conversation.externalId,
    conversation.external_id,
    conversation.id,
    record.conversation_id,
    record.conversationId,
    record.thread_id,
    record.threadId,
    body.conversation_id,
    body.thread_id,
    `${provider}:thread:${index + 1}`
  ), `${provider}:thread:${index + 1}`);
  const subject = normalizeText(firstNonEmpty(
    conversation.subject,
    record.subject,
    record.title,
    record.summary,
    record.snippet,
    body.subject
  ), 'Incoming thread');
  const summary = normalizeText(firstNonEmpty(
    conversation.summary,
    record.summary,
    record.snippet,
    record.body,
    record.text,
    body.summary,
    body.body,
    body.text
  ), '');

  return {
    externalId,
    subject,
    status: normalizeText(firstNonEmpty(conversation.status, record.status, body.status), 'open'),
    priority: normalizeText(firstNonEmpty(conversation.priority, record.priority, body.priority), 'normal'),
    source: normalizeText(firstNonEmpty(conversation.source, record.source, body.source, provider), provider),
    assignedTo: normalizeText(firstNonEmpty(conversation.assignedTo, conversation.assigned_to, record.assigned_to, record.assignedTo, body.assigned_to), ''),
    summary
  };
}

function buildMessagesEnvelope(provider, record = {}, body = {}, conversationExternalId, contactName, index = 0) {
  const message = record.message || {};
  const bodyText = normalizeText(firstNonEmpty(
    message.body,
    message.text,
    message.snippet,
    record.body,
    record.text,
    record.snippet,
    body.body,
    body.text,
    body.snippet
  ), '');
  const externalId = normalizeText(firstNonEmpty(
    message.externalId,
    message.external_id,
    message.id,
    record.external_message_id,
    record.externalMessageId,
    record.message_id,
    record.messageId,
    record.id,
    `${provider}:message:${index + 1}`
  ), `${provider}:message:${index + 1}`);
  const direction = normalizeText(firstNonEmpty(
    message.direction,
    record.direction,
    body.direction
  ), 'inbound');
  const senderName = normalizeText(firstNonEmpty(
    message.senderName,
    message.sender_name,
    record.sender_name,
    record.senderName,
    record.from?.name,
    record.contact?.name,
    contactName
  ), contactName || 'Unknown contact');

  return [{
    externalId,
    direction,
    senderName,
    body: bodyText || `Sync event from ${provider}`,
    createdAt: toIso(firstNonEmpty(message.createdAt, message.created_at, record.created_at, record.createdAt, body.created_at, body.createdAt)),
    rawPayload: {
      record,
      body,
      provider,
      conversationExternalId
    }
  }];
}

export function buildNangoWebhookEnvelope({
  provider = 'gmail',
  workspaceId = '',
  record = {},
  body = {},
  index = 0,
  eventType = ''
} = {}) {
  const normalizedProvider = normalizeText(provider, 'gmail').toLowerCase();
  const contact = buildContactEnvelope(normalizedProvider, record, body, index);
  const conversation = buildConversationEnvelope(normalizedProvider, record, body, index);
  const messages = buildMessagesEnvelope(normalizedProvider, record, body, conversation.externalId, contact.name, index);
  const externalAccountId = normalizeText(firstNonEmpty(
    body.connection_id,
    body.connectionId,
    body.provider_config_key,
    body.providerConfigKey,
    body.accountId,
    body.account_id,
    record.connection_id,
    record.connectionId
  ), '');

  return {
    provider: normalizedProvider,
    workspaceId: normalizeText(workspaceId || body.workspaceId || body.workspace_id, ''),
    accountId: externalAccountId,
    eventType: normalizeText(firstNonEmpty(
      eventType,
      body.eventType,
      body.type,
      body.event,
      record.eventType,
      record.type,
      record.action,
      `${normalizedProvider}.sync.record`
    ), `${normalizedProvider}.sync.record`),
    contact,
    conversation,
    messages,
    deliveryReceipts: normalizeArray(record.deliveryReceipts || record.delivery_receipts || body.deliveryReceipts || body.delivery_receipts),
    verification: {
      transport: 'nango-sync',
      verified: true,
      note: 'Normalized from Nango sync payload.'
    },
    headers: body.headers || {}
  };
}

export function buildReliabilityLogEntry({
  workspaceId = '',
  provider = 'gmail',
  eventType = 'reliability.test_callback',
  status = 'received',
  replayKey = '',
  dedupeKey = '',
  payload = {},
  errorMessage = ''
} = {}) {
  const now = new Date().toISOString();
  return {
    workspace_id: workspaceId,
    provider: normalizeText(provider, 'gmail').toLowerCase(),
    event_type: normalizeText(eventType, 'reliability.test_callback'),
    status: normalizeText(status, 'received'),
    replay_key: replayKey || null,
    dedupe_key: dedupeKey || null,
    payload,
    error_message: errorMessage || null,
    created_at: now,
    updated_at: now
  };
}

export function buildNangoTriggerBody({ workspaceId = '', provider = '', connectionId = '', syncs = [] } = {}) {
  return {
    provider_config_key: normalizeText(provider, ''),
    connection_id: normalizeText(connectionId, '') || undefined,
    syncs: normalizeArray(syncs),
    end_user: {
      id: normalizeText(workspaceId, ''),
      display_name: 'AuraFlow Workspace'
    }
  };
}
