function normalizeText(value, fallback = '') {
  return String(value || '').trim() || fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toISO(value) {
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

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [String(key || '').toLowerCase(), value])
  );
}

function providerToChannel(provider = '') {
  const normalized = normalizeText(provider, '').toLowerCase();
  if (normalized === 'gmail' || normalized === 'email') return 'email';
  if (normalized === 'facebook') return 'messenger';
  if (['whatsapp', 'sms', 'voice', 'instagram', 'messenger'].includes(normalized)) return normalized;
  return '';
}

function normalizeProviderName(provider = '') {
  const normalized = normalizeText(provider, 'gmail').toLowerCase();
  return normalized === 'email' ? 'gmail' : normalized;
}

function normalizeContactFromPerson(person = {}, fallback = {}) {
  const email = normalizeText(firstNonEmpty(person.email, fallback.email), '');
  const phone = normalizeText(firstNonEmpty(person.phone, fallback.phone), '');
  return {
    externalId: normalizeText(firstNonEmpty(person.id, person.externalId, email, phone, fallback.externalId), email || phone || fallback.externalId || 'unknown-contact'),
    name: normalizeText(firstNonEmpty(person.name, person.displayName, fallback.name), email || phone || 'Unknown contact'),
    email,
    phone,
    company: normalizeText(firstNonEmpty(person.company, fallback.company), ''),
    leadStage: normalizeText(firstNonEmpty(person.leadStage, person.lead_stage, fallback.leadStage), 'new'),
    ownerName: normalizeText(firstNonEmpty(person.ownerName, person.owner_name, fallback.ownerName), ''),
    tags: normalizeArray(firstNonEmpty(person.tags, fallback.tags))
  };
}

function buildWebhookVerification({ provider = '', headers = {}, input = {}, payload = {} } = {}) {
  const normalizedProvider = normalizeProviderName(provider);
  const normalizedHeaders = normalizeHeaders(headers);
  const metaSignature = normalizedHeaders['x-hub-signature-256'] || normalizedHeaders['x-hub-signature'] || '';
  const twilioSignature = normalizedHeaders['x-twilio-signature'] || '';
  const pushAuth = normalizedHeaders.authorization || normalizedHeaders['x-goog-authenticated-user-email'] || '';
  const verifyToken = normalizeText(firstNonEmpty(input.verifyToken, input.verify_token), '');
  const challenge = normalizeText(firstNonEmpty(input.challenge, input['hub.challenge']), '');
  const twilioConversation = Boolean(
    payload?.ConversationSid
    || payload?.conversationSid
    || payload?.['ConversationSid']
    || payload?.['EventType']
    || payload?.EventType
  );

  if (normalizedProvider === 'gmail') {
    return {
      provider: 'gmail',
      transport: 'pubsub-push',
      verified: Boolean(pushAuth),
      signed: Boolean(pushAuth),
      authHeaderPresent: Boolean(pushAuth),
      verificationToken: verifyToken,
      challenge,
      note: pushAuth
        ? 'Gmail messages should arrive through a Pub/Sub push relay or authenticated webhook forwarder.'
        : 'Pub/Sub push authentication header is missing; verify the relay before trusting the payload.'
    };
  }

  if (['whatsapp', 'instagram', 'messenger'].includes(normalizedProvider) && (twilioSignature || twilioConversation)) {
    return {
      provider: normalizedProvider,
      transport: 'twilio-conversations-webhook',
      verified: Boolean(twilioSignature),
      signed: Boolean(twilioSignature),
      signatureHeader: twilioSignature,
      verificationToken: verifyToken,
      challenge,
      note: twilioSignature
        ? 'Twilio webhook signature detected for a Conversations event.'
        : 'Twilio Conversations payload detected, but the Twilio signature header is missing.'
    };
  }

  if (['whatsapp', 'instagram', 'messenger'].includes(normalizedProvider)) {
    return {
      provider: normalizedProvider,
      transport: 'meta-webhook',
      verified: Boolean(metaSignature || verifyToken),
      signed: Boolean(metaSignature),
      signatureHeader: metaSignature,
      verificationToken: verifyToken,
      challenge,
      note: metaSignature
        ? 'Meta signature header detected and will be validated against the app secret when configured.'
        : 'Webhook verification relies on the shared verify token and the GET challenge handshake.'
    };
  }

  if (normalizedProvider === 'facebook') {
    return {
      provider: 'facebook',
      transport: 'meta-webhook',
      verified: Boolean(metaSignature || verifyToken),
      signed: Boolean(metaSignature),
      signatureHeader: metaSignature,
      verificationToken: verifyToken,
      challenge,
      note: metaSignature
        ? 'Meta signature header detected for a Facebook webhook event.'
        : 'Facebook webhook verification relies on the shared verify token and GET challenge handshake.'
    };
  }

  return {
    provider: normalizedProvider,
    transport: 'direct',
    verified: Boolean(metaSignature || pushAuth),
    signed: Boolean(metaSignature || pushAuth),
    verificationToken: verifyToken,
    challenge,
    note: 'Generic inbound event'
  };
}

