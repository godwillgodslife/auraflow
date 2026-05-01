import crypto from 'node:crypto';

import { ingestProviderPayload, validateIngestSecret } from '../../src/integrations/supabase-admin.js';
import { normalizeWebhookPayload } from '../../src/integrations/provider-webhooks.js';
import { decryptConnectionSecret } from '../../src/server/connection-crypto.js';
import { createAiAssistResponse } from '../../src/server/ai-assist.js';
import { sendProviderOutboundMessage } from '../../src/integrations/provider-outbound.js';
import { sendAuraFlowTemplate } from '../../src/server/twilio-service.js';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function text(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: String(body ?? '')
  };
}

function getSupabaseConfig() {
  return {
    url: String(process.env.SUPABASE_URL || '').trim(),
    serviceKey: String(process.env.AURAFLOW_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    schema: String(process.env.SUPABASE_SCHEMA || 'public').trim() || 'public'
  };
}

function getTokenEncryptionSecret() {
  return normalizeText(
    process.env.TOKEN_ENCRYPTION_SECRET
    || process.env.AURAFLOW_SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY,
    ''
  );
}

function buildSupabaseHeaders() {
  const { serviceKey, schema } = getSupabaseConfig();
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Profile': schema,
    'Content-Profile': schema
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function supabaseRest(pathname, { method = 'GET', body = null, query = '', prefer = 'return=representation' } = {}) {
  const { url, serviceKey } = getSupabaseConfig();
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
      ...buildSupabaseHeaders(),
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || payload?.raw || `Supabase request failed with ${response.status}`);
  }
  return payload;
}

function isUnknownColumnError(error, column = '') {
  const message = String(error?.message || error || '').toLowerCase();
  return Boolean(column) && message.includes(String(column).toLowerCase()) && (message.includes('column') || message.includes('schema cache'));
}

function normalizeText(value, fallback = '') {
  return String(value || '').trim() || fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
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

function toISO(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(Number(value) > 1e12 ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function parseEventBody(event) {
  const rawText = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event.body || '');

  if (!rawText) return { body: {}, rawText: '' };

  try {
    return {
      body: JSON.parse(rawText),
      rawText
    };
  } catch {
    const contentType = String(event.headers?.['content-type'] || event.headers?.['Content-Type'] || '').toLowerCase();
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(rawText);
      const body = {};
      for (const [key, value] of params.entries()) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          body[key] = Array.isArray(body[key]) ? [...body[key], value] : [body[key], value];
          continue;
        }
        body[key] = value;
      }
      return { body, rawText };
    }
    throw new Error('Invalid JSON body');
  }
}

function verifyMetaSignature(rawText = '', headers = {}) {
  const appSecret = process.env.META_APP_SECRET || '';
  if (!appSecret) {
    return { verified: true, reason: 'Meta app secret not configured; signature verification skipped.' };
  }

  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [String(key || '').toLowerCase(), value])
  );
  const headerValue = String(
    normalizedHeaders['x-hub-signature-256'] || normalizedHeaders['x-hub-signature'] || ''
  ).trim();

  if (!headerValue.startsWith('sha256=')) {
    return { verified: false, reason: 'Meta signature header is missing.' };
  }

  const providedSignature = headerValue.slice('sha256='.length);
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(rawText || '', 'utf8')
    .digest('hex');

  if (providedSignature.length !== expectedSignature.length) {
    return { verified: false, reason: 'Meta signature length mismatch.' };
  }

  const matches = crypto.timingSafeEqual(
    Buffer.from(providedSignature, 'utf8'),
    Buffer.from(expectedSignature, 'utf8')
  );

  return {
    verified: matches,
    reason: matches ? 'Meta signature verified.' : 'Meta signature mismatch.'
  };
}

function verifyTwilioSignature(requestUrl = '', body = {}, headers = {}) {
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  if (!authToken) {
    return { verified: true, reason: 'Twilio auth token not configured; signature verification skipped.' };
  }

  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [String(key || '').toLowerCase(), value])
  );
  const signatureHeader = String(normalizedHeaders['x-twilio-signature'] || '').trim();
  if (!signatureHeader) {
    return { verified: false, reason: 'Missing X-Twilio-Signature header.' };
  }

  const sortedEntries = Object.entries(body || {})
    .flatMap(([key, value]) => Array.isArray(value) ? value.map((entry) => [key, String(entry ?? '')]) : [[key, String(value ?? '')]])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  const expectedPayload = `${requestUrl}${sortedEntries.map(([key, value]) => `${key}${value}`).join('')}`;
  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(expectedPayload, 'utf8')
    .digest('base64');

  if (expectedSignature.length !== signatureHeader.length) {
    return { verified: false, reason: 'Twilio signature length mismatch.' };
  }

  const matches = crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'utf8'),
    Buffer.from(signatureHeader, 'utf8')
  );

  return {
    verified: matches,
    reason: matches ? 'Twilio signature verified.' : 'Twilio signature mismatch.'
  };
}

