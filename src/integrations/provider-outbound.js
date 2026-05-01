import { getProviderConnector } from './provider-connectors.js';
import { canonicalizeConversation, canonicalizeMessage } from '../contracts/canonical-model.js';
import {
  sendAuraFlowTemplate,
  sendTwilioSmsMessage,
  sendTwilioWhatsAppMessage
} from '../server/twilio-service.js';

function normalizeProviderMessageId(provider, conversationId) {
  const stamp = Date.now().toString(36);
  return `${provider}:out:${conversationId}:${stamp}`;
}

function toBase64Url(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseJsonSafely(text = '') {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function buildProviderError(responseText = '', fallbackMessage = 'Provider request failed.') {
  const parsed = parseJsonSafely(responseText);
  return parsed?.error?.message || parsed?.message || responseText || fallbackMessage;
}

function isTwilioSid(value = '', prefixes = []) {
  const normalized = String(value || '').trim();
  return prefixes.some((prefix) => normalized.startsWith(prefix));
}

function connectionValue(connection = {}, ...keys) {
  for (const key of keys) {
    const direct = connection?.[key];
    if (String(direct || '').trim()) return String(direct).trim();
    const credential = connection?.credentials?.[key];
    if (String(credential || '').trim()) return String(credential).trim();
    const metadata = connection?.connection_metadata?.[key];
    if (String(metadata || '').trim()) return String(metadata).trim();
  }
  return '';
}

function normalizePhone(value = '') {
  return String(value || '').trim().replace(/[^\d+]/g, '');
}

export function buildOutboundDeliveryPayload({
  workspaceId,
  conversation = {},
  message = {},
  mode = 'sent'
} = {}) {
  const normalizedConversation = canonicalizeConversation({
    ...conversation,
    workspace_id: workspaceId || conversation.workspace_id || conversation.workspaceId
  });
  const normalizedMessage = canonicalizeMessage({
    ...message,
    workspace_id: workspaceId || message.workspace_id || message.workspaceId,
    conversation_id: conversation.id || message.conversation_id || message.conversationId,
    direction: 'outbound',
    external_message_id: message.external_message_id || message.externalMessageId || normalizeProviderMessageId(normalizedConversation.source_provider || 'manual', conversation.id || 'conversation'),
    sender_name: message.sender_name || message.senderName || 'AuraFlow'
  });
  const provider = getProviderConnector(normalizedConversation.source_provider || normalizedConversation.source || 'manual');

  return {
    provider: provider.key,
    providerLabel: provider.label,
    channelType: provider.channelType,
    mode,
    workspaceId: normalizedConversation.workspace_id || workspaceId || '',
    conversation: normalizedConversation,
    message: normalizedMessage,
    recipientEmail: String(message.recipient_email || message.recipientEmail || conversation.recipient_email || conversation.recipientEmail || '').trim(),
    recipientPhone: String(message.recipient_phone || message.recipientPhone || conversation.recipient_phone || conversation.recipientPhone || '').trim(),
    recipientId: String(
      message.recipient_id
      || message.recipientId
      || conversation.recipient_id
      || conversation.recipientId
      || conversation.external_conversation_id
      || conversation.externalConversationId
      || ''
    ).trim(),
    deliveryState: mode === 'queued' ? 'queued' : 'sent',
    externalMessageId: normalizedMessage.external_message_id
  };
}

function getProviderTransport(providerKey, connection = {}) {
  const provider = getProviderConnector(providerKey);
  switch (provider.key) {
    case 'gmail':
      return {
        provider: provider.key,
        transport: 'gmail-api',
        configured: Boolean(
          process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET &&
          (connectionValue(connection, 'access_token', 'refresh_token', 'email') || process.env.GMAIL_INBOX_ADDRESS)
        )
      };
    case 'whatsapp':
      return {
        provider: provider.key,
        transport: 'twilio-whatsapp-production',
        configured: Boolean(
          process.env.TWILIO_ACCOUNT_SID &&
          process.env.TWILIO_AUTH_TOKEN &&
          (
            connectionValue(connection, 'conversation_sid', 'service_sid', 'whatsapp_sender', 'registered_sender')
            || process.env.TWILIO_CONVERSATIONS_SERVICE_SID
            || process.env.TWILIO_WHATSAPP_SENDER
            || process.env.TWILIO_WHATSAPP_NUMBER
            || process.env.TWILIO_WHATSAPP_ACCOUNT_SID
            || process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER
          )
        )
      };
    case 'instagram':
      return {
        provider: provider.key,
        transport: process.env.BOTPRESS_REPLY_WEBHOOK_URL || process.env.BOTPRESS_WEBHOOK_URL || process.env.BOTPRESS_INSTAGRAM_WEBHOOK_URL
          ? 'botpress-webhook'
          : 'twilio-conversations',
        configured: Boolean(
          process.env.BOTPRESS_REPLY_WEBHOOK_URL ||
          process.env.BOTPRESS_WEBHOOK_URL ||
          process.env.BOTPRESS_INSTAGRAM_WEBHOOK_URL ||
          (
            process.env.TWILIO_ACCOUNT_SID &&
            process.env.TWILIO_AUTH_TOKEN &&
            (connectionValue(connection, 'conversation_sid', 'service_sid') || process.env.TWILIO_CONVERSATIONS_SERVICE_SID)
          )
        )
      };
    case 'messenger':
      return {
        provider: provider.key,
        transport: connectionValue(connection, 'page_access_token', 'access_token') && connectionValue(connection, 'page_id', 'external_account_id')
          ? 'meta-messenger'
          : 'twilio-conversations',
        configured: Boolean(
          (
            connectionValue(connection, 'page_access_token', 'access_token')
            && connectionValue(connection, 'page_id', 'external_account_id')
          )
          || (
            process.env.TWILIO_ACCOUNT_SID &&
            process.env.TWILIO_AUTH_TOKEN &&
            (connectionValue(connection, 'conversation_sid', 'service_sid') || process.env.TWILIO_CONVERSATIONS_SERVICE_SID)
          )
        )
      };
    default:
      return {
        provider: provider.key,
        transport: 'demo-adapter',
        configured: false
      };
  }
}

async function deliverGmailMessage(delivery, connection = {}) {
  const fromAddress = connectionValue(connection, 'email') || process.env.GMAIL_FROM_EMAIL || process.env.GMAIL_INBOX_ADDRESS || '';
  const toAddress = delivery.recipientEmail;
  if (!fromAddress) {
    throw new Error('Gmail from address is not configured.');
  }
  if (!toAddress) {
    throw new Error('Gmail recipient email is missing.');
  }
  const subject = delivery.conversation.subject || 'AuraFlow reply';
  const mime = [
    `To: ${toAddress}`,
    `From: ${fromAddress}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    delivery.message.body || ''
  ].join('\r\n');
  let accessToken = connectionValue(connection, 'access_token') || process.env.GMAIL_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN || '';
  if (!accessToken) {
    accessToken = await refreshGmailToken(connection);
  }
  if (!accessToken) {
    throw new Error('Gmail access token is not configured.');
  }

  const sendRequest = async (token) => {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: toBase64Url(mime)
      })
    });
    const text = await response.text();
    return { response, text, json: parseJsonSafely(text) };
  };

  let attempt = await sendRequest(accessToken);
  if (attempt.response.status === 401) {
    const refreshedAccessToken = await refreshGmailToken(connection);
    if (refreshedAccessToken) {
      attempt = await sendRequest(refreshedAccessToken);
    }
  }

  if (!attempt.response.ok) {
    throw new Error(buildProviderError(attempt.text, 'Failed to send Gmail message.'));
  }
  const json = attempt.json;
  return {
    ...delivery,
    providerDeliveryStatus: 'sent',
    providerMessageId: json.id || `${delivery.externalMessageId}:gmail`,
    transport: 'gmail-api'
  };
}

async function deliverWhatsAppMessage(delivery, connection = {}) {
  const recipientPhone = normalizePhone(delivery.recipientPhone.replace(/^whatsapp:/i, ''));
  if (!recipientPhone) {
    throw new Error('WhatsApp recipient phone number is missing.');
  }

  const conversationSid = connectionValue(connection, 'conversation_sid', 'twilio_conversation_sid')
    || delivery.conversation.external_conversation_id
    || delivery.conversation.externalConversationId
    || '';

  if (isTwilioSid(conversationSid, ['CH'])) {
    return deliverTwilioConversationMessage(delivery, connection, {
      conversationSid,
      fallbackProviderMessageId: `${delivery.externalMessageId}:twilio-whatsapp`
    });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const templateName = connectionValue(connection, 'template_name')
    || String(delivery.message.raw_payload?.template_name || '').trim();
  const templateVariables = delivery.message.raw_payload?.template_variables || {};

  if (!accountSid || !authToken) {
    throw new Error('Twilio account credentials are not configured.');
  }

  const json = templateName
    ? await sendAuraFlowTemplate({
      contactId: delivery.conversation.contact_id || '',
      to: recipientPhone,
      channel: 'whatsapp',
      templateName,
      variables: templateVariables,
      connection
    })
    : await sendTwilioWhatsAppMessage({
      to: recipientPhone,
      body: delivery.message.body || '',
      from: connectionValue(connection, 'whatsapp_sender', 'registered_sender', 'sandbox_number', 'whatsapp_sandbox_number')
    });
  return {
    ...delivery,
    providerDeliveryStatus: 'sent',
    providerMessageId: json.sid || `${delivery.externalMessageId}:twilio-whatsapp`,
    transport: templateName ? 'twilio-whatsapp-template' : 'twilio-whatsapp-production'
  };
}

export async function refreshGmailToken(connection = {}) {
  const refreshToken = connectionValue(connection, 'refresh_token') || process.env.GMAIL_REFRESH_TOKEN || '';
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

  if (!refreshToken) {
    throw new Error('Gmail refresh token is not configured.');
  }
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth client credentials are not configured.');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const text = await response.text();
  const json = parseJsonSafely(text);
  if (!response.ok) {
    throw new Error(buildProviderError(text, 'Failed to refresh Gmail access token.'));
  }

  const accessToken = String(json.access_token || '').trim();
  if (!accessToken) {
    throw new Error('Google token refresh response did not include an access token.');
  }

  process.env.GMAIL_ACCESS_TOKEN = accessToken;
  process.env.GOOGLE_ACCESS_TOKEN = accessToken;
  if (connection?.credentials) {
    connection.credentials.access_token = accessToken;
  }
  return accessToken;
}

async function deliverTwilioConversationMessage(delivery, connection = {}, {
  conversationSid = '',
  fallbackProviderMessageId = ''
} = {}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  if (!accountSid || !authToken) {
    throw new Error('Twilio account credentials are not configured.');
  }
  if (!conversationSid || !isTwilioSid(conversationSid, ['CH'])) {
    throw new Error(`${delivery.providerLabel} conversation SID is missing. Save the Twilio Conversation SID on the conversation or channel before sending through Conversations.`);
  }

  const response = await fetch(`https://conversations.twilio.com/v1/Conversations/${encodeURIComponent(conversationSid)}/Messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      Author: delivery.message.sender_name || delivery.message.senderName || 'AuraFlow',
      Body: delivery.message.body || ''
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(buildProviderError(text, `Failed to send ${delivery.providerLabel} message through Twilio Conversations.`));
  }
  const json = parseJsonSafely(text);
  return {
    ...delivery,
    providerDeliveryStatus: 'sent',
    providerMessageId: json.sid || fallbackProviderMessageId || `${delivery.externalMessageId}:twilio-conversations`,
    transport: 'twilio-conversations'
  };
}

async function deliverInstagramMessage(delivery, connection = {}) {
  const webhookUrl = process.env.BOTPRESS_REPLY_WEBHOOK_URL
    || process.env.BOTPRESS_WEBHOOK_URL
    || process.env.BOTPRESS_INSTAGRAM_WEBHOOK_URL
    || '';

  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.BOTPRESS_REPLY_WEBHOOK_TOKEN || process.env.BOTPRESS_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${process.env.BOTPRESS_REPLY_WEBHOOK_TOKEN || process.env.BOTPRESS_WEBHOOK_TOKEN}` }
          : {})
      },
      body: JSON.stringify({
        workspaceId: delivery.workspaceId,
        channel: 'instagram',
        sender: delivery.message.sender_name || delivery.message.senderName || 'AuraFlow',
        text: delivery.message.body || '',
        body: delivery.message.body || '',
        conversationId: delivery.conversation.id || '',
        recipientId: delivery.recipientId || '',
        recipientPhone: delivery.recipientPhone || '',
        recipientEmail: delivery.recipientEmail || '',
        provider: 'instagram'
      })
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(buildProviderError(text, 'Failed to send Instagram message through Botpress.'));
    }
    const json = parseJsonSafely(text);
    return {
      ...delivery,
      providerDeliveryStatus: 'sent',
      providerMessageId: json.messageId || json.id || `${delivery.externalMessageId}:botpress`,
      transport: 'botpress-webhook'
    };
  }

  return deliverTwilioConversationMessage(delivery, connection, {
    conversationSid: connectionValue(connection, 'conversation_sid', 'twilio_conversation_sid')
      || delivery.conversation.external_conversation_id
      || delivery.conversation.externalConversationId
      || '',
    fallbackProviderMessageId: `${delivery.externalMessageId}:instagram`
  });
}

async function deliverMessengerMessage(delivery, connection = {}) {
  const directAccessToken = connectionValue(connection, 'page_access_token', 'access_token');
  const pageId = connectionValue(connection, 'page_id', 'external_account_id');
  const recipientId = String(delivery.recipientId || '').trim();
  const currentConversationId = delivery.conversation.external_conversation_id || delivery.conversation.externalConversationId || '';
  if (directAccessToken && pageId && recipientId && !isTwilioSid(currentConversationId, ['CH'])) {
    const graphVersion = process.env.META_GRAPH_VERSION || 'v20.0';
    const endpoint = new URL(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pageId)}/messages`);
    endpoint.searchParams.set('access_token', directAccessToken);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_type: 'RESPONSE',
        recipient: { id: recipientId },
        message: { text: delivery.message.body || '' }
      })
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(buildProviderError(text, 'Failed to send Messenger message through the Meta Send API.'));
    }
    const json = parseJsonSafely(text);
    return {
      ...delivery,
      providerDeliveryStatus: 'sent',
      providerMessageId: json.message_id || json.recipient_id || `${delivery.externalMessageId}:messenger`,
      transport: 'meta-messenger'
    };
  }

  return deliverTwilioConversationMessage(delivery, connection, {
    conversationSid: connectionValue(connection, 'conversation_sid', 'twilio_conversation_sid')
      || delivery.conversation.external_conversation_id
      || delivery.conversation.externalConversationId
      || '',
    fallbackProviderMessageId: `${delivery.externalMessageId}:messenger`
  });
}

export async function sendProviderOutboundMessage(payload = {}) {
  const delivery = buildOutboundDeliveryPayload(payload);
  const connection = payload.connection || {};
  const transport = getProviderTransport(delivery.provider, connection);
  const providerDelivery = transport.configured
    ? delivery.provider === 'gmail'
      ? await deliverGmailMessage(delivery, connection)
      : delivery.provider === 'whatsapp'
        ? await deliverWhatsAppMessage(delivery, connection)
        : delivery.provider === 'instagram'
          ? await deliverInstagramMessage(delivery, connection)
          : delivery.provider === 'messenger'
            ? await deliverMessengerMessage(delivery, connection)
            : { ...delivery, providerDeliveryStatus: 'queued', providerMessageId: delivery.externalMessageId }
    : {
      ...delivery,
      providerDeliveryStatus: 'demo',
      providerMessageId: `${delivery.externalMessageId}:demo`,
      transport: 'demo-adapter'
    };
  return {
    ok: true,
    ...providerDelivery,
    providerTransport: transport.transport,
    providerConfigured: transport.configured,
    sentAt: new Date().toISOString(),
    deliveryMode: delivery.mode
  };
}