function buildWebhookEventType(provider = '', input = {}, payload = {}) {
  const normalizedProvider = normalizeProviderName(provider);
  const normalizedHeaders = normalizeHeaders(input.headers || {});
  if (normalizedProvider === 'gmail') {
    if (payload?.message?.data || normalizedHeaders.authorization) return 'gmail.pubsub.push';
    if (payload.historyId || input.historyId) return 'gmail.thread.updated';
    return 'gmail.message.received';
  }
  const eventType = normalizeText(firstNonEmpty(payload?.EventType, payload?.eventType, input?.eventType), '');
  if (['whatsapp', 'instagram', 'messenger'].includes(normalizedProvider) && eventType) {
    const normalizedEvent = eventType.replace(/^on/i, '').replace(/[A-Z]/g, (char) => `.${char.toLowerCase()}`).replace(/^\./, '').replace(/\.+/g, '.');
    return `twilio.${normalizedProvider}.${normalizedEvent || 'message.received'}`;
  }
  if (normalizedProvider === 'whatsapp') return 'meta.whatsapp.message.received';
  if (normalizedProvider === 'instagram') return 'meta.instagram.message.received';
  if (normalizedProvider === 'messenger') return 'meta.messenger.message.received';
  if (normalizedProvider === 'facebook') return 'meta.facebook.event.received';
  return `${normalizedProvider}.message.received`;
}

function inferTwilioConversationProvider(input = {}, payload = {}) {
  const explicit = normalizeText(firstNonEmpty(input.provider, input.channel, input.source, payload.Channel, payload.channel), '').toLowerCase();
  if (['whatsapp', 'instagram', 'messenger'].includes(explicit)) return explicit;

  const source = normalizeText(firstNonEmpty(payload.Source, payload.source, payload['MessagingBinding.Type'], payload['ParticipantMessagingBinding.Type']), '').toLowerCase();
  const address = normalizeText(firstNonEmpty(
    payload['MessagingBinding.Address'],
    payload['ParticipantMessagingBinding.Address'],
    payload.Author,
    payload.author,
    payload.address
  ), '').toLowerCase();

  if (source.includes('instagram') || address.includes('instagram')) return 'instagram';
  if (source.includes('messenger') || address.includes('messenger') || source.includes('facebook')) return 'messenger';
  if (source.includes('whatsapp') || address.startsWith('whatsapp:')) return 'whatsapp';
  return explicit || 'whatsapp';
}

function normalizeTwilioReceiptStatus(status = '') {
  const normalized = normalizeText(status, '').toLowerCase();
  if (!normalized) return '';
  if (['read', 'delivered', 'sent', 'queued', 'failed', 'undelivered'].includes(normalized)) return normalized;
  if (normalized.includes('deliver')) return 'delivered';
  if (normalized.includes('read')) return 'read';
  if (normalized.includes('fail') || normalized.includes('undeliver')) return 'failed';
  return normalized;
}

