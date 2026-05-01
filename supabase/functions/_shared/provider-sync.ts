function normalizeText(value: unknown, fallback = "") {
  return String(value || "").trim() || fallback;
}

function normalizeArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toIso(value: unknown) {
  if (!value) return new Date().toISOString();
  const date = new Date(Number(value) > 1e12 ? Number(value) : String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      if (value.length) return value;
      continue;
    }
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

export function extractNangoRecords(payload: Record<string, unknown> = {}) {
  const source = [
    payload.records,
    (payload.data as Record<string, unknown> | undefined)?.records,
    (payload.result as Record<string, unknown> | undefined)?.records,
    payload.items,
    (payload.data as Record<string, unknown> | undefined)?.items,
    (payload.value as Record<string, unknown> | undefined)?.records
  ].find(Array.isArray);
  if (source) return source as Record<string, unknown>[];
  if (payload.record) return [payload.record as Record<string, unknown>];
  if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    return [payload.data as Record<string, unknown>];
  }
  if (payload.value && typeof payload.value === "object" && !Array.isArray(payload.value)) {
    return [payload.value as Record<string, unknown>];
  }
  return [];
}

function buildContactEnvelope(provider: string, record: Record<string, unknown> = {}, body: Record<string, unknown> = {}, index = 0) {
  const contact = (record.contact || record.person || record.sender || record.from || {}) as Record<string, unknown>;
  const email = normalizeText(firstNonEmpty(contact.email, record.email, record.sender_email, record.senderEmail, body.email), "");
  const phone = normalizeText(firstNonEmpty(contact.phone, contact.wa_id, record.phone, record.phone_number, body.phone), "");
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
    name: normalizeText(firstNonEmpty(contact.name, contact.displayName, record.name, record.sender_name, record.senderName, email, phone), "Unknown contact"),
    email,
    phone,
    company: normalizeText(firstNonEmpty(contact.company, record.company, record.organization, body.company), ""),
    leadStage: normalizeText(firstNonEmpty(contact.leadStage, contact.lead_stage, record.lead_stage, record.stage), "new"),
    ownerName: normalizeText(firstNonEmpty(contact.ownerName, contact.owner_name, record.owner_name, body.owner_name), ""),
    tags: normalizeArray(firstNonEmpty(contact.tags, record.tags, body.tags)).map((tag) => normalizeText(tag)).filter(Boolean)
  };
}

function buildConversationEnvelope(provider: string, record: Record<string, unknown> = {}, body: Record<string, unknown> = {}, index = 0) {
  const conversation = (record.conversation || record.thread || {}) as Record<string, unknown>;
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
  ), "Incoming thread");
  const summary = normalizeText(firstNonEmpty(
    conversation.summary,
    record.summary,
    record.snippet,
    record.body,
    record.text,
    body.summary,
    body.body,
    body.text
  ), "");

  return {
    externalId,
    subject,
    status: normalizeText(firstNonEmpty(conversation.status, record.status, body.status), "open"),
    priority: normalizeText(firstNonEmpty(conversation.priority, record.priority, body.priority), "normal"),
    source: normalizeText(firstNonEmpty(conversation.source, record.source, body.source, provider), provider),
    assignedTo: normalizeText(firstNonEmpty(conversation.assignedTo, conversation.assigned_to, record.assigned_to, record.assignedTo, body.assigned_to), ""),
    summary
  };
}

function buildMessagesEnvelope(
  provider: string,
  record: Record<string, unknown> = {},
  body: Record<string, unknown> = {},
  conversationExternalId: string,
  contactName: string,
  index = 0
) {
  const message = (record.message || {}) as Record<string, unknown>;
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
  ), "");
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
  const direction = normalizeText(firstNonEmpty(message.direction, record.direction, body.direction), "inbound");
  const senderName = normalizeText(firstNonEmpty(
    message.senderName,
    message.sender_name,
    record.sender_name,
    record.senderName,
    (record.from as Record<string, unknown> | undefined)?.name,
    (record.contact as Record<string, unknown> | undefined)?.name,
    contactName
  ), contactName || "Unknown contact");

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
  provider = "gmail",
  workspaceId = "",
  record = {},
  body = {},
  index = 0,
  eventType = ""
}: {
  provider?: string;
  workspaceId?: string;
  record?: Record<string, unknown>;
  body?: Record<string, unknown>;
  index?: number;
  eventType?: string;
} = {}) {
  const normalizedProvider = normalizeText(provider, "gmail").toLowerCase();
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
  ), "");

  return {
    provider: normalizedProvider,
    workspaceId: normalizeText(workspaceId || (body.workspaceId as string) || (body.workspace_id as string), ""),
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
      transport: "nango-sync",
      verified: true,
      note: "Normalized from Nango sync payload."
    },
    headers: (body.headers as Record<string, unknown> | undefined) || {}
  };
}

export function buildNangoTriggerBody({
  workspaceId = "",
  provider = "",
  connectionId = "",
  syncs = []
}: {
  workspaceId?: string;
  provider?: string;
  connectionId?: string;
  syncs?: unknown[];
} = {}) {
  return {
    provider_config_key: normalizeText(provider, ""),
    connection_id: normalizeText(connectionId, "") || undefined,
    syncs: normalizeArray(syncs),
    end_user: {
      id: normalizeText(workspaceId, ""),
      display_name: "AuraFlow Workspace"
    }
  };
}