function decodePubsubMessageData(data = '') {
  if (!data) return {};
  try {
    return JSON.parse(Buffer.from(String(data), 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

function resolveProvider(event) {
  const params = event.queryStringParameters || {};
  const directProvider = String(params.provider || params.channel || params.source || '').trim().toLowerCase();
  if (directProvider) return directProvider;

  const rawUrl = String(event.rawUrl || event.path || '').trim();
  const pathMatch = rawUrl.match(/\/api\/webhook\/([^/?#]+)/i)
    || rawUrl.match(/\/api\/webhooks\/([^/?#]+)/i)
    || rawUrl.match(/\/webhooks\/([^/?#]+)/i);
  return String(pathMatch?.[1] || '').trim().toLowerCase();
}

function resolveWorkspaceId(event, body = {}) {
  const params = event.queryStringParameters || {};
  return String(
    params.workspace_id
    || params.workspaceId
    || body.workspaceId
    || body.workspace_id
    || ''
  ).trim();
}

function verifyInbound(provider, body = {}, rawText = '', headers = {}, event = {}) {
  const key = String(provider || '').trim().toLowerCase();
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers || {}).map(([name, value]) => [String(name || '').toLowerCase(), value])
  );
  const twilioPayload = Boolean(
    normalizedHeaders['x-twilio-signature']
    || body?.ConversationSid
    || body?.EventType
    || body?.['MessagingBinding.Address']
    || body?.['ParticipantMessagingBinding.Address']
  );

  const ingestHeaderPresent = Boolean(
    normalizedHeaders['x-auraflow-ingest-secret']
    || normalizedHeaders['X-Auraflow-Ingest-Secret']
  );
  if (ingestHeaderPresent && validateIngestSecret(headers)) {
    return {
      verified: true,
      reason: 'Validated with AuraFlow ingest secret.'
    };
  }

  if (['whatsapp', 'instagram', 'messenger'].includes(key) && twilioPayload) {
    return verifyTwilioSignature(String(event.rawUrl || event.path || ''), body, normalizedHeaders);
  }

  if (['whatsapp', 'instagram', 'messenger', 'facebook'].includes(key)) {
    return verifyMetaSignature(rawText, normalizedHeaders);
  }

  if (key === 'gmail') {
    const expectedSecret = normalizeText(process.env.GMAIL_WEBHOOK_SECRET, '');
    const querySecret = normalizeText(
      event.queryStringParameters?.secret
      || event.queryStringParameters?.verify_secret,
      ''
    );
    if (!expectedSecret || querySecret !== expectedSecret) {
      return {
        verified: false,
        reason: 'Invalid Gmail webhook secret.'
      };
    }
    if (body?.message?.data) {
      return {
        verified: true,
        reason: 'Accepted Gmail Pub/Sub push payload.'
      };
    }
    return {
      verified: false,
      reason: 'Gmail inbound must arrive as a Pub/Sub push payload.'
    };
  }

  return {
    verified: false,
    reason: 'Unknown inbound provider verification path.'
  };
}

function extractMetaLeadgenChange(body = {}) {
  const entries = normalizeArray(body.entry);
  for (const entry of entries) {
    const changes = normalizeArray(entry?.changes);
    for (const change of changes) {
      const field = normalizeText(change?.field || change?.event || '', '').toLowerCase();
      const value = change?.value || {};
      const leadId = normalizeText(
        firstNonEmpty(
          value.leadgen_id,
          value.lead_id,
          change?.leadgen_id,
          change?.lead_id
        ),
        ''
      );
      if (field === 'leadgen' || leadId) {
        return {
          field: field || 'leadgen',
          entry,
          change,
          value,
          leadId,
          pageId: normalizeText(firstNonEmpty(value.page_id, entry?.id), ''),
          formId: normalizeText(firstNonEmpty(value.form_id, value.leadgen_form_id), ''),
          adId: normalizeText(firstNonEmpty(value.ad_id, value.adgroup_id), ''),
          createdTime: normalizeText(firstNonEmpty(value.created_time, value.time), '')
        };
      }
    }
  }
  return null;
}

function getMetaGraphAccessToken() {
  return normalizeText(
    process.env.META_ACCESS_TOKEN
    || process.env.META_PAGE_ACCESS_TOKEN
    || process.env.FACEBOOK_PAGE_ACCESS_TOKEN
    || '',
    ''
  );
}

function decryptConnectionCredentials(credentials = {}) {
  const secret = getTokenEncryptionSecret();
  if (!secret) return {};
  const output = {};
  Object.entries(credentials || {}).forEach(([key, value]) => {
    const normalized = normalizeText(value, '');
    if (!normalized) return;
    try {
      output[key] = decryptConnectionSecret(normalized, secret);
    } catch {
      output[key] = '';
    }
  });
  return output;
}

async function getWorkspaceConnection(workspaceId, provider) {
  if (!workspaceId || !provider) return null;
  const rows = await supabaseRest('workspace_connections', {
    query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&provider=eq.${encodeURIComponent(provider)}&select=*`,
    prefer: 'return=representation'
  }).catch(() => []);
  const record = Array.isArray(rows) ? rows[0] : rows;
  if (!record) return null;
  return {
    ...record,
    credentials: decryptConnectionCredentials(record.credentials || {})
  };
}

async function getWorkspaceMetaLeadConnection(workspaceId) {
  return (await getWorkspaceConnection(workspaceId, 'facebook'))
    || (await getWorkspaceConnection(workspaceId, 'messenger'))
    || null;
}

async function fetchMetaGrantedScopes(accessToken = '') {
  if (!accessToken) return [];
  const graphVersion = normalizeText(process.env.META_GRAPH_VERSION, 'v20.0');
  const endpoint = new URL(`https://graph.facebook.com/${graphVersion}/me/permissions`);
  endpoint.searchParams.set('access_token', accessToken);
  const response = await fetch(endpoint);
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `Meta permissions lookup failed with ${response.status}.`);
  }
  return normalizeArray(payload?.data)
    .filter((item) => normalizeText(item?.status, '').toLowerCase() === 'granted')
    .map((item) => normalizeText(item?.permission, ''))
    .filter(Boolean);
}

async function fetchMetaLeadDetails(workspaceId = '', leadId = '') {
  if (!leadId) {
    throw new Error('Meta lead id is missing.');
  }
  const connection = await getWorkspaceMetaLeadConnection(workspaceId);
  const accessToken = normalizeText(
    connection?.credentials?.page_access_token
    || connection?.credentials?.access_token
    || getMetaGraphAccessToken(),
    ''
  );
  if (!accessToken) {
    throw new Error('No Facebook workspace access token is available for lead hydration.');
  }
  const grantedScopes = Array.isArray(connection?.scopes) && connection.scopes.length
    ? connection.scopes
    : await fetchMetaGrantedScopes(accessToken).catch(() => []);
  if (!grantedScopes.includes('leads_retrieval')) {
    throw new Error('The connected Facebook account is missing the leads_retrieval permission.');
  }

  const graphVersion = normalizeText(process.env.META_GRAPH_VERSION, 'v20.0');
  const endpoint = new URL(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(leadId)}`);
  endpoint.searchParams.set('access_token', accessToken);
  endpoint.searchParams.set('fields', 'id,created_time,field_data,ad_id,ad_name,adgroup_id,adgroup_name,campaign_id,campaign_name,form_id,is_organic');
  const response = await fetch(endpoint);
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `Meta lead lookup failed with ${response.status}.`);
  }
  return payload;
}

function getLeadFieldMap(fieldData = []) {
  const map = new Map();
  normalizeArray(fieldData).forEach((field) => {
    const key = normalizeText(field?.name, '').toLowerCase();
    const value = normalizeArray(field?.values).map((item) => normalizeText(item, '')).filter(Boolean).join(', ');
    if (key && value) {
      map.set(key, value);
    }
  });
  return map;
}

function pickLeadField(fieldMap, names = []) {
  for (const name of names) {
    const value = fieldMap.get(String(name || '').toLowerCase());
    if (value) return value;
  }
  return '';
}

function buildMetaLeadPayload(provider, leadDetails = {}, leadgen = {}) {
  const fieldMap = getLeadFieldMap(leadDetails.field_data || []);
  const fullName = pickLeadField(fieldMap, ['full_name', 'name', 'first_name']);
  const email = pickLeadField(fieldMap, ['email', 'email_address']);
  const phone = pickLeadField(fieldMap, ['phone_number', 'phone', 'mobile_phone']);
  const company = pickLeadField(fieldMap, ['company_name', 'company']);
  const firstName = pickLeadField(fieldMap, ['first_name']);
  const lastName = pickLeadField(fieldMap, ['last_name']);
  const displayName = fullName || [firstName, lastName].filter(Boolean).join(' ').trim() || email || phone || 'Meta lead';
  const leadId = normalizeText(firstNonEmpty(leadDetails.id, leadgen.leadId), '');
  const pageId = normalizeText(firstNonEmpty(leadgen.pageId, leadDetails.page_id), '');
  const formId = normalizeText(firstNonEmpty(leadDetails.form_id, leadgen.formId), '');
  const adName = normalizeText(firstNonEmpty(leadDetails.ad_name, fieldMap.get('ad_name')), '');
  const campaignName = normalizeText(firstNonEmpty(leadDetails.campaign_name, fieldMap.get('campaign_name')), '');
  const createdAt = toISO(firstNonEmpty(leadDetails.created_time, leadgen.createdTime, Date.now()));
  const capturedFieldLines = normalizeArray(leadDetails.field_data).map((field) => {
    const name = normalizeText(field?.name, '');
    const values = normalizeArray(field?.values).map((item) => normalizeText(item, '')).filter(Boolean).join(', ');
    return name && values ? `${name}: ${values}` : '';
  }).filter(Boolean);
  const summary = [adName, campaignName, formId ? `Form ${formId}` : 'Lead ad form submitted', capturedFieldLines.length ? `${capturedFieldLines.length} fields captured` : ''].filter(Boolean).join(' | ');

  return {
    leadId,
    createdAt,
    rawPayload: {
      leadgen,
      leadDetails
    },
    normalized: {
      provider,
      contact: {
        externalId: leadId || `${provider}:lead`,
        name: displayName,
        email,
        phone,
        company,
        leadStage: 'new',
        tags: [provider, 'meta-lead-ads', 'lead-captured']
      },
      conversation: {
        externalId: `${provider}:lead:${leadId || formId || pageId || Date.now()}`,
        subject: adName || campaignName || 'Meta lead ad submission',
        status: 'open',
        priority: 'normal',
        source: provider === 'instagram' ? 'Instagram Lead Ads' : 'Facebook Lead Ads',
        summary
      },
      messages: [{
        externalId: `${provider}:lead-message:${leadId || Date.now()}`,
        direction: 'inbound',
        senderName: displayName,
        body: [
          adName ? `Ad: ${adName}` : '',
          campaignName ? `Campaign: ${campaignName}` : '',
          formId ? `Form: ${formId}` : '',
          ...capturedFieldLines
        ].filter(Boolean).join('\n'),
        createdAt,
        rawPayload: {
          leadgen,
          leadDetails
        }
      }]
    }
  };
}

async function exchangeGoogleRefreshToken(refreshToken = '') {
  const clientId = normalizeText(process.env.GOOGLE_CLIENT_ID, '');
  const clientSecret = normalizeText(process.env.GOOGLE_CLIENT_SECRET, '');
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google OAuth refresh configuration is incomplete.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || 'Google token refresh failed.');
  }
  return payload;
}

async function gmailApiRequest(accessToken, path, { method = 'GET', query = {}, body = null } = {}) {
  const endpoint = new URL(`https://gmail.googleapis.com/gmail/v1/${path.replace(/^\//, '')}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    endpoint.searchParams.set(key, String(value));
  });

  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error_description || `Gmail API ${response.status}`);
  }
  return payload;
}

async function getGmailAccessToken() {
  const refreshToken = normalizeText(process.env.GMAIL_REFRESH_TOKEN, '');
  const accessToken = normalizeText(process.env.GMAIL_ACCESS_TOKEN, '');
  if (!refreshToken && !accessToken) {
    throw new Error('Gmail refresh token is missing.');
  }
  if (refreshToken) {
    const refreshed = await exchangeGoogleRefreshToken(refreshToken);
    return normalizeText(refreshed.access_token, accessToken);
  }
  return accessToken;
}

async function getGmailChannel(workspaceId) {
  const rows = await supabaseRest('channels', {
    query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&provider=eq.gmail&select=*`,
    prefer: 'return=representation'
  }).catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateGmailChannelMetadata(workspaceId, patch = {}) {
  const channel = await getGmailChannel(workspaceId).catch(() => null);
  if (!channel?.id) return null;
  const mergedExternalMetadata = {
    ...(channel.external_metadata || {}),
    ...(patch.external_metadata || {})
  };
  const rows = await supabaseRest('channels', {
    method: 'PATCH',
    query: `id=eq.${encodeURIComponent(channel.id)}`,
    prefer: 'return=representation',
    body: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.connection_state ? { connection_state: patch.connection_state } : {}),
      ...(patch.webhook_state ? { webhook_state: patch.webhook_state } : {}),
      ...(patch.last_sync_at ? { last_sync_at: patch.last_sync_at } : {}),
      ...(patch.last_webhook_at ? { last_webhook_at: patch.last_webhook_at } : {}),
      external_metadata: mergedExternalMetadata
    }
  }).catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

function getGmailHeader(message = {}, name = '') {
  const headers = Array.isArray(message?.payload?.headers) ? message.payload.headers : [];
  const match = headers.find((header) => String(header?.name || '').toLowerCase() === String(name || '').toLowerCase());
  return String(match?.value || '').trim();
}

function decodeGmailBody(part = {}) {
  const data = String(part?.body?.data || '').trim();
  if (!data) return '';
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function extractGmailMessageBody(payload = {}) {
  const direct = decodeGmailBody(payload);
  if (direct) return direct;
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  for (const part of parts) {
    if (String(part?.mimeType || '').toLowerCase() === 'text/plain') {
      const textBody = decodeGmailBody(part);
      if (textBody) return textBody;
    }
  }
  for (const part of parts) {
    const nested = extractGmailMessageBody(part);
    if (nested) return nested;
  }
  return '';
}

function parseMailboxIdentity(rawValue = '') {
  const value = normalizeText(rawValue, '');
  if (!value) return { name: '', email: '' };
  const match = value.match(/^(.*?)(?:<([^>]+)>)$/);
  if (!match) {
    return { name: value.replace(/"/g, ''), email: value.includes('@') ? value.toLowerCase() : '' };
  }
  return {
    name: normalizeText(match[1].replace(/"/g, ''), match[2]),
    email: normalizeText(match[2], '').toLowerCase()
  };
}

function normalizeGmailEnvelopeFromMessage(workspaceId, accountEmail, gmailMessage = {}) {
  const fromIdentity = parseMailboxIdentity(getGmailHeader(gmailMessage, 'From'));
  const subject = normalizeText(getGmailHeader(gmailMessage, 'Subject'), 'Incoming email');
  const body = normalizeText(extractGmailMessageBody(gmailMessage.payload || {}), gmailMessage.snippet || '');
  const sentAt = normalizeText(gmailMessage.internalDate, '') ? new Date(Number(gmailMessage.internalDate)).toISOString() : new Date().toISOString();

  return {
    provider: 'gmail',
    workspaceId,
    accountId: accountEmail,
    payload: {
      threadId: normalizeText(gmailMessage.threadId, `gmail:${gmailMessage.id || 'thread'}`),
      messageId: normalizeText(gmailMessage.id, ''),
      historyId: normalizeText(gmailMessage.historyId, ''),
      subject,
      snippet: normalizeText(gmailMessage.snippet, body),
      from: {
        id: fromIdentity.email || normalizeText(gmailMessage.id, ''),
        name: fromIdentity.name || fromIdentity.email || 'Unknown contact',
        email: fromIdentity.email || ''
      },
      messages: [{
        id: normalizeText(gmailMessage.id, `${gmailMessage.threadId || 'gmail-thread'}:message`),
        direction: 'inbound',
        senderName: fromIdentity.name || fromIdentity.email || 'Unknown contact',
        body,
        createdAt: sentAt,
        rawPayload: gmailMessage
      }]
    }
  };
}

async function captureLeadFromResult(workspaceId, provider, result = {}) {
  const messageRow = Array.isArray(result.messages) ? result.messages[0] : null;
  const conversationRow = result.conversation || null;
  const contactRow = result.contact || null;
  if (!messageRow || String(messageRow.direction || '').toLowerCase() !== 'inbound') {
    return null;
  }

  const leadSourceText = [
    messageRow.body,
    messageRow.sender_name,
    contactRow?.name,
    contactRow?.email,
    contactRow?.phone,
    conversationRow?.summary
  ].filter(Boolean).join(' ');

  const emailMatches = leadSourceText.match(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi) || [];
  const phoneMatches = leadSourceText.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  const emails = Array.from(new Set(emailMatches.map((value) => String(value).trim().toLowerCase())));
  const phones = Array.from(new Set(phoneMatches.map((value) => String(value).replace(/[^\d+]/g, ''))));
  if (!emails.length && !phones.length) {
    return null;
  }

  const externalLeadId = normalizeText(
    messageRow.external_message_id || messageRow.id,
    `${provider}:${contactRow?.external_contact_id || contactRow?.id || 'lead'}`
  );

  const existingRows = await supabaseRest('leads', {
    query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&external_lead_id=eq.${encodeURIComponent(externalLeadId)}&select=*`,
    prefer: 'return=representation'
  }).catch(() => []);
  const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;

  const payload = {
    workspace_id: workspaceId,
    source_provider: provider,
    external_lead_id: externalLeadId,
    contact_id: contactRow?.id || null,
    conversation_id: conversationRow?.id || null,
    name: contactRow?.name || messageRow.sender_name || emails[0] || phones[0] || 'Captured lead',
    email: emails[0] || contactRow?.email || null,
    phone: phones[0] || contactRow?.phone_e164 || contactRow?.phone || null,
    company: contactRow?.company || '',
    lead_stage: contactRow?.lead_stage || 'new',
    lead_score: 0,
    capture_reason: normalizeText(messageRow.body, 'Lead identified from inbound message'),
    metadata: {
      provider,
      emails,
      phones,
      source_message_id: messageRow.id || messageRow.external_message_id || null
    },
    updated_at: new Date().toISOString()
  };

  const savedRows = await supabaseRest('leads', {
    method: 'POST',
    query: 'on_conflict=workspace_id,source_provider,external_lead_id',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: [{ id: existing?.id, ...payload }]
  });
  const saved = Array.isArray(savedRows) ? savedRows[0] : savedRows;

  await supabaseRest('activity_events', {
    method: 'POST',
    prefer: 'return=representation',
    body: [{
      workspace_id: workspaceId,
      entity_type: 'lead',
      entity_id: saved?.id || null,
      event_type: 'lead_captured',
      payload: {
        provider,
        source_message_id: messageRow.id || messageRow.external_message_id || null,
        conversation_id: conversationRow?.id || null,
        emails,
        phones
      }
    }]
  }).catch(() => null);

  return {
    saved,
    isNewLead: !existing
  };
}

function buildLeadNotificationBody({ workspaceName = '', lead = {}, messageBody = '' } = {}) {
  return [
    `New Lead Captured for ${workspaceName || 'AuraFlow Workspace'}!`,
    '',
    `Name: ${lead.name || 'Unknown lead'}`,
    lead.email ? `Email: ${lead.email}` : '',
    lead.phone_e164 || lead.phone ? `Phone: ${lead.phone_e164 || lead.phone}` : '',
    lead.company ? `Company: ${lead.company}` : '',
    lead.capture_reason ? `Why captured: ${lead.capture_reason}` : '',
    messageBody ? `Message: ${normalizeText(messageBody).slice(0, 260)}` : ''
  ].filter(Boolean).join('\n');
}

async function resolveWorkspaceName(workspaceId = '') {
  if (!workspaceId) return '';
  const rows = await supabaseRest('workspaces', {
    query: `id=eq.${encodeURIComponent(workspaceId)}&select=*`,
    prefer: 'return=representation'
  }).catch(() => []);
  const workspace = Array.isArray(rows) ? rows[0] : rows;
  return normalizeText(workspace?.name, '');
}

async function notifyAdminOfLead(workspaceId, lead, messageBody = '') {
  if (!workspaceId || !lead) return null;
  const workspaceName = await resolveWorkspaceName(workspaceId).catch(() => '');
  const notificationEmail = normalizeText(
    process.env.LEAD_NOTIFICATION_EMAIL
    || process.env.OWNER_NOTIFICATION_EMAIL,
    ''
  );
  const whatsappTarget = normalizeText(
    process.env.ADMIN_WHATSAPP_ALERT_TO
    || process.env.WHATSAPP_LEAD_ALERT_TO,
    ''
  );

  const outcomes = [];

  if (notificationEmail) {
    const gmailConnection = await getWorkspaceConnection(workspaceId, 'gmail').catch(() => null);
    try {
      const result = await sendProviderOutboundMessage({
        workspaceId,
        connection: gmailConnection || {
          email: notificationEmail,
          credentials: {
            access_token: process.env.GMAIL_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN || '',
            refresh_token: process.env.GMAIL_REFRESH_TOKEN || ''
          },
          connection_metadata: {
            email: process.env.GMAIL_FROM_EMAIL || process.env.GMAIL_INBOX_ADDRESS || notificationEmail
          }
        },
        conversation: {
          subject: `New Lead Captured for ${workspaceName || 'AuraFlow Workspace'}!`,
          recipient_email: notificationEmail,
          source_provider: 'gmail'
        },
        message: {
          body: buildLeadNotificationBody({ workspaceName, lead, messageBody }),
          recipient_email: notificationEmail
        }
      });
      outcomes.push({ channel: 'email', ok: true, transport: result?.providerTransport || result?.transport || '' });
    } catch (error) {
      outcomes.push({ channel: 'email', ok: false, error: error?.message || 'Lead alert email failed.' });
    }
  }

  if (whatsappTarget) {
    const whatsappConnection = await getWorkspaceConnection(workspaceId, 'whatsapp').catch(() => null);
    try {
      const templateSidConfigured = Boolean(process.env.TWILIO_CONTENT_SID_LEAD_ALERTS || process.env.TWILIO_CONTENT_SID_LEAD_ALERT);
      const result = templateSidConfigured
        ? await sendAuraFlowTemplate({
          contactId: String(lead?.contact_id || ''),
          to: whatsappTarget,
          channel: 'whatsapp',
          templateName: 'lead alerts',
          variables: {
            workspaceName: workspaceName || 'AuraFlow Workspace',
            leadName: lead?.name || 'New lead',
            leadEmail: lead?.email || '',
            leadPhone: lead?.phone_e164 || lead?.phone || '',
            leadCompany: lead?.company || '',
            leadSummary: normalizeLeadText(messageBody).slice(0, 120)
          },
          connection: whatsappConnection || {}
        })
        : await sendProviderOutboundMessage({
          workspaceId,
          connection: whatsappConnection || {},
          conversation: {
            subject: `New lead for ${workspaceName || 'AuraFlow Workspace'}`,
            recipient_phone: whatsappTarget,
            source_provider: 'whatsapp'
          },
          message: {
            body: buildLeadNotificationBody({ workspaceName, lead, messageBody }),
            recipient_phone: whatsappTarget
          }
        });
      outcomes.push({ channel: 'whatsapp', ok: true, transport: result?.providerTransport || result?.transport || '' });
    } catch (error) {
      outcomes.push({ channel: 'whatsapp', ok: false, error: error?.message || 'Lead alert WhatsApp send failed.' });
    }
  }

  return outcomes;
}

async function updateMessageDeliveryState(workspaceId, providerMessageId, patch = {}) {
  const key = normalizeText(providerMessageId, '');
  if (!workspaceId || !key) return null;

  const nextPatch = {
    ...patch,
    updated_at: new Date().toISOString()
  };

  try {
    const rows = await supabaseRest('messages', {
      method: 'PATCH',
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&external_message_id=eq.${encodeURIComponent(key)}`,
      body: nextPatch,
      prefer: 'return=representation'
    });
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (error) {
    if (!Object.prototype.hasOwnProperty.call(nextPatch, 'message_status') || !isUnknownColumnError(error, 'message_status')) {
      throw error;
    }
    const fallbackPatch = { ...nextPatch };
    delete fallbackPatch.message_status;
    const rows = await supabaseRest('messages', {
      method: 'PATCH',
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&external_message_id=eq.${encodeURIComponent(key)}`,
      body: fallbackPatch,
      prefer: 'return=representation'
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }
}

async function applyDeliveryReceipts(workspaceId, normalized = {}) {
  const receipts = normalizeArray(normalized?.deliveryReceipts);
  if (!workspaceId || !receipts.length) return [];

  const updates = [];
  for (const receipt of receipts) {
    const state = normalizeText(receipt.status || receipt.state || receipt.delivery_state, 'sent').toLowerCase();
    const nextReceipt = {
      ...receipt,
      status: state,
      recorded_at: receipt.recorded_at || receipt.timestamp || new Date().toISOString()
    };
    const message = await updateMessageDeliveryState(workspaceId, receipt.externalMessageId, {
      delivery_state: state,
      message_status: state,
      delivery_receipts: [nextReceipt]
    }).catch((error) => {
      console.warn('Failed to apply Twilio delivery receipt.', error);
      return null;
    });
    if (message) updates.push(message);
  }

  return updates;
}

async function maybeAutoReplyToMessenger(workspaceId, normalized, result) {
  const providerKey = normalizeText(normalized?.provider, '').toLowerCase();
  const inboundMessage = Array.isArray(result?.messages) ? result.messages[0] : null;
  if (providerKey !== 'messenger' || !inboundMessage || normalizeText(inboundMessage.direction, 'inbound').toLowerCase() !== 'inbound') {
    return null;
  }

  const connection = await getWorkspaceConnection(workspaceId, 'messenger');
  if (!connection) {
    return { ok: false, skipped: true, reason: 'Messenger workspace connection is missing.' };
  }

  const aiResponse = await createAiAssistResponse({
    workspaceName: 'AuraFlow Workspace',
    mode: 'reply',
    conversation: {
      source_provider: 'messenger',
      source: 'Messenger',
      subject: result?.conversation?.subject || 'Incoming Messenger thread'
    },
    messages: (result?.messages || []).map((message) => ({
      direction: message.direction,
      body: message.body,
      created_at: message.created_at || message.createdAt,
      sender_name: message.sender_name || message.senderName
    })),
    workspaceSnapshot: {}
  }, process.env);

  if (Number(aiResponse?.statusCode || 500) >= 400) {
    return { ok: false, skipped: true, reason: 'AI reply generation failed.' };
  }

  const parsed = JSON.parse(String(aiResponse.body || '{}'));
  const replyBody = normalizeText(parsed.reply || parsed.output || parsed.body, '');
  if (!replyBody) {
    return { ok: false, skipped: true, reason: 'AI reply body was empty.' };
  }

  const recipientId = normalizeText(
    result?.conversation?.recipient_id
    || result?.conversation?.recipientId
    || result?.contact?.external_contact_id
    || result?.identity?.external_identity_id,
    ''
  );
  if (!recipientId) {
    return { ok: false, skipped: true, reason: 'Messenger recipient id is missing.' };
  }

  const sendResult = await sendProviderOutboundMessage({
    workspaceId,
    connection,
    conversation: {
      id: result?.conversation?.id || '',
      workspace_id: workspaceId,
      source_provider: 'messenger',
      source: 'Messenger',
      subject: result?.conversation?.subject || 'Incoming Messenger thread',
      recipient_id: recipientId
    },
    message: {
      workspace_id: workspaceId,
      conversation_id: result?.conversation?.id || '',
      source_provider: 'messenger',
      direction: 'outbound',
      sender_name: 'AuraFlow',
      body: replyBody,
      recipient_id: recipientId
    },
    mode: 'sent'
  });

  return {
    ok: true,
    reply: replyBody,
    providerMessageId: sendResult?.providerMessageId || '',
    transport: sendResult?.providerTransport || sendResult?.transport || ''
  };
}

async function ingestGmailPubsubNotification(workspaceId, body = {}) {
  const envelope = body?.message?.data ? decodePubsubMessageData(body.message.data) : body;
  const accountEmail = normalizeText(
    envelope.emailAddress
    || envelope.email
    || process.env.GMAIL_INBOX_ADDRESS,
    ''
  ).toLowerCase();
  const historyId = normalizeText(envelope.historyId || envelope.history_id, '');
  if (!workspaceId) {
    throw new Error('workspace_id is required for Gmail Pub/Sub ingestion.');
  }

  const accessToken = await getGmailAccessToken();
  const channel = await getGmailChannel(workspaceId).catch(() => null);
  const priorHistoryId = normalizeText(channel?.external_metadata?.gmail_watch?.history_id, '');

  let messageIds = [];
  if (priorHistoryId && historyId && priorHistoryId !== historyId) {
    const historyResponse = await gmailApiRequest(accessToken, 'users/me/history', {
      query: {
        startHistoryId: priorHistoryId,
        historyTypes: 'messageAdded'
      }
    }).catch(() => ({ history: [] }));

    messageIds = normalizeArray(historyResponse.history).flatMap((entry) => Array.isArray(entry.messagesAdded)
      ? entry.messagesAdded.map((item) => item?.message?.id).filter(Boolean)
      : []);
  }

  if (!messageIds.length) {
    const messagesResponse = await gmailApiRequest(accessToken, 'users/me/messages', {
      query: {
        labelIds: 'INBOX',
        maxResults: 5
      }
    });
    messageIds = normalizeArray(messagesResponse.messages).map((item) => item.id).filter(Boolean);
  }

  const ingested = [];
  for (const messageId of messageIds.slice(0, 10)) {
    const gmailMessage = await gmailApiRequest(accessToken, `users/me/messages/${encodeURIComponent(messageId)}`, {
      query: { format: 'full' }
    });
    const normalized = normalizeWebhookPayload(normalizeGmailEnvelopeFromMessage(workspaceId, accountEmail, gmailMessage));
    normalized.verification = {
      ...(normalized.verification || {}),
      provider: 'gmail',
      verified: true,
      signed: true,
      authHeaderPresent: true,
      note: 'Ingested from Gmail Pub/Sub notification.'
    };
    const result = await ingestProviderPayload(normalized);
    const leadCapture = await captureLeadFromResult(workspaceId, 'gmail', result).catch(() => null);
    if (leadCapture?.isNewLead) {
      await notifyAdminOfLead(workspaceId, leadCapture.saved, result?.messages?.[0]?.body || '').catch(() => null);
    }
    ingested.push({
      messageId,
      conversationId: result?.conversation?.id || null,
      leadId: leadCapture?.saved?.id || null
    });
  }

  const eventTime = new Date().toISOString();
  const gmailWatch = {
    ...(channel?.external_metadata?.gmail_watch || {}),
    history_id: historyId || priorHistoryId,
    last_notification_at: eventTime,
    webhook_verified_at: eventTime
  };

  await updateGmailChannelMetadata(workspaceId, {
    status: 'configured',
    connection_state: 'connected',
    webhook_state: 'verified',
    last_sync_at: eventTime,
    last_webhook_at: eventTime,
    external_metadata: {
      ...(channel?.external_metadata || {}),
      gmail_watch: gmailWatch,
      oauth_provider: 'google',
      connected_via: 'workspace_oauth',
      last_provider_event: 'gmail.pubsub.push',
      last_webhook_verification: 'verified'
    }
  }).catch(() => null);

  return {
    ok: true,
    workspaceId,
    accountEmail,
    historyId: historyId || priorHistoryId,
    ingested: ingested.length,
    messages: ingested
  };
}

export const handler = async (event) => {
  const provider = resolveProvider(event);
  if (!provider) {
    return json(400, { error: 'provider is required' });
  }

  if (event.httpMethod === 'GET') {
    const query = event.queryStringParameters || {};
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || '';
    const challenge = query['hub.challenge'] || query.challenge || '';
    const mode = query['hub.mode'] || query.mode || '';
    const token = query['hub.verify_token'] || query.verify_token || '';

    if (['whatsapp', 'instagram', 'messenger', 'facebook'].includes(provider)) {
      if (!verifyToken || token !== verifyToken) {
        return json(403, { error: 'Invalid webhook verification token' });
      }
      return text(200, challenge || mode || 'verified');
    }

    return json(200, { ok: true, provider });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body = {};
  let rawText = '';
  try {
    const parsed = parseEventBody(event);
    body = parsed.body;
    rawText = parsed.rawText;
  } catch (error) {
    return json(400, { error: error?.message || 'Invalid body' });
  }

  const verification = ['whatsapp', 'instagram', 'messenger', 'facebook'].includes(provider)
    && (body?.ConversationSid || body?.EventType || body?.['MessagingBinding.Address'] || event.headers?.['x-twilio-signature'] || event.headers?.['X-Twilio-Signature'])
    ? verifyTwilioSignature(String(event.rawUrl || event.path || ''), body, event.headers || {})
    : verifyInbound(provider, body, rawText, event.headers || {}, event);
  if (!verification.verified) {
    return json(401, { error: verification.reason || 'Invalid webhook signature' });
  }

  const workspaceId = resolveWorkspaceId(event, body);

  try {
    if (provider === 'gmail' && body?.message?.data) {
      const result = await ingestGmailPubsubNotification(workspaceId, body);
      return json(200, result);
    }

    const leadgenChange = ['facebook', 'instagram'].includes(provider) ? extractMetaLeadgenChange(body) : null;
    if (leadgenChange) {
      if (!workspaceId) {
        return json(400, { error: 'workspace_id is required for Meta lead ingestion.', provider });
      }

      const leadDetails = await fetchMetaLeadDetails(workspaceId, leadgenChange.leadId);
      const leadPayload = buildMetaLeadPayload(provider, leadDetails, leadgenChange);
      const normalizedLead = normalizeWebhookPayload({
        provider,
        workspaceId,
        headers: event.headers || {},
        eventType: `meta.${provider}.lead.received`,
        verification: {
          provider,
          transport: 'meta-webhook',
          verified: verification.verified,
          signed: verification.verified,
          signatureVerified: verification.verified,
          signatureReason: verification.reason
        },
        ...leadPayload.normalized
      });

      const result = await ingestProviderPayload(normalizedLead);
      const leadCapture = await captureLeadFromResult(workspaceId, provider, result).catch(() => null);
      if (leadCapture?.isNewLead) {
        await notifyAdminOfLead(workspaceId, leadCapture.saved, normalizedLead?.messages?.[0]?.body || '').catch(() => null);
      }
      return json(200, {
        ok: true,
        provider,
        workspaceId,
        leadId: leadgenChange.leadId,
        result,
        lead: leadCapture?.saved || null
      });
    }

    const normalized = normalizeWebhookPayload({
      ...body,
      provider,
      workspaceId,
      headers: event.headers || {}
    });

    normalized.verification = {
      ...(normalized.verification || {}),
      signatureVerified: verification.verified,
      signatureReason: verification.reason
    };

    const deliveryUpdates = await applyDeliveryReceipts(workspaceId, normalized);
    const result = await ingestProviderPayload(normalized);
    const leadCapture = await captureLeadFromResult(workspaceId, provider, result).catch(() => null);
    if (leadCapture?.isNewLead) {
      await notifyAdminOfLead(workspaceId, leadCapture.saved, result?.messages?.[0]?.body || '').catch(() => null);
    }
    const aiReply = await maybeAutoReplyToMessenger(workspaceId, normalized, result).catch((error) => ({
      ok: false,
      skipped: true,
      reason: error?.message || 'AI auto-reply failed.'
    }));
    return json(200, {
      ok: true,
      provider,
      workspaceId,
      result,
      deliveryUpdates,
      lead: leadCapture?.saved || null,
      aiReply
    });
  } catch (error) {
    return json(500, {
      error: error?.message || 'Webhook ingestion failed',
      provider,
      workspaceId
    });
  }
};