function normalizeTwilioConversationPayload(input = {}) {
  const payload = input.payload || input.twilio || input.data || input;
  const provider = inferTwilioConversationProvider(input, payload);
  const eventType = buildWebhookEventType(provider, input, payload);
  const participantAddress = normalizeText(firstNonEmpty(
    payload['MessagingBinding.Address'],
    payload['ParticipantMessagingBinding.Address'],
    payload.Author,
    payload.author,
    payload.From,
    payload.from
  ), '');
  const proxyAddress = normalizeText(firstNonEmpty(
    payload['MessagingBinding.ProxyAddress'],
    payload['ParticipantMessagingBinding.ProxyAddress'],
    payload.To,
    payload.to
  ), '');
  const author = normalizeText(firstNonEmpty(payload.Author, payload.author, participantAddress), '');
  const conversationSid = normalizeText(firstNonEmpty(payload.ConversationSid, payload.conversationSid), `${provider}:conversation`);
  const messageSid = normalizeText(firstNonEmpty(payload.MessageSid, payload.messageSid, payload.SmsSid, payload.smsSid), '');
  const body = normalizeText(firstNonEmpty(payload.Body, payload.body, payload.MediaCaption, payload.mediaCaption), '');
  const deliveryStatus = normalizeTwilioReceiptStatus(firstNonEmpty(payload.DeliveryStatus, payload.deliveryStatus, payload.Status, payload.status));
  const isReceiptEvent = String(eventType).includes('delivery') || String(eventType).includes('updated') || Boolean(deliveryStatus);
  const contact = normalizeContactFromPerson({
    id: participantAddress || payload.ParticipantSid || payload.participantSid || payload.Author || payload.author,
    name: firstNonEmpty(payload.ParticipantIdentity, payload.participantIdentity, payload.Author, payload.author, participantAddress),
    phone: provider === 'whatsapp' ? participantAddress.replace(/^whatsapp:/i, '') : '',
    tags: [provider, 'twilio-conversations']
  }, {
    externalId: participantAddress || `${provider}:participant`,
    name: participantAddress || 'Twilio participant',
    phone: provider === 'whatsapp' ? participantAddress.replace(/^whatsapp:/i, '') : '',
    tags: [provider, 'twilio-conversations']
  });

  const inboundMessage = body || (!isReceiptEvent ? messageSid : '');
  const messageDirection = isReceiptEvent
    ? normalizeText(firstNonEmpty(payload.Direction, payload.direction), 'outbound')
    : normalizeText(firstNonEmpty(payload.Direction, payload.direction), 'inbound');

  const messages = inboundMessage
    ? [{
        externalId: messageSid || `${conversationSid}:message:${Date.now()}`,
        direction: messageDirection,
        senderName: author || contact.name,
        body: body || `Twilio Conversations event ${eventType}`,
        createdAt: toISO(firstNonEmpty(payload.DateCreated, payload.dateCreated, payload.Timestamp, payload.timestamp, input.createdAt)),
        rawPayload: payload
      }]
    : [];

  const deliveryReceipts = deliveryStatus
    ? [{
        externalMessageId: messageSid || `${conversationSid}:message`,
        status: deliveryStatus,
        timestamp: toISO(firstNonEmpty(payload.DateUpdated, payload.dateUpdated, payload.Timestamp, payload.timestamp, input.timestamp)),
        recipientId: participantAddress,
        conversationExternalId: conversationSid,
        error: normalizeText(firstNonEmpty(payload.ErrorCode, payload.errorCode, payload.ErrorMessage, payload.errorMessage), ''),
        rawPayload: payload
      }]
    : [];

  return {
    provider,
    workspaceId: normalizeText(input.workspaceId || input.workspace_id),
    accountId: normalizeText(firstNonEmpty(input.accountId, input.account_id, payload.AccountSid, payload.accountSid, payload.ChatServiceSid, payload.chatServiceSid), ''),
    eventType,
    verification: buildWebhookVerification({ provider, headers: input.headers, input, payload }),
    contact,
    conversation: {
      externalId: conversationSid,
      subject: normalizeText(firstNonEmpty(payload.FriendlyName, payload.friendlyName, body), `Twilio ${provider} conversation`),
      status: normalizeText(firstNonEmpty(payload.State, payload.state), 'open'),
      priority: normalizeText(firstNonEmpty(input.conversation?.priority), 'normal'),
      source: provider === 'instagram' ? 'Instagram' : provider === 'messenger' ? 'Messenger' : 'WhatsApp',
      assignedTo: normalizeText(input.conversation?.assignedTo || input.conversation?.assigned_to, ''),
      summary: normalizeText(firstNonEmpty(body, input.conversation?.summary), body || '')
    },
    messages,
    deliveryReceipts,
    routing: {
      participantAddress,
      proxyAddress
    }
  };
}

function normalizeMetaReceipts(input = {}, payload = {}) {
  const value = payload.entry?.[0]?.changes?.[0]?.value || payload.value || payload;
  const statuses = normalizeArray(value.statuses || payload.statuses);
  return statuses.map((status, index) => ({
    externalMessageId: normalizeText(firstNonEmpty(status.id, status.message_id, status.messageId), ''),
    status: normalizeText(firstNonEmpty(status.status, status.delivery_status), 'sent'),
    timestamp: toISO(firstNonEmpty(status.timestamp, status.updatedAt, input.timestamp)),
    recipientId: normalizeText(firstNonEmpty(status.recipient_id, status.recipientId, value.contacts?.[0]?.wa_id), ''),
    conversationExternalId: normalizeText(firstNonEmpty(status.conversation?.id, value.conversation?.id, input.conversation?.externalId), ''),
    error: normalizeText(firstNonEmpty(status.errors?.[0]?.message, status.error?.message, status.reason), ''),
    rawPayload: status.rawPayload || status.raw_payload || status,
    order: index
  }));
}

function normalizeGmailDeliveryReceipts(input = {}, payload = {}) {
  const messageId = normalizeText(firstNonEmpty(payload.messageId, payload.message_id, payload.id, input.messageId, input.message_id), '');
  const deliveryState = normalizeText(firstNonEmpty(
    payload.deliveryState,
    payload.delivery_state,
    payload.state,
    payload.status,
    payload.bounce?.status,
    payload.failure?.status
  ), '').toLowerCase();
  const errorMessage = normalizeText(firstNonEmpty(
    payload.error?.message,
    payload.bounce?.message,
    payload.failure?.message,
    payload.reason
  ), '');

  if (!messageId && !deliveryState) return [];

  const status = deliveryState === 'delivered'
    ? 'delivered'
    : deliveryState === 'read'
      ? 'read'
      : ['failed', 'bounced', 'bounce', 'error', 'undelivered'].some((term) => deliveryState.includes(term))
        ? 'failed'
        : deliveryState || 'sent';

  return [{
    externalMessageId: messageId || normalizeText(input.conversation?.externalId, 'gmail:message'),
    status,
    timestamp: toISO(firstNonEmpty(payload.timestamp, payload.updatedAt, input.timestamp)),
    recipientId: normalizeText(firstNonEmpty(payload.recipientId, payload.recipient_id, payload.to, input.recipientId), ''),
    conversationExternalId: normalizeText(firstNonEmpty(payload.conversation?.id, input.conversation?.externalId), ''),
    error: errorMessage,
    rawPayload: payload.rawPayload || payload.raw_payload || payload
  }];
}

function normalizeMessageFromRaw(raw = {}, fallback = {}) {
  const normalizedProvider = normalizeText(fallback.provider, '').toLowerCase();
  const resolvedChannel = normalizedProvider === 'gmail' || normalizedProvider === 'email'
    ? 'email'
    : normalizeText(firstNonEmpty(raw.channel, raw.channel_type, fallback.channel), providerToChannel(normalizedProvider) || 'whatsapp');
  return {
    externalId: normalizeText(firstNonEmpty(raw.externalId, raw.external_id, raw.id, fallback.externalId), fallback.externalId || 'unknown-message'),
    channel: resolvedChannel,
    direction: normalizeText(firstNonEmpty(raw.direction, fallback.direction), 'inbound'),
    senderName: normalizeText(firstNonEmpty(raw.senderName, raw.sender_name, raw.from?.name, raw.from?.email, fallback.senderName), ''),
    body: normalizeText(firstNonEmpty(raw.body, raw.text, raw.snippet, fallback.body), ''),
    createdAt: toISO(firstNonEmpty(raw.createdAt, raw.created_at, raw.timestamp, fallback.createdAt)),
    rawPayload: raw.rawPayload || raw.raw_payload || raw
  };
}

function normalizeNormalizedEnvelope(input = {}) {
  const provider = normalizeProviderName(input.provider);
  return {
    provider,
    workspaceId: normalizeText(input.workspaceId || input.workspace_id),
    accountId: normalizeText(input.accountId || input.account_id || ''),
    eventType: normalizeText(input.eventType, `${provider}.message.received`),
    verification: input.verification || buildWebhookVerification({ provider, headers: input.headers, input, payload: input }),
    contact: normalizeContactFromPerson(input.contact || {}, {
      externalId: `${provider}:contact`,
      name: 'Unknown contact',
      tags: [provider]
    }),
    conversation: {
      externalId: normalizeText(input.conversation?.externalId || input.conversation?.external_id || input.conversation?.threadId || input.conversation?.thread_id, `${provider}:thread`),
      subject: normalizeText(input.conversation?.subject, 'Incoming thread'),
      status: normalizeText(input.conversation?.status, 'open'),
      priority: normalizeText(input.conversation?.priority, 'normal'),
      source: normalizeText(input.conversation?.source, provider),
      assignedTo: normalizeText(input.conversation?.assignedTo || input.conversation?.assigned_to, ''),
      summary: normalizeText(input.conversation?.summary, '')
    },
    messages: normalizeArray(input.messages).map((message, index) =>
      normalizeMessageFromRaw(message, {
        externalId: `${provider}:message:${index + 1}`,
        direction: 'inbound',
        provider
      })
    )
  };
}

function normalizeGmailWebhookPayload(input = {}) {
  const payload = input.payload || input.gmail || input.data || {};
  const thread = payload.thread || payload.threadData || payload;
  const threadId = normalizeText(firstNonEmpty(payload.threadId, payload.thread_id, thread.id, thread.threadId, input.threadId, input.thread_id), `${input.provider || 'gmail'}:thread`);
  const subject = normalizeText(firstNonEmpty(thread.subject, payload.subject, input.subject), 'Incoming thread');
  const from = payload.from || payload.sender || thread.from || thread.sender || input.contact || {};
  const contact = normalizeContactFromPerson(from, {
    externalId: normalizeText(firstNonEmpty(from.email, from.id, input.contact?.externalId, input.contact?.email), 'gmail:contact'),
    name: normalizeText(firstNonEmpty(from.name, input.contact?.name), from.email || 'Unknown contact'),
    tags: ['gmail']
  });

  const rawMessages = normalizeArray(firstNonEmpty(payload.messages, thread.messages, input.messages));
  const deliveryReceipts = normalizeGmailDeliveryReceipts(input, payload);
  const messages = (rawMessages.length ? rawMessages : [{
    id: normalizeText(firstNonEmpty(payload.messageId, payload.id, `${threadId}:message:1`), `${threadId}:message:1`),
    direction: normalizeText(firstNonEmpty(payload.direction, input.direction), 'inbound'),
    senderName: contact.name,
    body: normalizeText(firstNonEmpty(payload.body, payload.snippet, payload.text, input.body), subject),
    createdAt: toISO(firstNonEmpty(payload.createdAt, payload.receivedAt, input.createdAt, input.receivedAt)),
    rawPayload: payload
  }]).map((message, index) =>
    normalizeMessageFromRaw(message, {
      externalId: `${threadId}:message:${index + 1}`,
      direction: message.direction || 'inbound',
      senderName: contact.name,
      createdAt: new Date().toISOString()
    })
  );

  const eventType = deliveryReceipts.length
    ? `gmail.message.${deliveryReceipts[0].status}`
    : buildWebhookEventType('gmail', input, payload);

  return {
    provider: 'gmail',
    workspaceId: normalizeText(input.workspaceId || input.workspace_id),
    accountId: normalizeText(firstNonEmpty(input.accountId, input.account_id, payload.accountId, payload.account_id), ''),
    eventType,
    verification: buildWebhookVerification({ provider: 'gmail', headers: input.headers, input, payload }),
    contact,
    conversation: {
      externalId: threadId,
      subject,
      status: normalizeText(firstNonEmpty(input.conversation?.status, payload.status), 'open'),
      priority: normalizeText(firstNonEmpty(input.conversation?.priority, payload.priority), 'normal'),
      source: 'Gmail',
      assignedTo: normalizeText(input.conversation?.assignedTo || input.conversation?.assigned_to, ''),
      summary: normalizeText(firstNonEmpty(input.conversation?.summary, payload.summary, payload.snippet), messages[0]?.body || '')
    },
    messages,
    deliveryReceipts
  };
}

function normalizeWhatsAppWebhookPayload(input = {}) {
  const payload = input.payload || input.whatsapp || input.data || {};
  const value = payload.entry?.[0]?.changes?.[0]?.value || payload.value || payload;
  const meta = value.metadata || {};
  const contacts = normalizeArray(value.contacts);
  const sourceContact = contacts[0] || value.contact || value.from || {};
  const rawMessages = normalizeArray(value.messages || input.messages);
  const contact = normalizeContactFromPerson(sourceContact, {
    externalId: normalizeText(firstNonEmpty(sourceContact.wa_id, sourceContact.phone, sourceContact.id, input.contact?.externalId), 'whatsapp:contact'),
    name: normalizeText(firstNonEmpty(sourceContact.profile?.name, sourceContact.name, input.contact?.name), 'WhatsApp contact'),
    phone: normalizeText(firstNonEmpty(sourceContact.wa_id, sourceContact.phone, input.contact?.phone), ''),
    tags: ['whatsapp']
  });

  const threadId = normalizeText(firstNonEmpty(input.conversation?.externalId, meta.phone_number_id, rawMessages[0]?.id, value.conversation?.id), `whatsapp:${contact.externalId}`);
  const deliveryReceipts = normalizeMetaReceipts(input, payload);
  const messages = (rawMessages.length ? rawMessages : [{
    id: normalizeText(firstNonEmpty(value.messages?.[0]?.id, `${threadId}:message:1`), `${threadId}:message:1`),
    direction: 'inbound',
    senderName: contact.name,
    body: normalizeText(firstNonEmpty(value.messages?.[0]?.text?.body, value.messages?.[0]?.body, input.body), 'Incoming WhatsApp message'),
    createdAt: toISO(firstNonEmpty(value.messages?.[0]?.timestamp, input.createdAt)),
    rawPayload: value.messages?.[0] || value
  }]).map((message, index) =>
    normalizeMessageFromRaw(message, {
      externalId: `${threadId}:message:${index + 1}`,
      direction: message.direction || 'inbound',
      senderName: contact.name,
      createdAt: new Date().toISOString()
    })
  );

  return {
    provider: 'whatsapp',
    workspaceId: normalizeText(input.workspaceId || input.workspace_id),
    accountId: normalizeText(firstNonEmpty(input.accountId, input.account_id, meta.phone_number_id, meta.display_phone_number), ''),
    contact,
    conversation: {
      externalId: threadId,
      subject: normalizeText(firstNonEmpty(input.conversation?.subject, value.messages?.[0]?.text?.body), 'Incoming WhatsApp thread'),
      status: normalizeText(firstNonEmpty(input.conversation?.status, value.status), 'open'),
      priority: normalizeText(firstNonEmpty(input.conversation?.priority), 'normal'),
      source: 'WhatsApp',
      assignedTo: normalizeText(input.conversation?.assignedTo || input.conversation?.assigned_to, ''),
      summary: normalizeText(firstNonEmpty(input.conversation?.summary, value.messages?.[0]?.text?.body), messages[0]?.body || '')
    },
    messages,
    deliveryReceipts,
    eventType: deliveryReceipts.length
      ? `meta.whatsapp.message.${deliveryReceipts[0].status}`
      : buildWebhookEventType('whatsapp', input, value),
    verification: buildWebhookVerification({ provider: 'whatsapp', headers: input.headers, input, payload: value })
  };
}

function normalizeMetaMessagingWebhookPayload(input = {}) {
  const provider = normalizeText(input.provider, 'messenger').toLowerCase();
  const payload = input.payload || input.meta || input.data || {};
  const entry = normalizeArray(payload.entry)[0] || {};
  const messagingEvent = normalizeArray(entry.messaging)[0] || {};
  const sourcePayload = messagingEvent && Object.keys(messagingEvent).length
    ? messagingEvent
    : (payload.entry?.[0]?.changes?.[0]?.value || payload.value || payload);
  const sender = sourcePayload.sender || sourcePayload.from || {};
  const recipient = sourcePayload.recipient || sourcePayload.to || {};
  const message = sourcePayload.message || sourcePayload.messages?.[0] || {};
  const postback = sourcePayload.postback || {};
  const accountId = normalizeText(firstNonEmpty(
    input.accountId,
    input.account_id,
    recipient.id,
    payload.id,
    entry.id
  ), '');
  const contact = normalizeContactFromPerson(sender, {
    externalId: normalizeText(firstNonEmpty(sender.id, input.contact?.externalId), `${provider}:contact`),
    name: normalizeText(firstNonEmpty(sender.name, input.contact?.name), provider === 'instagram' ? 'Instagram contact' : 'Messenger contact'),
    tags: [provider]
  });
  const threadId = normalizeText(firstNonEmpty(
    input.conversation?.externalId,
    sourcePayload.conversation?.id,
    sourcePayload.thread?.id,
    recipient.id,
    message.mid,
    `${provider}:${contact.externalId}`
  ), `${provider}:${contact.externalId}`);
  const body = normalizeText(firstNonEmpty(
    message.text,
    postback.title,
    postback.payload,
    input.body
  ), provider === 'instagram' ? 'Incoming Instagram message' : 'Incoming Messenger message');
  const createdAt = toISO(firstNonEmpty(sourcePayload.timestamp, message.timestamp, input.createdAt));
  const rawMessage = Object.keys(message).length ? message : (Object.keys(postback).length ? postback : sourcePayload);
  const normalizedMessage = normalizeMessageFromRaw(rawMessage, {
    externalId: normalizeText(firstNonEmpty(message.mid, postback.mid, `${threadId}:message:1`), `${threadId}:message:1`),
    direction: 'inbound',
    senderName: contact.name,
    body,
    createdAt
  });

  return {
    provider,
    workspaceId: normalizeText(input.workspaceId || input.workspace_id),
    accountId,
    eventType: buildWebhookEventType(provider, input, sourcePayload),
    verification: buildWebhookVerification({ provider, headers: input.headers, input, payload: sourcePayload }),
    contact,
    conversation: {
      externalId: threadId,
      subject: normalizeText(firstNonEmpty(input.conversation?.subject, body), provider === 'instagram' ? 'Incoming Instagram thread' : 'Incoming Messenger thread'),
      status: normalizeText(firstNonEmpty(input.conversation?.status, sourcePayload.status), 'open'),
      priority: normalizeText(firstNonEmpty(input.conversation?.priority), 'normal'),
      source: provider === 'instagram' ? 'Instagram' : 'Messenger',
      assignedTo: normalizeText(input.conversation?.assignedTo || input.conversation?.assigned_to, ''),
      summary: normalizeText(firstNonEmpty(input.conversation?.summary, body), body)
    },
    messages: [normalizedMessage],
    deliveryReceipts: normalizeMetaReceipts(input, payload)
  };
}

function normalizeFallbackWebhookPayload(input = {}) {
  if (input.contact && input.conversation && Array.isArray(input.messages)) {
    return normalizeNormalizedEnvelope(input);
  }

  return {
    provider: normalizeText(input.provider, 'gmail').toLowerCase(),
    workspaceId: normalizeText(input.workspaceId || input.workspace_id),
    accountId: normalizeText(input.accountId || input.account_id || ''),
    eventType: buildWebhookEventType(input.provider, input, input),
    verification: buildWebhookVerification({ provider: input.provider, headers: input.headers, input, payload: input }),
    contact: normalizeContactFromPerson(input.contact || {}, {
      externalId: normalizeText(input.contact?.externalId || input.contact?.external_id || 'fallback-contact', 'fallback-contact'),
      name: normalizeText(input.contact?.name, 'Unknown contact'),
      tags: [normalizeText(input.provider, 'inbound')]
    }),
    conversation: {
      externalId: normalizeText(input.conversation?.externalId || input.conversation?.external_id || input.conversation?.threadId || 'fallback-thread'),
      subject: normalizeText(input.conversation?.subject, 'Incoming thread'),
      status: normalizeText(input.conversation?.status, 'open'),
      priority: normalizeText(input.conversation?.priority, 'normal'),
      source: normalizeText(input.conversation?.source, normalizeText(input.provider, 'gmail')),
      assignedTo: normalizeText(input.conversation?.assignedTo || input.conversation?.assigned_to, ''),
      summary: normalizeText(input.conversation?.summary, '')
    },
    messages: normalizeArray(input.messages).map((message, index) =>
      normalizeMessageFromRaw(message, {
        externalId: `${normalizeText(input.provider, 'inbound')}:message:${index + 1}`,
        direction: 'inbound',
        provider: input.provider
      })
    ),
    deliveryReceipts: normalizeArray(input.deliveryReceipts || input.delivery_receipts)
  };
}

export function normalizeWebhookPayload(input = {}) {
  const provider = normalizeProviderName(input.provider || input.channel || input.source);
  const payload = input.payload || input.twilio || input.data || input;

  if (
    ['whatsapp', 'instagram', 'messenger'].includes(provider)
    && (
      payload?.ConversationSid
      || payload?.conversationSid
      || payload?.MessageSid
      || payload?.messageSid
      || payload?.SmsSid
      || payload?.smsSid
      || payload?.MessageStatus
      || payload?.messageStatus
      || payload?.DeliveryStatus
      || payload?.deliveryStatus
      || payload?.EventType
      || payload?.eventType
      || payload?.['MessagingBinding.Address']
      || payload?.['ParticipantMessagingBinding.Address']
    )
  ) {
    return normalizeTwilioConversationPayload({ ...input, provider });
  }

  if (input.contact && input.conversation && Array.isArray(input.messages)) {
    return normalizeNormalizedEnvelope({ ...input, provider, eventType: buildWebhookEventType(provider, input, input), verification: buildWebhookVerification({ provider, headers: input.headers, input, payload: input }) });
  }

  if (provider === 'gmail') {
    return normalizeGmailWebhookPayload({ ...input, provider });
  }

  if (provider === 'whatsapp') {
    return normalizeWhatsAppWebhookPayload({ ...input, provider });
  }

  if (provider === 'instagram' || provider === 'messenger' || provider === 'facebook') {
    return normalizeMetaMessagingWebhookPayload({ ...input, provider: provider === 'facebook' ? 'messenger' : provider });
  }

  return normalizeFallbackWebhookPayload({ ...input, provider });
}
