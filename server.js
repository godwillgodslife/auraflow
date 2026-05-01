import http from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { enrichExistingContactPhoneHealth, getIngestContract, hasSupabaseAdminConfig, ingestProviderPayload, validateIngestSecret } from './src/integrations/supabase-admin.js';
import { normalizeWebhookPayload } from './src/integrations/provider-webhooks.js';
import { sendProviderOutboundMessage } from './src/integrations/provider-outbound.js';
import { buildAiWorkspaceContext } from './src/integrations/ai-context.js';
import { createAiAssistResponse } from './src/server/ai-assist.js';
import {
  analyzeVoiceAudio,
  analyzeVoiceText,
  buildVoiceNoteFromAnalysis,
  createVoiceAgentTurnResponse,
  hasDeepgramConfig
} from './src/server/deepgram-voice.js';
import { renderTwilioVoiceTwiML } from './src/server/twilio-voice-live.js';
import { splitKnowledgeTextIntoChunks } from './scripts/chunk-knowledge.mjs';
import { attachWorkspaceStream, publishWorkspaceEvent } from './src/server/realtime-bus.js';
import { enqueueWorkspaceJob, listWorkspaceJobWorkspaces, listWorkspaceJobs, scheduleWorkspaceJobRetry, updateWorkspaceJob } from './src/server/job-queue.js';
import { buildInboundWorkflowPlan } from './src/server/workflow-engine.js';
import { getWebhookReplay, getWebhookReplayDiagnostics, listWebhookReplays, registerWebhookReplay } from './src/server/replay-store.js';
import { buildNangoTriggerBody, buildNangoWebhookEnvelope, buildReliabilityLogEntry, extractNangoRecords } from './src/server/provider-sync.js';
import { decryptConnectionSecret, encryptConnectionSecret, signConnectionState, verifyConnectionState } from './src/server/connection-crypto.js';
import {
  createDemoActivityEvent,
  createDemoConnectSession,
  createDemoCollectionRecord,
  createDemoWorkspace,
  createDemoWorkspaceMember,
  ingestDemoProviderPayload,
  getDemoProviderReadiness,
  listDemoWorkspaceMembers,
  listDemoCollection,
  listDemoWorkspaces,
  loadDemoWorkspaceSnapshot,
  findDemoConversation,
  patchDemoCollectionRecord,
  updateDemoMessageByExternalId,
  replyToDemoConversation
} from './src/server/demo-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = __dirname;
const port = Number(process.env.PORT || 3000);
const env = {
  ...(await loadEnvFile(path.join(root, '.env.local'))),
  ...(await loadEnvFile(path.join(root, 'supabase-secrets.env')))
};

for (const [key, value] of Object.entries(env)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function loadEnvFile(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return parseEnv(text);
  } catch {
    return {};
  }
}

function runtimeConfigSource() {
  const botpressReplyWebhookConfigured = Boolean(env.BOTPRESS_WEBHOOK_URL || process.env.BOTPRESS_WEBHOOK_URL || env.BOTPRESS_REPLY_WEBHOOK_URL || process.env.BOTPRESS_REPLY_WEBHOOK_URL);
  const botpressTokenPushConfigured = Boolean(env.BOTPRESS_TOKEN_PUSH_URL || process.env.BOTPRESS_TOKEN_PUSH_URL || env.BOTPRESS_INSTAGRAM_WEBHOOK_URL || process.env.BOTPRESS_INSTAGRAM_WEBHOOK_URL);
  return `window.__AURAFLOW_CONFIG__ = {
    supabaseUrl: ${JSON.stringify(env.SUPABASE_URL || process.env.SUPABASE_URL || '')},
    supabaseAnonKey: ${JSON.stringify(env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '')},
    supabaseSchema: ${JSON.stringify(env.SUPABASE_SCHEMA || process.env.SUPABASE_SCHEMA || 'public')},
    supabaseTables: {},
    nangoBaseUrl: ${JSON.stringify(env.NANGO_BASE_URL || process.env.NANGO_BASE_URL || '')},
    nangoConnectUrl: ${JSON.stringify(env.NANGO_CONNECT_URL || process.env.NANGO_CONNECT_URL || '')},
    nangoPublicKey: ${JSON.stringify(env.NANGO_PUBLIC_KEY || process.env.NANGO_PUBLIC_KEY || '')},
    twilioVoiceSdkUrl: ${JSON.stringify(env.TWILIO_VOICE_SDK_URL || process.env.TWILIO_VOICE_SDK_URL || '')},
    auraflowVoiceBaseUrl: ${JSON.stringify(env.AURAFLOW_PUBLIC_BASE_URL || process.env.AURAFLOW_PUBLIC_BASE_URL || env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || env.URL || process.env.URL || '')},
    auraflowMediaStreamWssUrl: ${JSON.stringify(env.TWILIO_MEDIA_STREAM_WSS_URL || process.env.TWILIO_MEDIA_STREAM_WSS_URL || env.AURAFLOW_MEDIA_STREAM_WSS_URL || process.env.AURAFLOW_MEDIA_STREAM_WSS_URL || '')},
    botpressReplyWebhookConfigured: ${JSON.stringify(botpressReplyWebhookConfigured)},
    botpressTokenPushConfigured: ${JSON.stringify(botpressTokenPushConfigured)},
    instagramBotpressReady: ${JSON.stringify(botpressReplyWebhookConfigured || botpressTokenPushConfigured)}
  };
`;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function readJsonBodyWithRaw(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return { body: {}, rawText: '' };
  const rawText = Buffer.concat(chunks).toString('utf8');
  if (!rawText) return { body: {}, rawText: '' };
  try {
    return { body: JSON.parse(rawText), rawText };
  } catch {
    return { body: {}, rawText };
  }
}

function parseFormEncodedBody(text = '') {
  const params = new URLSearchParams(String(text || ''));
  const body = {};
  for (const [key, value] of params.entries()) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      body[key] = Array.isArray(body[key]) ? [...body[key], value] : [body[key], value];
      continue;
    }
    body[key] = value;
  }
  return body;
}

function toBase64Url(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input || ''), 'utf8');
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createSignedJwt(header = {}, payload = {}, secret = '') {
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${toBase64Url(signature)}`;
}

function getTwilioVoiceConfig() {
  return {
    accountSid: String(process.env.TWILIO_ACCOUNT_SID || '').trim(),
    apiKeySid: String(process.env.TWILIO_API_KEY || process.env.TWILIO_API_KEY_SID || '').trim(),
    apiKeySecret: String(process.env.TWILIO_API_SECRET || '').trim(),
    appSid: String(process.env.TWILIO_VOICE_APP_SID || process.env.TWILIO_TWIML_APP_SID || '').trim(),
    callerId: String(process.env.TWILIO_VOICE_CALLER_ID || process.env.TWILIO_SMS_FROM_NUMBER || process.env.TWILIO_WHATSAPP_NUMBER || '').trim(),
    tokenTtlSeconds: Math.max(300, Number(process.env.TWILIO_VOICE_TOKEN_TTL || 3600))
  };
}

function buildSoftphoneIdentity({ workspaceId = '', user = {}, role = '' } = {}) {
  const email = String(user?.email || '').trim().toLowerCase();
  const local = email.includes('@') ? email.split('@')[0] : email;
  const workspaceToken = String(workspaceId || 'workspace').trim().replace(/[^a-z0-9_-]+/gi, '-').slice(0, 32) || 'workspace';
  const userToken = String(local || role || 'agent').trim().replace(/[^a-z0-9_-]+/gi, '-').slice(0, 32) || 'agent';
  return `auraflow-${workspaceToken}-${userToken}`.slice(0, 120);
}

function createTwilioVoiceAccessToken({ workspaceId = '', user = {}, role = '' } = {}) {
  const config = getTwilioVoiceConfig();
  if (!config.accountSid || !config.apiKeySid || !config.apiKeySecret || !config.appSid) {
    throw new Error('Twilio Voice softphone config is incomplete. Add account SID, API key SID, API secret, and Voice App SID.');
  }

  const identity = buildSoftphoneIdentity({ workspaceId, user, role });
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + config.tokenTtlSeconds;
  const payload = {
    jti: `${config.apiKeySid}-${issuedAt}`,
    iss: config.apiKeySid,
    sub: config.accountSid,
    iat: issuedAt,
    exp: expiresAt,
    grants: {
      identity,
      voice: {
        incoming: { allow: true },
        outgoing: {
          application_sid: config.appSid,
          params: {
            workspaceId,
            identity
          }
        }
      }
    }
  };

  const token = createSignedJwt(
    { cty: 'twilio-fpa;v=1', typ: 'JWT', alg: 'HS256' },
    payload,
    config.apiKeySecret
  );

  return {
    token,
    identity,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    appSid: config.appSid,
    callerId: config.callerId
  };
}

function getPublicBaseUrl() {
  return String(
    process.env.AURAFLOW_PUBLIC_BASE_URL
    || process.env.PUBLIC_BASE_URL
    || process.env.URL
    || `http://localhost:${port}`
  ).trim().replace(/\/$/, '');
}

function getMediaStreamRelayUrl(workspaceId = '', voiceSessionId = '') {
  const explicit = String(
    process.env.TWILIO_MEDIA_STREAM_WSS_URL
    || process.env.AURAFLOW_MEDIA_STREAM_WSS_URL
    || ''
  ).trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  const baseUrl = getPublicBaseUrl();
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(baseUrl)) {
    return `${baseUrl.replace(/^http/i, 'ws').replace(/\/$/, '')}/twilio-media-stream`;
  }
  return '';
}

function buildDeepgramStreamingUrl() {
  const language = String(process.env.DEEPGRAM_LANGUAGE || 'en').trim() || 'en';
  const model = String(process.env.DEEPGRAM_MODEL || 'nova-2-phonecall').trim() || 'nova-2-phonecall';
  const params = new URLSearchParams({
    encoding: 'mulaw',
    sample_rate: '8000',
    channels: '1',
    interim_results: 'true',
    punctuate: 'true',
    smart_format: 'true',
    model,
    language
  });
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

function providerToChannel(provider = '') {
  const normalized = String(provider || '').trim().toLowerCase();
  if (normalized === 'gmail' || normalized === 'email') return 'email';
  if (normalized === 'facebook') return 'messenger';
  if (['whatsapp', 'sms', 'voice', 'instagram', 'messenger'].includes(normalized)) return normalized;
  return '';
}

function normalizeLeadText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function extractLeadSignalsFromText(text = '') {
  const normalized = normalizeLeadText(text);
  const emailMatches = normalized.match(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi) || [];
  const phoneMatches = normalized.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  const emails = Array.from(new Set(emailMatches.map((value) => String(value).trim().toLowerCase())));
  const phones = Array.from(new Set(phoneMatches.map((value) => normalizePhone(value)).filter(Boolean)));
  return {
    emails,
    phones,
    hasLeadSignal: Boolean(emails.length || phones.length),
    excerpt: normalized.slice(0, 240)
  };
}

function buildLeadExternalId({ email = '', phone = '', fallback = '' } = {}) {
  if (email) return `email:${String(email).trim().toLowerCase()}`;
  if (phone) return `phone:${normalizePhone(phone)}`;
  return fallback ? `ref:${String(fallback).trim()}` : '';
}

function buildLeadNotificationBody({ workspaceName = '', lead = {}, messageBody = '' } = {}) {
  const lines = [
    `New Lead Captured for ${workspaceName || 'AuraFlow Workspace'}!`,
    '',
    `Name: ${lead.name || 'Unknown lead'}`,
    lead.email ? `Email: ${lead.email}` : '',
    lead.phone_e164 || lead.phone ? `Phone: ${lead.phone_e164 || lead.phone}` : '',
    lead.company ? `Company: ${lead.company}` : '',
    lead.capture_reason ? `Why captured: ${lead.capture_reason}` : '',
    messageBody ? `Message: ${normalizeLeadText(messageBody).slice(0, 260)}` : ''
  ].filter(Boolean);
  return lines.join('\n');
}

async function resolveWorkspaceName(workspaceId = '') {
  if (!workspaceId) return '';
  const rows = await supabaseRest('workspaces', {
    query: `id=eq.${encodeURIComponent(workspaceId)}&select=*`,
    prefer: 'return=representation'
  }).catch(() => []);
  const workspace = Array.isArray(rows) ? rows[0] : rows;
  return String(workspace?.name || '').trim();
}

async function captureLeadFromEnvelope(workspaceId, provider, contactRow = null, conversationRow = null, messageRow = null, workspaceName = '') {
  if (!workspaceId || !messageRow) return null;
  if (String(messageRow.direction || '').trim().toLowerCase() !== 'inbound') return null;

  const leadSourceText = [
    messageRow.body,
    messageRow.sender_name,
    contactRow?.email,
    contactRow?.phone,
    contactRow?.phone_e164,
    conversationRow?.subject,
    conversationRow?.summary
  ].filter(Boolean).join(' ');
  const signals = extractLeadSignalsFromText(leadSourceText);
  if (!signals.hasLeadSignal) {
    return null;
  }
  const primaryEmail = signals.emails[0] || String(contactRow?.email || '').trim().toLowerCase();
  const primaryPhone = signals.phones[0] || normalizePhone(contactRow?.phone_e164 || contactRow?.phone || '');

  const externalLeadId = buildLeadExternalId({
    email: primaryEmail,
    phone: primaryPhone,
    fallback: messageRow.external_message_id || messageRow.id || `${workspaceId}-${Date.now()}`
  });
  if (!externalLeadId) return null;

  const existingRows = await supabaseRest('leads', {
    query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&external_lead_id=eq.${encodeURIComponent(externalLeadId)}&select=*`,
    prefer: 'return=representation'
  }).catch(() => []);
  const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;

  const leadRow = {
    workspace_id: workspaceId,
    source_provider: String(provider || contactRow?.source_provider || 'manual').toLowerCase(),
    external_lead_id: externalLeadId,
    contact_id: contactRow?.id || null,
    conversation_id: conversationRow?.id || null,
    name: contactRow?.name || messageRow.sender_name || 'Lead',
    email: primaryEmail || contactRow?.email || '',
    phone: primaryPhone || contactRow?.phone || '',
    phone_e164: primaryPhone || contactRow?.phone_e164 || null,
    company: contactRow?.company || '',
    lead_stage: contactRow?.lead_stage || contactRow?.leadStage || 'new',
    lead_score: contactRow?.metadata?.lead_score || 0,
    capture_reason: normalizeLeadText(messageRow.body || signals.excerpt || 'Lead identified from inbound message'),
    captured_from: String(provider || messageRow.source_provider || 'manual').toLowerCase(),
    tags: Array.from(new Set([
      ...(Array.isArray(contactRow?.tags) ? contactRow.tags : []),
      'lead-captured',
      String(provider || messageRow.source_provider || 'manual').toLowerCase()
    ])).filter(Boolean),
    metadata: {
      signal: signals,
      conversation_subject: conversationRow?.subject || '',
      source_message_id: messageRow.id || messageRow.external_message_id || '',
      source_message_body: messageRow.body || ''
    }
  };

  const savedRows = await supabaseRest('leads', {
    method: 'POST',
    query: 'on_conflict=workspace_id,source_provider,external_lead_id',
    body: [leadRow],
    prefer: 'resolution=merge-duplicates,return=representation'
  }).catch(() => []);
  const saved = Array.isArray(savedRows) ? savedRows[0] : savedRows || leadRow;

  await supabaseRest('activity_events', {
    method: 'POST',
    body: [{
      workspace_id: workspaceId,
      entity_type: 'lead',
      entity_id: saved.id || null,
      event_type: 'lead_captured',
      payload: {
        provider,
        source_message_id: messageRow.id || messageRow.external_message_id || null,
        conversation_id: conversationRow?.id || null,
        signals,
        new_lead: !existing,
        lead: saved
      }
    }],
    prefer: 'return=representation'
  }).catch(() => null);

  if (!existing) {
    try {
      const workspaceConnection = await getWorkspaceConnection(workspaceId, 'gmail', { includeCredentials: true }).catch(() => null);
      const notificationEmail = String(
        workspaceConnection?.connection_metadata?.email
        || workspaceConnection?.email
        || process.env.LEAD_NOTIFICATION_EMAIL
        || process.env.OWNER_NOTIFICATION_EMAIL
        || process.env.GMAIL_INBOX_ADDRESS
        || ''
      ).trim();
      if (notificationEmail) {
        await sendProviderOutboundMessage({
          workspaceId,
          provider: 'gmail',
          connection: workspaceConnection || {
            email: notificationEmail,
            credentials: {
              access_token: process.env.GMAIL_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN || '',
              refresh_token: process.env.GMAIL_REFRESH_TOKEN || ''
            },
            connection_metadata: {
              email: notificationEmail
            }
          },
          conversation: {
            subject: `New Lead Captured for ${workspaceName || 'AuraFlow Workspace'}!`,
            recipient_email: notificationEmail,
            source_provider: 'gmail'
          },
          message: {
            body: buildLeadNotificationBody({
              workspaceName,
              lead: saved,
              messageBody: messageRow.body || ''
            }),
            recipient_email: notificationEmail
          }
        });
      }
    } catch (error) {
      console.warn('Lead notification email failed.', error?.message || error);
    }
  }

  return {
    saved,
    isNewLead: !existing,
    signals
  };
}

async function readRequestBodyWithRaw(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return { body: {}, rawText: '', contentType: '' };
  const rawText = Buffer.concat(chunks).toString('utf8');
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!rawText) return { body: {}, rawText: '', contentType };
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return {
      body: parseFormEncodedBody(rawText),
      rawText,
      contentType
    };
  }
  try {
    return { body: JSON.parse(rawText), rawText, contentType };
  } catch {
    return { body: {}, rawText, contentType };
  }
}

function verifyMetaWebhookSignature(rawText = '', headers = {}) {
  const appSecret = env.META_APP_SECRET || process.env.META_APP_SECRET || '';
  if (!appSecret) {
    return { verified: true, reason: 'Meta app secret not configured; signature verification skipped.' };
  }

  const normalizedHeaders = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key || '').toLowerCase(), value]));
  const signatureHeader = String(normalizedHeaders['x-hub-signature-256'] || normalizedHeaders['x-hub-signature'] || '').trim();
  if (!signatureHeader) {
    return { verified: false, reason: 'Missing X-Hub-Signature-256 header.' };
  }

  const expected = `sha256=${createHmac('sha256', appSecret).update(rawText || '').digest('hex')}`;
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signatureHeader);
  if (expectedBuffer.length !== signatureBuffer.length) {
    return { verified: false, reason: 'Meta signature length mismatch.' };
  }

  return {
    verified: timingSafeEqual(expectedBuffer, signatureBuffer),
    reason: timingSafeEqual(expectedBuffer, signatureBuffer)
      ? 'Meta signature verified.'
      : 'Meta signature mismatch.'
  };
}

function looksLikeTwilioConversationsPayload(body = {}, headers = {}) {
  const normalizedHeaders = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key || '').toLowerCase(), value]));
  return Boolean(
    normalizedHeaders['x-twilio-signature']
    || body?.ConversationSid
    || body?.EventType
    || body?.['MessagingBinding.Address']
    || body?.['ParticipantMessagingBinding.Address']
  );
}

function verifyTwilioWebhookSignature(requestUrl = '', body = {}, headers = {}) {
  const authToken = env.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || '';
  if (!authToken) {
    return { verified: true, reason: 'Twilio auth token not configured; signature verification skipped.' };
  }

  const normalizedHeaders = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key || '').toLowerCase(), value]));
  const signatureHeader = String(normalizedHeaders['x-twilio-signature'] || '').trim();
  if (!signatureHeader) {
    return { verified: false, reason: 'Missing X-Twilio-Signature header.' };
  }

  const values = Object.entries(body || {}).reduce((acc, [key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => acc.push([key, String(entry ?? '')]));
      return acc;
    }
    acc.push([key, String(value ?? '')]);
    return acc;
  }, []).sort((left, right) => left[0].localeCompare(right[0]));
  const expectedPayload = `${requestUrl}${values.map(([key, value]) => `${key}${value}`).join('')}`;
  const expected = createHmac('sha1', authToken).update(expectedPayload, 'utf8').digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signatureHeader);
  if (expectedBuffer.length !== signatureBuffer.length) {
    return { verified: false, reason: 'Twilio signature length mismatch.' };
  }

  return {
    verified: timingSafeEqual(expectedBuffer, signatureBuffer),
    reason: timingSafeEqual(expectedBuffer, signatureBuffer)
      ? 'Twilio signature verified.'
      : 'Twilio signature mismatch.'
  };
}

function isUnsignedPreviewWebhook(provider, body = {}, headers = {}) {
  const providerKey = String(provider || '').toLowerCase();
  if (!['whatsapp', 'instagram', 'messenger', 'facebook'].includes(providerKey)) {
    return false;
  }

  const looksLikePreviewSeed = Boolean(
    body
    && (body.workspaceId || body.workspace_id)
    && body.contact
    && body.conversation
    && Array.isArray(body.messages)
  );

  return looksLikePreviewSeed;
}

function emitWorkspaceMutation(workspaceId, type, detail = {}) {
  const key = String(workspaceId || detail.workspace_id || detail.workspaceId || '').trim();
  if (!key) return;
  publishWorkspaceEvent(key, {
    type: 'workspace.updated',
    mutationType: type,
    detail
  });
}

function enqueueInboundWorkflow(provider, normalized, result) {
  const plan = buildInboundWorkflowPlan({ provider, normalized, result });
  const workspaceId = String(normalized?.workspaceId || result?.workspaceId || '').trim();
  for (const step of plan) {
    enqueueWorkspaceJob(workspaceId, step.type, {
      ...step.payload,
      sourceEventType: normalized?.eventType || result?.eventType || '',
      providerVerification: normalized?.verification || {}
    });
  }
  if (plan.length) {
    emitWorkspaceMutation(workspaceId, 'workflow.inbound_planned', {
      provider,
      plan
    });
  }
  return plan;
}

async function persistConversationPatch(workspaceId, conversationId, patch = {}) {
  if (!conversationId) return null;
  if (hasSupabaseAdminConfig()) {
    const rows = await supabaseRest('conversations', {
      method: 'PATCH',
      query: `id=eq.${encodeURIComponent(conversationId)}`,
      body: patch,
      prefer: 'return=representation'
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }
  const updated = patchDemoCollectionRecord('conversations', conversationId, patch);
  return updated;
}

async function createConversationActivityEvent(workspaceId, payload = {}) {
  if (!workspaceId) return null;
  if (hasSupabaseAdminConfig()) {
    const rows = await supabaseRest('activity_events', {
      method: 'POST',
      body: [{
        workspace_id: workspaceId,
        entity_type: payload.entity_type || 'conversation',
        entity_id: payload.entity_id || null,
        event_type: payload.event_type || 'workflow_action',
        payload: payload.payload || {}
      }],
      prefer: 'return=representation'
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }
  return createDemoActivityEvent(workspaceId, {
    entity_type: payload.entity_type || 'conversation',
    entity_id: payload.entity_id || null,
    event_type: payload.event_type || 'workflow_action',
    payload: payload.payload || {}
  });
}

function humanizeCompactLabel(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildFutureIsoDate(hoursFromNow = 24) {
  const safeHours = Number.isFinite(Number(hoursFromNow)) ? Math.max(1, Number(hoursFromNow)) : 24;
  return new Date(Date.now() + safeHours * 60 * 60 * 1000).toISOString();
}

function deriveVoiceLeadTemperature(sentiment = '', sentimentScore = 0, combinedText = '') {
  const text = String(combinedText || '').toLowerCase();
  const score = Number.isFinite(Number(sentimentScore)) ? Number(sentimentScore) : 0;
  if (text.match(/\b(ready|today|immediately|urgent|book|schedule|send the invoice|pay|close this)\b/)) return 'hot';
  if (String(sentiment || '').toLowerCase() === 'negative' || score <= -0.2) return 'needs_attention';
  if (text.match(/\b(interested|pricing|quote|demo|proposal|next week|follow up|call me)\b/)) return 'warm';
  return 'nurture';
}

function deriveVoiceFollowUpPlan({ notePayload = {}, analysis = {}, contact = null, voiceSession = null } = {}) {
  const transcript = normalizeLeadText(
    analysis?.transcript
      || notePayload?.transcript
      || notePayload?.body
      || ''
  );
  const summary = normalizeLeadText(analysis?.summary || notePayload?.summary || transcript);
  const sentiment = String(analysis?.sentiment || notePayload?.sentiment || '').trim().toLowerCase() || 'neutral';
  const sentimentScore = Number.isFinite(Number(analysis?.sentimentScore ?? notePayload?.sentiment_score))
    ? Number(analysis?.sentimentScore ?? notePayload?.sentiment_score)
    : 0;
  const combinedText = `${summary} ${transcript}`.trim();
  const leadTemperature = deriveVoiceLeadTemperature(sentiment, sentimentScore, combinedText);
  const explicitWhatsapp = /\bwhats\s?app\b/i.test(combinedText);
  const explicitEmail = /\bemail\b/i.test(combinedText);
  const preferredChannel = explicitWhatsapp
    ? 'WhatsApp'
    : explicitEmail
      ? 'Email'
      : contact?.phone
        ? 'WhatsApp'
        : contact?.email
          ? 'Email'
          : 'Manual outreach';
  const suggestedOwner = String(contact?.owner_name || contact?.owner || 'Workspace operator').trim() || 'Workspace operator';
  const preferredChannelLower = preferredChannel.toLowerCase();
  const nextAction = leadTemperature === 'hot'
    ? `Follow up on ${preferredChannel} within 2 hours and offer the next booking step.`
    : leadTemperature === 'needs_attention'
      ? `Call back with a reassurance note, then send a ${preferredChannelLower} recap.`
      : leadTemperature === 'warm'
        ? `Send a ${preferredChannelLower} recap with pricing or the next clear option.`
        : `Add this contact to a gentle ${preferredChannelLower} nurture flow.`;
  const followUpTiming = leadTemperature === 'hot'
    ? 'Within 2 hours'
    : leadTemperature === 'needs_attention'
      ? 'Same business day'
      : leadTemperature === 'warm'
        ? 'Within 24 hours'
        : 'Within 48 hours';
  const summaryLine = summary || 'Voice session analyzed and ready for follow-up.';
  const shouldCreateSequence = ['hot', 'needs_attention', 'warm'].includes(leadTemperature);
  const sequenceName = contact?.name
    ? `${contact.name} voice follow-up`
    : voiceSession?.id
      ? `Voice follow-up ${String(voiceSession.id).slice(0, 8)}`
      : 'Voice follow-up sequence';
  const steps = [
    `Send a ${preferredChannel} recap that reflects the caller mood and confirms the next step.`,
    leadTemperature === 'needs_attention'
      ? 'Escalate to a human owner if the contact still sounds unsure after the recap.'
      : 'Wait for the first response and log objections or buying signals.',
    leadTemperature === 'hot'
      ? 'Book the meeting or payment handoff as soon as the contact replies.'
      : 'Send one final follow-up if there is no response before closing the loop.'
  ];

  return {
    leadTemperature,
    sentiment,
    sentimentScore,
    suggestedOwner,
    preferredChannel,
    nextAction,
    followUpTiming,
    summaryLine,
    shouldCreateSequence,
    sequenceSuggestion: {
      name: sequenceName,
      status: 'draft',
      steps: steps.length,
      replies: leadTemperature === 'hot' ? 'Priority' : leadTemperature === 'needs_attention' ? 'Monitor' : 'Planned',
      deliveries: preferredChannel,
      next_run: buildFutureIsoDate(
        leadTemperature === 'hot' ? 2 : leadTemperature === 'needs_attention' ? 6 : leadTemperature === 'warm' ? 24 : 48
      ),
      steps_detail: steps.join('\n')
    }
  };
}

async function findWorkspaceFollowUpSequenceByName(workspaceId = '', name = '') {
  if (!workspaceId || !name) return null;
  if (hasSupabaseAdminConfig()) {
    const rows = await supabaseRest('follow_up_sequences', {
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&name=eq.${encodeURIComponent(name)}&select=*`,
      prefer: 'return=representation'
    }).catch(() => []);
    return Array.isArray(rows) ? rows[0] || null : rows || null;
  }
  return listDemoCollection('follow_up_sequences', workspaceId).find((item) => String(item?.name || '') === String(name || '')) || null;
}

async function createVoiceFollowUpArtifacts(workspaceId, { noteRecord = null, notePayload = {}, analysis = {}, contact = null, voiceSession = null } = {}) {
  const plan = deriveVoiceFollowUpPlan({ notePayload, analysis, contact, voiceSession });
  let sequenceRecord = null;

  if (plan.shouldCreateSequence && plan.sequenceSuggestion?.name) {
    sequenceRecord = await findWorkspaceFollowUpSequenceByName(workspaceId, plan.sequenceSuggestion.name);
    if (!sequenceRecord) {
      sequenceRecord = await createWorkspaceRecordData('follow_up_sequences', workspaceId, {
        name: plan.sequenceSuggestion.name,
        status: plan.sequenceSuggestion.status,
        steps: plan.sequenceSuggestion.steps
      });
    }
  }

  await createConversationActivityEvent(workspaceId, {
    entity_type: 'voice_session',
    entity_id: voiceSession?.id || noteRecord?.voice_session_id || null,
    event_type: 'voice.follow_up_recommended',
    payload: {
      note_id: noteRecord?.id || null,
      contact_id: contact?.id || noteRecord?.contact_id || null,
      lead_temperature: plan.leadTemperature,
      suggested_owner: plan.suggestedOwner,
      preferred_channel: plan.preferredChannel,
      next_action: plan.nextAction,
      follow_up_timing: plan.followUpTiming,
      sequence_id: sequenceRecord?.id || null,
      sequence_name: sequenceRecord?.name || plan.sequenceSuggestion?.name || null
    }
  });

  return { plan, sequenceRecord };
}

async function executeWorkflowJob(workspaceId, job) {
  const payload = job.payload || {};
  const conversationId = String(payload.conversationId || payload.conversation_id || '').trim();
  if (!conversationId) {
    return { ok: true, skipped: true, reason: 'No conversation referenced.' };
  }

  if (job.type === 'workflow.auto_assign') {
    const assignedTo = String(payload.targetOwner || payload.suggestedAssignee || payload.assignee || 'Workspace operator').trim();
    await persistConversationPatch(workspaceId, conversationId, {
      assigned_to: assignedTo,
      updated_at: new Date().toISOString()
    });
    await createConversationActivityEvent(workspaceId, {
      entity_type: 'conversation',
      entity_id: conversationId,
      event_type: 'conversation.assigned',
      payload: {
        assigned_to: assignedTo,
        reason: payload.reason || payload.suggestion || 'Auto-assignment from workflow'
      }
    });
    return { ok: true, action: 'assigned', assignedTo };
  }

  if (job.type === 'workflow.follow_up_suggestion') {
    await createConversationActivityEvent(workspaceId, {
      entity_type: 'conversation',
      entity_id: conversationId,
      event_type: 'follow_up.suggested',
      payload: {
        suggestion: payload.suggestion || payload.reason || 'Follow-up recommended by workflow',
        followUpTiming: payload.followUpTiming || payload.nextRun || ''
      }
    });
    return { ok: true, action: 'follow_up_suggestion' };
  }

  if (job.type === 'workflow.handoff_review') {
    await createConversationActivityEvent(workspaceId, {
      entity_type: 'conversation',
      entity_id: conversationId,
      event_type: 'conversation.escalated',
      payload: {
        reason: payload.reason || payload.escalationReason || 'Handoff review requested'
      }
    });
    return { ok: true, action: 'handoff_review' };
  }

  if (job.type === 'workflow.auto_triage' || job.type === 'workflow.inbound_recorded') {
    await createConversationActivityEvent(workspaceId, {
      entity_type: 'conversation',
      entity_id: conversationId,
      event_type: job.type.replace('workflow.', 'workflow.'),
      payload
    });
    return { ok: true, action: job.type };
  }

  return { ok: true, skipped: true, reason: `Unsupported workflow job: ${job.type}` };
}

async function processWebhookReplayJob(workspaceId, job, { enqueueJob = true } = {}) {
  const payload = job.payload || {};
  const provider = String(payload.provider || payload.body?.provider || payload.normalized?.provider || 'gmail').toLowerCase();
  const normalized = payload.normalized
    || normalizeWebhookPayload({
      ...(payload.body || {}),
      provider,
      workspaceId,
      headers: payload.headers || {}
  });
  return ingestCanonicalWebhookEvent({
    provider,
    workspaceId,
    normalized,
    enqueueJob,
    registerReplay: false,
    source: 'replay'
  });
}

async function recordProviderHealthCheck(workspaceId, job = {}) {
  const readiness = getProviderReadiness();
  if (workspaceId) {
    await createConversationActivityEvent(workspaceId, {
      entity_type: 'workspace',
      entity_id: workspaceId,
      event_type: 'provider.health_checked',
      payload: {
        source: job.payload?.source || 'scheduled',
        readiness,
        note: 'Provider health sweep completed.'
      }
    }).catch((error) => {
      console.warn('Failed to record provider health event.', error);
    });
    emitWorkspaceMutation(workspaceId, 'provider.health_checked', {
      readiness,
      source: job.payload?.source || 'scheduled'
    });
  }
  return {
    ok: true,
    readiness
  };
}

function buildRelayTestEnvelope(provider = 'gmail', workspaceId = '', relay = {}) {
  const now = new Date();
  const normalizedProvider = String(provider || 'gmail').toLowerCase();
  if (normalizedProvider === 'gmail') {
    const messageId = `gmail-message-test-${now.getTime()}`;
    const threadId = `gmail-thread-test-${now.getTime()}`;
    return {
      provider: 'gmail',
      workspaceId,
      accountId: relay.accountId || 'support@northstar.example',
      headers: {
        authorization: 'Bearer gmail-relay-test'
      },
      payload: {
        message: {
          data: 'gmail-relay-test',
          messageId
        },
        thread: {
          id: threadId,
          subject: 'Gmail webhook verification test',
          from: {
            name: relay.senderName || 'Gmail Relay Test',
            email: relay.senderEmail || 'relay-test@example.com'
          },
          messages: [
            {
              id: `${messageId}-in`,
              direction: 'inbound',
              senderName: relay.senderName || 'Gmail Relay Test',
              body: relay.body || 'This is a live Gmail webhook path test from AuraFlow.',
              createdAt: now.toISOString(),
              rawPayload: {
                source: 'gmail-webhook-test'
              }
            }
          ]
        },
        messages: [
          {
            id: `${messageId}-in`,
            direction: 'inbound',
            senderName: relay.senderName || 'Gmail Relay Test',
            body: relay.body || 'This is a live Gmail webhook path test from AuraFlow.',
            createdAt: now.toISOString(),
            rawPayload: {
              source: 'gmail-webhook-test'
            }
          }
        ],
        body: relay.body || 'This is a live Gmail webhook path test from AuraFlow.'
      }
    };
  }

  if (normalizedProvider === 'whatsapp') {
    const messageId = `whatsapp-message-test-${now.getTime()}`;
    const threadId = `whatsapp-thread-test-${now.getTime()}`;
    return {
      provider: 'whatsapp',
      workspaceId,
      accountId: relay.accountId || 'northstar-whatsapp',
      headers: {
        'x-hub-signature-256': 'sha256-relay-test'
      },
      payload: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: {
                    phone_number_id: relay.phoneNumberId || '15551234567',
                    display_phone_number: relay.displayPhoneNumber || '+1 555 123 4567'
                  },
                  contacts: [
                    {
                      wa_id: relay.contactId || '+2348015550101',
                      profile: { name: relay.senderName || 'Amaka Okafor' }
                    }
                  ],
                  messages: [
                    {
                      id: `${messageId}-in`,
                      text: { body: relay.body || 'This is a live WhatsApp webhook path test from AuraFlow.' },
                      timestamp: now.toISOString()
                    }
                  ],
                  conversation: {
                    id: threadId
                  }
                }
              }
            ]
          }
        ]
      }
    };
  }

  return {
    provider: normalizedProvider,
    workspaceId,
    headers: relay.headers || {},
    payload: relay.payload || {
      body: relay.body || 'This is a live provider webhook path test from AuraFlow.'
    }
  };
}

async function ingestCanonicalWebhookEvent({
  provider,
  workspaceId = '',
  normalized = null,
  body = null,
  headers = {},
  verification = null,
  registerReplay = true,
  enqueueJob = true,
  source = 'webhook'
} = {}) {
  const nextNormalized = normalized
    || normalizeWebhookPayload({
      ...(body || {}),
      provider,
      workspaceId,
      headers
    });
  nextNormalized.workspaceId = nextNormalized.workspaceId || workspaceId;
  if (verification) {
    nextNormalized.verification = {
      ...(nextNormalized.verification || {}),
      ...verification
    };
  }

  if (registerReplay) {
    const replay = registerWebhookReplay(nextNormalized.workspaceId || workspaceId || provider, nextNormalized);
    if (!replay.accepted) {
      return {
        ok: true,
        duplicate: true,
        replayKey: replay.replayKey,
        provider,
        workspaceId: nextNormalized.workspaceId || workspaceId || ''
      };
    }
  }

  const result = hasSupabaseAdminConfig()
    ? await ingestProviderPayload(nextNormalized)
    : ingestDemoProviderPayload(nextNormalized);
  const effectiveWorkspaceId = nextNormalized.workspaceId || workspaceId || result.workspaceId;
  const workspaceName = await resolveWorkspaceName(effectiveWorkspaceId).catch(() => '');
  await captureLeadFromEnvelope(
    effectiveWorkspaceId,
    provider,
    result.contact || null,
    result.conversation || null,
    Array.isArray(result.messages) ? result.messages[0] : null,
    workspaceName
  ).catch((error) => {
    console.warn('Lead capture failed.', error?.message || error);
  });
  await markWorkspaceProviderInboundEvent(effectiveWorkspaceId, provider, nextNormalized);
  await applyDeliveryReceipts(effectiveWorkspaceId, nextNormalized);
  const workflowPlan = enqueueInboundWorkflow(provider, nextNormalized, result);
  if (enqueueJob) {
    enqueueWorkspaceJob(effectiveWorkspaceId, 'provider.webhook.ingest', {
      provider,
      eventType: nextNormalized.eventType,
      verification: nextNormalized.verification,
      normalized: nextNormalized,
      source
    });
  }
  emitWorkspaceMutation(effectiveWorkspaceId, source === 'replay' ? 'provider.webhook.replayed' : 'provider.webhook.ingested', {
    provider,
    eventType: nextNormalized.eventType,
    verification: nextNormalized.verification,
    normalized: nextNormalized,
    result,
    workflowPlan,
    replayed: source === 'replay',
    source
  });
  return { ...result, workflowPlan };
}

async function processReplayJobs() {
  const workspaceIds = listWorkspaceJobWorkspaces();
  for (const workspaceId of workspaceIds) {
    const jobs = listWorkspaceJobs(workspaceId);
    for (const job of jobs) {
      const status = String(job.status || '').toLowerCase();
      const nextRetryAt = job.next_retry_at ? Date.parse(job.next_retry_at) : NaN;
      const retryable = ['retrying', 'failed'].includes(status);
      const due = !Number.isNaN(nextRetryAt) && nextRetryAt <= Date.now();
      if (!retryable || !due) continue;

      const running = updateWorkspaceJob(workspaceId, job.id, {
        status: 'running',
        note: job.note || '',
        assigned_to: job.assigned_to || ''
      });
      if (!running) continue;

      try {
        if (String(job.type || '') === 'provider.health_check') {
          await recordProviderHealthCheck(workspaceId, job);
        } else if (String(job.type || '').startsWith('provider.')) {
          await processWebhookReplayJob(workspaceId, job, { enqueueJob: false });
        } else if (String(job.type || '').startsWith('workflow.')) {
          await executeWorkflowJob(workspaceId, job);
        }
        updateWorkspaceJob(workspaceId, job.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          note: job.note || '',
          assigned_to: job.assigned_to || ''
        });
      } catch (error) {
        scheduleWorkspaceJobRetry(workspaceId, job.id, error?.message || String(error), {
          note: job.note || '',
          assigned_to: job.assigned_to || ''
        });
      }
    }
  }
}

function startReplayWorker() {
  if (globalThis.__auraflowReplayWorkerStarted) return;
  globalThis.__auraflowReplayWorkerStarted = true;
  setInterval(() => {
    processReplayJobs().catch((error) => {
      console.warn('Replay worker failed.', error);
    });
  }, 10000).unref?.();
}

function startProviderHealthWorker() {
  if (globalThis.__auraflowProviderHealthWorkerStarted) return;
  globalThis.__auraflowProviderHealthWorkerStarted = true;
  setInterval(() => {
    for (const workspaceId of listWorkspaceJobWorkspaces()) {
      const jobs = listWorkspaceJobs(workspaceId);
      const recentHealth = jobs.find((job) => String(job.type || '') === 'provider.health_check' && ['queued', 'running', 'retrying'].includes(String(job.status || '').toLowerCase()));
      if (!recentHealth) {
        enqueueWorkspaceJob(workspaceId, 'provider.health_check', {
          source: 'scheduled'
        });
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

function startGmailWatchRenewalWorker() {
  if (globalThis.__auraflowGmailWatchWorkerStarted) return;
  globalThis.__auraflowGmailWatchWorkerStarted = true;
  const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
  setInterval(() => {
    runGmailWatchRenewalSweep({ reason: 'scheduled' }).catch((error) => {
      console.warn('Gmail watch renewal sweep failed.', error);
    });
  }, sixDaysMs).unref?.();
}

async function createNangoSession(body = {}) {
  const secret = env.NANGO_SECRET_KEY || process.env.NANGO_SECRET_KEY;
  const baseUrl = env.NANGO_BASE_URL || process.env.NANGO_BASE_URL;
  if (!secret || !baseUrl) {
    throw new Error('Nango is not configured');
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/connect/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      end_user: body.end_user || body.endUser || { id: body.workspaceId || 'auraflow-local', display_name: body.displayName || 'AuraFlow User' },
      allowed_integrations: body.allowed_integrations || body.allowedIntegrations || [],
      expires_in: body.expires_in || body.expiresIn || 3600
    })
  });

  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = text ? { raw: text } : {};
  }

  if (!response.ok) {
    const detail = parsed?.error || parsed?.message || parsed || text || 'Nango session request failed';
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }

  return parsed;
}

function renderOAuthCallbackPage(title, message, { redirectUrl = '', tone = 'success' } = {}) {
  const background = tone === 'error' ? '#251318' : '#0f1722';
  const accent = tone === 'error' ? '#f87171' : '#22c55e';
  const action = redirectUrl
    ? `<a href="${redirectUrl}" style="display:inline-flex;padding:12px 16px;border-radius:12px;background:${accent};color:#041018;text-decoration:none;font-weight:600;">Return to AuraFlow</a>`
    : '';
  const autoRedirect = redirectUrl
    ? `
      <p style="margin:16px 0 0;color:#8fa0b8;font-size:14px;">Returning to AuraFlow automatically...</p>
      <script>
        window.setTimeout(function () {
          window.location.replace(${JSON.stringify(redirectUrl)});
        }, 900);
      </script>
    `
    : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:${background};color:#e6eef8;font-family:Segoe UI,system-ui,sans-serif;">
    <main style="max-width:480px;padding:32px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:rgba(255,255,255,.04);box-shadow:0 20px 60px rgba(0,0,0,.3);">
      <p style="margin:0 0 8px;color:${accent};font-size:12px;letter-spacing:.12em;text-transform:uppercase;">AuraFlow OAuth</p>
      <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1;">${title}</h1>
      <p style="margin:0 0 24px;color:#afbdd3;line-height:1.6;">${message}</p>
      ${action}
      ${autoRedirect}
    </main>
  </body>
</html>`;
}

function renderMaintenancePage(message = 'Supabase is temporarily unreachable. Please refresh in a minute.') {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>AuraFlow Maintenance</title>
  </head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#040a12;color:#eff7fb;font-family:Segoe UI,system-ui,sans-serif;">
    <main style="width:min(92vw,640px);padding:32px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:rgba(11,22,35,.96);box-shadow:0 20px 60px rgba(0,0,0,.3);">
      <p style="margin:0 0 8px;color:#59d5f5;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">Maintenance mode</p>
      <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1;">AuraFlow is syncing</h1>
      <p style="margin:0;color:#afbdd3;line-height:1.6;">${message}</p>
      <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap;">
        <a href="/" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-radius:999px;background:#59d5f5;color:#041018;text-decoration:none;font-weight:600;">Refresh AuraFlow</a>
        <a href="/healthz" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-radius:999px;background:rgba(255,255,255,.05);color:#eff7fb;text-decoration:none;font-weight:600;border:1px solid rgba(255,255,255,.08);">Check health</a>
      </div>
    </main>
  </body>
</html>`;
}

function renderReviewDemoPage({ workspace = {}, snapshot = {} } = {}) {
  const stats = [
    { label: 'Conversations', value: snapshot.conversations?.length || 0 },
    { label: 'Leads captured', value: snapshot.leads?.length || 0 },
    { label: 'Channels connected', value: snapshot.channels?.length || 0 },
    { label: 'Knowledge sources', value: snapshot.businessKnowledge?.length || snapshot.trainingSources?.length || 0 }
  ];
  const conversations = Array.isArray(snapshot.conversations) ? snapshot.conversations.slice(0, 5) : [];
  const channels = Array.isArray(snapshot.channels) ? snapshot.channels : [];
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>AuraFlow Review Demo</title>
  </head>
  <body style="margin:0;font-family:Segoe UI,system-ui,sans-serif;background:linear-gradient(180deg,#06101a 0%,#040a12 100%);color:#eff7fb;">
    <main style="width:min(1200px,calc(100vw - 32px));margin:24px auto;display:grid;gap:16px;">
      <section style="padding:28px;border-radius:20px;background:rgba(11,22,35,.96);border:1px solid rgba(176,198,216,.14);display:flex;justify-content:space-between;gap:24px;align-items:end;box-shadow:0 24px 72px rgba(0,0,0,.3);">
        <div>
          <p style="margin:0 0 12px;text-transform:uppercase;letter-spacing:.08em;color:#59d5f5;font-size:12px;">Meta review demo</p>
          <h1 style="margin:0 0 8px;font-size:34px;">${workspace.name || 'AuraFlow'} Review View</h1>
          <p style="margin:0;max-width:72ch;color:#97a9b7;line-height:1.6;">Read-only dashboard preview for Meta reviewers. No editable controls are shown on this page.</p>
        </div>
        <div style="padding:8px 12px;border-radius:999px;background:rgba(79,216,155,.14);color:#4fd89b;font-size:12px;">Workspace: ${workspace.slug || workspace.id || 'northstar-commerce'}</div>
      </section>
      <section style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;">
        ${stats.map((item) => `
          <article style="padding:18px;border-radius:18px;background:rgba(11,22,35,.96);border:1px solid rgba(176,198,216,.14);">
            <span style="display:block;color:#97a9b7;font-size:13px;margin-bottom:10px;">${item.label}</span>
            <strong style="font-size:28px;">${item.value}</strong>
          </article>
        `).join('')}
      </section>
      <section style="display:grid;grid-template-columns:1.4fr .9fr;gap:16px;">
        <article style="padding:22px;border-radius:20px;background:rgba(11,22,35,.96);border:1px solid rgba(176,198,216,.14);box-shadow:0 24px 72px rgba(0,0,0,.3);">
          <h2 style="margin:0 0 14px;font-size:20px;">Channel overview</h2>
          <div style="display:grid;gap:10px;">
            ${channels.map((channel) => `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.06);">
                <div>
                  <strong style="display:block;margin-bottom:4px;">${channel.display_name || channel.provider}</strong>
                  <span style="color:#97a9b7;font-size:13px;">${channel.provider || ''} · ${channel.channel_type || channel.channelType || 'channel'}</span>
                </div>
                <span style="padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.06);font-size:12px;">${String(channel.status || 'active').toUpperCase()}</span>
              </div>
            `).join('')}
          </div>
        </article>
        <article style="padding:22px;border-radius:20px;background:rgba(11,22,35,.96);border:1px solid rgba(176,198,216,.14);box-shadow:0 24px 72px rgba(0,0,0,.3);">
          <h2 style="margin:0 0 14px;font-size:20px;">Recent conversations</h2>
          <div style="display:grid;gap:10px;">
            ${conversations.map((conversation) => `
              <div style="padding:14px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);">
                <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;">
                  <strong>${conversation.subject || conversation.name || 'Conversation'}</strong>
                  <span style="padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.06);font-size:12px;">${conversation.status || 'open'}</span>
                </div>
                <p style="margin:0;color:#97a9b7;line-height:1.5;">${conversation.summary || conversation.last_message || conversation.lastMessage || 'No preview available.'}</p>
              </div>
            `).join('')}
          </div>
          <p style="margin:16px 0 0;color:#97a9b7;font-size:13px;">Review page intentionally omits reply controls, form fields, and editing actions.</p>
        </article>
      </section>
    </main>
  </body>
</html>`;
}

function buildAppReturnUrl(origin, { provider = '', status = 'connected', workspaceId = '', error = '' } = {}) {
  const nextUrl = new URL(origin);
  nextUrl.searchParams.set('screen', 'deploy');
  if (provider) nextUrl.searchParams.set('oauth_provider', provider);
  if (status) nextUrl.searchParams.set('oauth_status', status);
  if (workspaceId) nextUrl.searchParams.set('workspace_id', workspaceId);
  if (error) nextUrl.searchParams.set('oauth_error', error);
  return nextUrl.toString();
}

function buildGoogleRedirectUri(req) {
  return `${getRequestOrigin(req)}/auth/google/callback`;
}

function buildMetaRedirectUri(req) {
  return `${getRequestOrigin(req)}/api/auth/facebook/callback`;
}

function buildOAuthState(req, payload = {}) {
  return signConnectionState({
    ...payload,
    requestOrigin: getRequestOrigin(req),
    issuedAt: Date.now()
  }, getTokenEncryptionSecret());
}

async function createWorkspaceOAuthSession(req, workspaceId, providerKey, body = {}) {
  const provider = String(providerKey || '').trim().toLowerCase();
  if (provider === 'gmail') {
    const clientId = env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID is not configured.');
    }
    const state = buildOAuthState(req, {
      workspaceId,
      provider: 'gmail'
    });
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', buildGoogleRedirectUri(req));
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('scope', [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send'
    ].join(' '));
    authUrl.searchParams.set('state', state);
    return {
      ok: true,
      provider: 'gmail',
      mode: 'oauth_redirect',
      authUrl: authUrl.toString(),
      redirectUrl: authUrl.toString()
    };
  }

  if (['whatsapp', 'instagram', 'messenger', 'meta', 'facebook'].includes(provider)) {
    const appId = env.FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID || env.META_APP_ID || process.env.META_APP_ID || '';
    if (!appId) {
      throw new Error('FACEBOOK_APP_ID is not configured.');
    }
    const state = buildOAuthState(req, {
      workspaceId,
      provider,
      rootProvider: 'meta'
    });
    const authUrl = new URL(`https://www.facebook.com/${process.env.META_GRAPH_VERSION || 'v20.0'}/dialog/oauth`);
    authUrl.searchParams.set('client_id', appId);
    authUrl.searchParams.set('redirect_uri', buildMetaRedirectUri(req));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', String(
      env.META_OAUTH_SCOPES ||
      process.env.META_OAUTH_SCOPES ||
      'pages_show_list,pages_manage_metadata,pages_read_engagement,pages_messaging,instagram_basic,instagram_manage_messages,business_management,whatsapp_business_management,whatsapp_business_messaging'
    ));
    return {
      ok: true,
      provider,
      mode: 'oauth_redirect',
      authUrl: authUrl.toString(),
      redirectUrl: authUrl.toString()
    };
  }

  if (hasSupabaseAdminConfig()) {
    return createNangoSession({
      ...body,
      workspaceId,
      end_user: body.end_user || { id: workspaceId, display_name: body.displayName || 'AuraFlow Workspace' }
    });
  }

  return createDemoConnectSession({
    ...body,
    workspaceId
  });
}

async function exchangeGoogleCodeForTokens(req, code = '') {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
      client_secret: env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: buildGoogleRedirectUri(req),
      grant_type: 'authorization_code'
    })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || 'Failed to exchange Google OAuth code.');
  }
  return text ? JSON.parse(text) : {};
}

async function fetchGoogleProfile(accessToken = '') {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || 'Failed to load Google account profile.');
  }
  return text ? JSON.parse(text) : {};
}

function describeFetchFailure(error, fallback = 'Request failed.') {
  const message = error?.cause?.message || error?.message || fallback;
  const code = error?.cause?.code || error?.code || '';
  return code ? `${message} (${code})` : message;
}

async function fetchJsonWithRetry(url, options = {}, { retries = 1, fallbackMessage = 'Request failed.' } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || fallbackMessage);
      }
      return text ? JSON.parse(text) : {};
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw new Error(describeFetchFailure(lastError, fallbackMessage));
}

async function exchangeMetaCodeForTokens(req, code = '') {
  const graphVersion = process.env.META_GRAPH_VERSION || 'v20.0';
  const tokenUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', env.FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID || env.META_APP_ID || process.env.META_APP_ID || '');
  tokenUrl.searchParams.set('client_secret', env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_APP_SECRET || env.META_APP_SECRET || process.env.META_APP_SECRET || '');
  tokenUrl.searchParams.set('redirect_uri', buildMetaRedirectUri(req));
  tokenUrl.searchParams.set('code', code);
  const shortLivedToken = await fetchJsonWithRetry(tokenUrl, {}, {
    retries: 1,
    fallbackMessage: 'Failed to exchange Meta OAuth code.'
  });
  const shortAccessToken = String(shortLivedToken?.access_token || '').trim();
  if (!shortAccessToken) {
    return shortLivedToken;
  }

  const longLivedUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
  longLivedUrl.searchParams.set('client_id', env.FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID || env.META_APP_ID || process.env.META_APP_ID || '');
  longLivedUrl.searchParams.set('client_secret', env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_APP_SECRET || env.META_APP_SECRET || process.env.META_APP_SECRET || '');
  longLivedUrl.searchParams.set('fb_exchange_token', shortAccessToken);

  const longLivedToken = await fetchJsonWithRetry(longLivedUrl, {}, {
    retries: 1,
    fallbackMessage: 'Failed to exchange Meta access token for a long-lived token.'
  }).catch((error) => {
    console.warn('Long-lived Meta token exchange failed; continuing with the short-lived token.', error);
    return shortLivedToken;
  });

  return {
    ...shortLivedToken,
    ...longLivedToken,
    short_lived_access_token: shortAccessToken,
    long_lived_access_token: String(longLivedToken?.access_token || shortAccessToken || '').trim(),
    token_type: longLivedToken?.token_type || shortLivedToken?.token_type || 'bearer'
  };
}

async function fetchMetaProfile(accessToken = '') {
  const graphVersion = process.env.META_GRAPH_VERSION || 'v20.0';
  const meUrl = new URL(`https://graph.facebook.com/${graphVersion}/me`);
  meUrl.searchParams.set('fields', 'id,name,email');
  meUrl.searchParams.set('access_token', accessToken);
  const profile = await fetchJsonWithRetry(meUrl, {}, {
    retries: 1,
    fallbackMessage: 'Failed to load Meta account profile.'
  });

  const accountsUrl = new URL(`https://graph.facebook.com/${graphVersion}/me/accounts`);
  accountsUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username}');
  accountsUrl.searchParams.set('access_token', accessToken);
  const accountsPayload = await fetchJsonWithRetry(accountsUrl, {}, {
    retries: 1,
    fallbackMessage: 'Failed to load Meta pages.'
  });

  return {
    profile,
    accounts: accountsPayload.data || []
  };
}

async function fetchMetaGrantedPermissions(accessToken = '') {
  const graphVersion = process.env.META_GRAPH_VERSION || 'v20.0';
  const permissionsUrl = new URL(`https://graph.facebook.com/${graphVersion}/me/permissions`);
  permissionsUrl.searchParams.set('access_token', accessToken);
  const payload = await fetchJsonWithRetry(permissionsUrl, {}, {
    retries: 1,
    fallbackMessage: 'Failed to load Meta granted permissions.'
  }).catch(() => ({ data: [] }));
  return Array.from(new Set(
    Array.isArray(payload?.data)
      ? payload.data
          .filter((item) => String(item?.status || '').toLowerCase() === 'granted')
          .map((item) => String(item?.permission || '').trim())
          .filter(Boolean)
      : []
  ));
}

async function pushInstagramTokenToBotpress({
  workspaceId = '',
  accessToken = '',
  tokenExpiresAt = '',
  profile = {},
  primaryPage = null,
  instagramAccount = null,
  connection = null
} = {}) {
  const botpressUrl =
    env.BOTPRESS_TOKEN_PUSH_URL ||
    process.env.BOTPRESS_TOKEN_PUSH_URL ||
    env.BOTPRESS_WEBHOOK_URL ||
    process.env.BOTPRESS_WEBHOOK_URL ||
    env.BOTPRESS_INSTAGRAM_WEBHOOK_URL ||
    process.env.BOTPRESS_INSTAGRAM_WEBHOOK_URL ||
    env.BOTPRESS_REPLY_WEBHOOK_URL ||
    process.env.BOTPRESS_REPLY_WEBHOOK_URL ||
    '';

  if (!botpressUrl) {
    return { ok: false, skipped: true, reason: 'Botpress token push URL is not configured.' };
  }

  const botpressToken =
    env.BOTPRESS_TOKEN_PUSH_TOKEN ||
    process.env.BOTPRESS_TOKEN_PUSH_TOKEN ||
    env.BOTPRESS_WEBHOOK_TOKEN ||
    process.env.BOTPRESS_WEBHOOK_TOKEN ||
    env.BOTPRESS_REPLY_WEBHOOK_TOKEN ||
    process.env.BOTPRESS_REPLY_WEBHOOK_TOKEN ||
    '';

  const response = await fetch(botpressUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(botpressToken ? { Authorization: `Bearer ${botpressToken}` } : {})
    },
    body: JSON.stringify({
      action: 'sync_instagram_token',
      workspaceId,
      provider: 'instagram',
      accessToken,
      tokenExpiresAt: tokenExpiresAt || null,
      profile: {
        id: profile.id || '',
        name: profile.name || '',
        email: profile.email || ''
      },
      page: primaryPage
        ? {
            id: primaryPage.id || '',
            name: primaryPage.name || '',
            accessToken: primaryPage.access_token || ''
          }
        : null,
      instagramAccount: instagramAccount
        ? {
            id: instagramAccount.id || '',
            username: instagramAccount.username || ''
          }
        : null,
      connection: connection
        ? {
            id: connection.id || '',
            provider: connection.provider || 'instagram',
            workspace_id: connection.workspace_id || workspaceId || ''
          }
        : null
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Botpress token push failed with ${response.status}.`);
  }

  return {
    ok: true,
    status: response.status,
    response: text ? JSON.parse(text) : {}
  };
}

function getNangoBaseUrl() {
  return (env.NANGO_BASE_URL || process.env.NANGO_BASE_URL || 'https://api.nango.dev').replace(/\/$/, '');
}

function getNangoSecretKey() {
  return env.NANGO_SECRET_KEY || process.env.NANGO_SECRET_KEY || '';
}

async function nangoApiRequest(pathname, { method = 'GET', body = null } = {}) {
  const secret = getNangoSecretKey();
  const baseUrl = getNangoBaseUrl();
  if (!secret || !baseUrl) {
    throw new Error('Nango is not configured.');
  }

  const response = await fetch(`${baseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body == null ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Nango request failed with ${response.status}`);
  }
  return text ? JSON.parse(text) : {};
}

async function triggerNangoSync(workspaceId, provider, connectionId = '', syncs = []) {
  return nangoApiRequest('/sync/trigger', {
    method: 'POST',
    body: buildNangoTriggerBody({ workspaceId, provider, connectionId, syncs })
  });
}

async function recordReliabilityEvent(workspaceId, provider, eventType, payload = {}, { status = 'received', replayKey = '', dedupeKey = '', errorMessage = '' } = {}) {
  const entry = buildReliabilityLogEntry({
    workspaceId,
    provider,
    eventType,
    status,
    replayKey,
    dedupeKey,
    payload,
    errorMessage
  });
  if (hasSupabaseAdminConfig()) {
    const rows = await supabaseRest('reliability_events', {
      method: 'POST',
      body: [entry],
      prefer: 'return=representation'
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }
  return createDemoCollectionRecord('reliability_events', workspaceId || 'demo', entry);
}

function getSupabaseAdminConfig() {
  return {
    url: env.SUPABASE_URL || process.env.SUPABASE_URL || '',
    serviceKey:
      env.AURAFLOW_SUPABASE_SERVICE_ROLE_KEY ||
      process.env.AURAFLOW_SUPABASE_SERVICE_ROLE_KEY ||
      env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      '',
    schema: env.SUPABASE_SCHEMA || process.env.SUPABASE_SCHEMA || 'public'
  };
}

function getTokenEncryptionSecret() {
  return (
    env.TOKEN_ENCRYPTION_SECRET ||
    process.env.TOKEN_ENCRYPTION_SECRET ||
    env.AURAFLOW_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.AURAFLOW_SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  );
}

function hasWorkspaceConnectionConfig() {
  return hasSupabaseAdminConfig() && Boolean(getTokenEncryptionSecret());
}

function sanitizeWorkspaceConnection(connection = {}, { includeCredentials = false } = {}) {
  const sanitized = {
    id: connection.id || '',
    workspace_id: connection.workspace_id || '',
    provider: connection.provider || '',
    connection_type: connection.connection_type || 'oauth',
    status: connection.status || 'pending',
    display_name: connection.display_name || '',
    external_account_id: connection.external_account_id || '',
    external_account_label: connection.external_account_label || '',
    connection_metadata: connection.connection_metadata || {},
    scopes: Array.isArray(connection.scopes) ? connection.scopes : [],
    token_expires_at: connection.token_expires_at || null,
    last_connected_at: connection.last_connected_at || null,
    last_refreshed_at: connection.last_refreshed_at || null,
    last_error_at: connection.last_error_at || null,
    last_error_message: connection.last_error_message || '',
    created_at: connection.created_at || null,
    updated_at: connection.updated_at || null
  };

  if (includeCredentials) {
    sanitized.credentials = connection.credentials || {};
  }

  return sanitized;
}

function encryptConnectionCredentials(credentials = {}) {
  const secret = getTokenEncryptionSecret();
  if (!secret) {
    throw new Error('TOKEN_ENCRYPTION_SECRET is not configured.');
  }

  const encrypted = {};
  for (const [key, value] of Object.entries(credentials || {})) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    encrypted[key] = encryptConnectionSecret(normalized, secret);
  }
  return encrypted;
}

function decryptConnectionCredentials(credentials = {}) {
  const secret = getTokenEncryptionSecret();
  if (!secret) {
    throw new Error('TOKEN_ENCRYPTION_SECRET is not configured.');
  }

  const decrypted = {};
  for (const [key, value] of Object.entries(credentials || {})) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    decrypted[key] = decryptConnectionSecret(normalized, secret);
  }
  return decrypted;
}

async function listWorkspaceConnections(workspaceId, { includeCredentials = false } = {}) {
  if (!hasWorkspaceConnectionConfig()) return [];
  const rows = await supabaseRest('workspace_connections', {
    query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`,
    prefer: 'return=representation'
  }).catch(() => []);

  return toArray(rows).map((row) => {
    const credentials = includeCredentials ? decryptConnectionCredentials(row.credentials || {}) : undefined;
    return sanitizeWorkspaceConnection({
      ...row,
      credentials
    }, { includeCredentials });
  });
}

async function getWorkspaceConnection(workspaceId, provider, { includeCredentials = false } = {}) {
  const rows = await listWorkspaceConnections(workspaceId, { includeCredentials });
  return rows.find((item) => String(item.provider || '').toLowerCase() === String(provider || '').toLowerCase()) || null;
}

function buildConnectionStatusPayload(status = '', message = '') {
  return {
    status: status || 'connected',
    last_error_message: message || null,
    last_error_at: message ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  };
}

async function upsertWorkspaceConnection(workspaceId, body = {}) {
  if (!hasWorkspaceConnectionConfig()) {
    throw new Error('Workspace connection storage is not configured.');
  }

  const credentials = body.credentials ? encryptConnectionCredentials(body.credentials) : {};
  const rows = await supabaseRest('workspace_connections', {
    method: 'POST',
    query: 'on_conflict=workspace_id,provider',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: [{
      id: body.id || randomUUID(),
      workspace_id: workspaceId,
      provider: String(body.provider || '').trim().toLowerCase(),
      connection_type: body.connection_type || body.connectionType || 'oauth',
      status: body.status || 'connected',
      display_name: body.display_name || body.displayName || '',
      external_account_id: body.external_account_id || body.externalAccountId || '',
      external_account_label: body.external_account_label || body.externalAccountLabel || '',
      connection_metadata: body.connection_metadata || body.connectionMetadata || {},
      credentials,
      scopes: Array.isArray(body.scopes) ? body.scopes : [],
      token_expires_at: body.token_expires_at || body.tokenExpiresAt || null,
      last_connected_at: body.last_connected_at || body.lastConnectedAt || new Date().toISOString(),
      last_refreshed_at: body.last_refreshed_at || body.lastRefreshedAt || null,
      last_error_at: body.last_error_at || body.lastErrorAt || null,
      last_error_message: body.last_error_message || body.lastErrorMessage || null,
      updated_at: new Date().toISOString()
    }]
  });
  const record = Array.isArray(rows) ? rows[0] : rows;
  return sanitizeWorkspaceConnection(record);
}

async function patchWorkspaceConnection(connectionId, patch = {}) {
  if (!hasWorkspaceConnectionConfig()) {
    throw new Error('Workspace connection storage is not configured.');
  }
  const nextPatch = { ...patch, updated_at: new Date().toISOString() };
  if (nextPatch.credentials) {
    nextPatch.credentials = encryptConnectionCredentials(nextPatch.credentials);
  }
  const rows = await supabaseRest('workspace_connections', {
    method: 'PATCH',
    query: `id=eq.${encodeURIComponent(connectionId)}`,
    body: nextPatch,
    prefer: 'return=representation'
  });
  const record = Array.isArray(rows) ? rows[0] : rows;
  return sanitizeWorkspaceConnection(record);
}

async function findWorkspaceConnectionByProviderAccount(provider, predicate = () => false, { includeCredentials = false } = {}) {
  if (!hasWorkspaceConnectionConfig()) return null;
  const rows = await supabaseRest('workspace_connections', {
    query: `provider=eq.${encodeURIComponent(String(provider || '').trim().toLowerCase())}&order=updated_at.desc&select=*`,
    prefer: 'return=representation'
  }).catch(() => []);

  for (const row of toArray(rows)) {
    const next = sanitizeWorkspaceConnection({
      ...row,
      credentials: includeCredentials ? decryptConnectionCredentials(row.credentials || {}) : undefined
    }, { includeCredentials });
    if (predicate(next)) {
      return next;
    }
  }

  return null;
}

function buildGooglePubsubTopicName() {
  const rawTopic = String(env.GOOGLE_PUBSUB_TOPIC || process.env.GOOGLE_PUBSUB_TOPIC || '').trim();
  if (!rawTopic) {
    throw new Error('GOOGLE_PUBSUB_TOPIC is not configured.');
  }
  if (rawTopic.startsWith('projects/')) {
    return rawTopic;
  }
  const projectId = String(env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID || '').trim();
  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT_ID is not configured.');
  }
  return `projects/${projectId}/topics/${rawTopic}`;
}

async function exchangeGoogleRefreshToken(refreshToken = '') {
  const clientId = env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
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

async function withWorkspaceGmailAccessToken(connection, operation) {
  if (!connection) {
    throw new Error('Gmail workspace connection is missing.');
  }
  const credentials = { ...(connection.credentials || {}) };
  const applyRefresh = async () => {
    if (!credentials.refresh_token) {
      throw new Error('Gmail refresh token is missing.');
    }
    const refreshed = await exchangeGoogleRefreshToken(credentials.refresh_token);
    credentials.access_token = refreshed.access_token || credentials.access_token || '';
    if (refreshed.refresh_token) {
      credentials.refresh_token = refreshed.refresh_token;
    }
    const tokenExpiresAt = Number(refreshed.expires_in || 0)
      ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
      : connection.token_expires_at || null;
    await patchWorkspaceConnection(connection.id, {
      credentials,
      token_expires_at: tokenExpiresAt,
      last_refreshed_at: new Date().toISOString(),
      last_error_message: null,
      last_error_at: null
    }).catch(() => null);
    connection.credentials = credentials;
    connection.token_expires_at = tokenExpiresAt;
    return credentials.access_token;
  };

  let accessToken = credentials.access_token || '';
  if (!accessToken && credentials.refresh_token) {
    accessToken = await applyRefresh();
  }

  try {
    return await operation(accessToken, applyRefresh);
  } catch (error) {
    const message = String(error?.message || '');
    if ((/401/.test(message) || /403/.test(message) || /invalid_grant/i.test(message) || /expired/i.test(message) || /authenticate/i.test(message) || /auth/i.test(message)) && credentials.refresh_token) {
      accessToken = await applyRefresh();
      return operation(accessToken, applyRefresh);
    }
    throw error;
  }
}

async function gmailApiRequest(accessToken, path, { method = 'GET', query = {}, body = null, headers = {} } = {}) {
  const endpoint = new URL(`https://gmail.googleapis.com/gmail/v1/${path.replace(/^\//, '')}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    endpoint.searchParams.set(key, String(value));
  });
  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error_description || `Gmail API ${response.status}`);
  }
  return payload;
}

async function registerWorkspaceGmailWatch(workspaceId, connection) {
  const topicName = buildGooglePubsubTopicName();
  const watchResponse = await withWorkspaceGmailAccessToken(connection, async (accessToken) => gmailApiRequest(accessToken, 'users/me/watch', {
    method: 'POST',
    body: {
      topicName,
      labelIds: ['INBOX']
    }
  }));

  const watchMetadata = {
    topic_name: topicName,
    history_id: watchResponse.historyId || '',
    expiration: watchResponse.expiration ? new Date(Number(watchResponse.expiration)).toISOString() : null,
    registered_at: new Date().toISOString()
  };

  await patchWorkspaceConnection(connection.id, {
    connection_metadata: {
      ...(connection.connection_metadata || {}),
      gmail_watch: watchMetadata
    }
  }).catch(() => null);

  await syncChannelFromConnection(workspaceId, 'gmail', {
    ...connection,
    connection_metadata: {
      ...(connection.connection_metadata || {}),
      gmail_watch: watchMetadata
    }
  }, {
    status: 'configured',
    webhook_state: 'pending',
    external_metadata: {
      oauth_provider: 'google',
      connected_via: 'workspace_oauth',
      gmail_watch: watchMetadata
    }
  }).catch(() => null);

  return watchMetadata;
}

function getGmailWebhookSecretValue() {
  return String(env.GMAIL_WEBHOOK_SECRET || process.env.GMAIL_WEBHOOK_SECRET || '').trim();
}

async function listWorkspaceGmailConnectionsForRenewal() {
  if (!hasWorkspaceConnectionConfig()) {
    return [];
  }
  const rows = await supabaseRest('workspace_connections', {
    query: 'provider=eq.gmail&order=updated_at.desc&select=*',
    prefer: 'return=representation'
  }).catch(() => []);

  return toArray(rows).map((row) => sanitizeWorkspaceConnection({
    ...row,
    credentials: decryptConnectionCredentials(row.credentials || {})
  }, { includeCredentials: true }));
}

function shouldRenewGmailWatch(connection = {}) {
  const watch = connection?.connection_metadata?.gmail_watch || {};
  const registeredAt = Date.parse(watch.registered_at || connection.last_connected_at || '') || 0;
  const expirationAt = Date.parse(watch.expiration || connection.token_expires_at || '') || 0;
  const now = Date.now();
  const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (!watch.history_id) return true;
  if (!expirationAt) return true;
  if (expirationAt - now <= oneDayMs) return true;
  if (!registeredAt) return true;
  return now - registeredAt >= sixDaysMs;
}

async function renewGmailWatchForConnection(connection, { reason = 'scheduled' } = {}) {
  if (!connection?.workspace_id) {
    return { ok: false, skipped: true, reason: 'Missing workspace_id.' };
  }
  if (!shouldRenewGmailWatch(connection)) {
    return { ok: true, skipped: true, reason: 'Watch still fresh.' };
  }
  const metadata = await registerWorkspaceGmailWatch(connection.workspace_id, connection);
  emitWorkspaceMutation(connection.workspace_id, 'gmail.watch.renewed', {
    reason,
    connectionId: connection.id || '',
    metadata
  });
  return { ok: true, metadata };
}

async function runGmailWatchRenewalSweep({ reason = 'scheduled' } = {}) {
  const connections = await listWorkspaceGmailConnectionsForRenewal();
  const results = [];
  for (const connection of connections) {
    try {
      const result = await renewGmailWatchForConnection(connection, { reason });
      results.push({ workspaceId: connection.workspace_id || '', connectionId: connection.id || '', result });
    } catch (error) {
      results.push({
        workspaceId: connection.workspace_id || '',
        connectionId: connection.id || '',
        error: error?.message || String(error)
      });
    }
  }
  return results;
}

async function handleGmailWatchActivation(req, res, url) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const workspaceId = String(
      body.workspace_id
      || body.workspaceId
      || url.searchParams.get('workspace_id')
      || url.searchParams.get('workspaceId')
      || env.AURAFLOW_DEFAULT_WORKSPACE_ID
      || ''
    ).trim();
    if (!workspaceId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'workspace_id is required.' }));
      return;
    }
    const connection = await resolveWorkspaceGmailConnectionForDiagnostics(workspaceId);

    const metadata = await registerWorkspaceGmailWatch(workspaceId, connection);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      ok: true,
      workspaceId,
      connection_id: connection.id || '',
      connection_email: connection.connection_metadata?.email || connection.external_account_id || '',
      historyId: metadata.history_id || '',
      expiration: metadata.expiration || null,
      registered_at: metadata.registered_at || new Date().toISOString()
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to activate Gmail watch' }));
  }
}

async function resolveWorkspaceGmailConnectionForDiagnostics(workspaceId = '') {
  const fallbackEmail = String(
    env.GMAIL_INBOX_ADDRESS
    || process.env.GMAIL_INBOX_ADDRESS
    || env.GMAIL_FROM_EMAIL
    || process.env.GMAIL_FROM_EMAIL
    || ''
  ).trim();
  const fallbackAccessToken = String(env.GMAIL_ACCESS_TOKEN || process.env.GMAIL_ACCESS_TOKEN || '').trim();
  const fallbackRefreshToken = String(env.GMAIL_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN || '').trim();
  let connection = workspaceId
    ? await getWorkspaceConnection(workspaceId, 'gmail', { includeCredentials: true })
    : null;

  if (!connection) {
    if (!fallbackEmail || (!fallbackAccessToken && !fallbackRefreshToken)) {
      throw new Error('No Gmail connection found for this workspace and no env fallback is available.');
    }

    const fallbackConnection = await upsertWorkspaceConnection(workspaceId, {
      provider: 'gmail',
      connection_type: 'oauth',
      status: 'connected',
      display_name: fallbackEmail,
      external_account_id: fallbackEmail,
      external_account_label: fallbackEmail,
      connection_metadata: {
        email: fallbackEmail,
        source: 'env-fallback'
      },
      credentials: {
        access_token: fallbackAccessToken,
        refresh_token: fallbackRefreshToken
      },
      last_connected_at: new Date().toISOString()
    });

    connection = fallbackConnection;
  }

  if (fallbackEmail && fallbackRefreshToken) {
    connection = {
      ...connection,
      display_name: fallbackEmail,
      external_account_id: fallbackEmail,
      external_account_label: fallbackEmail,
      credentials: {
        ...(connection.credentials || {}),
        access_token: '',
        refresh_token: fallbackRefreshToken
      },
      connection_metadata: {
        ...(connection.connection_metadata || {}),
        email: fallbackEmail,
        source: 'env-fallback'
      }
    };
  }

  return connection;
}

async function handleGmailDiagnostics(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const workspaceId = String(
      body.workspace_id
      || body.workspaceId
      || url.searchParams.get('workspace_id')
      || url.searchParams.get('workspaceId')
      || env.AURAFLOW_DEFAULT_WORKSPACE_ID
      || ''
    ).trim();

    if (!workspaceId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'workspace_id is required.' }));
      return;
    }

    const connection = await resolveWorkspaceGmailConnectionForDiagnostics(workspaceId);
    const diagnostics = await withWorkspaceGmailAccessToken(connection, async (accessToken) => {
      const [profile, tokenInfoResponse] = await Promise.all([
        gmailApiRequest(accessToken, 'users/me/profile'),
        fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`)
      ]);

      const tokenInfo = await readJsonResponse(tokenInfoResponse);
      const scopes = String(tokenInfo.scope || '')
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean);

      let watchProbe = null;
      try {
        watchProbe = await gmailApiRequest(accessToken, 'users/me/watch', {
          method: 'POST',
          body: {
            topicName: buildGooglePubsubTopicName(),
            labelIds: ['INBOX']
          }
        });
      } catch (error) {
        watchProbe = {
          ok: false,
          error: error?.message || String(error)
        };
      }

      return {
        ok: true,
        connection_email: connection.connection_metadata?.email || connection.external_account_id || '',
        gmail_profile_email: profile?.emailAddress || '',
        messages_total: Number(profile?.messagesTotal || 0),
        threads_total: Number(profile?.threadsTotal || 0),
        history_id: String(profile?.historyId || ''),
        token_audience: String(tokenInfo.aud || ''),
        token_scope_count: scopes.length,
        token_scopes: scopes,
        token_expires_in: Number(tokenInfo.expires_in || 0) || null,
        watch_probe: watchProbe?.historyId
          ? {
            ok: true,
            historyId: String(watchProbe.historyId || ''),
            expiration: watchProbe.expiration ? new Date(Number(watchProbe.expiration)).toISOString() : null
          }
          : watchProbe
      };
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(diagnostics));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to run Gmail diagnostics' }));
  }
}

async function handleGmailPubsubWebhook(req, res, url) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const expectedSecret = getGmailWebhookSecretValue();
  const providedSecret = String(url.searchParams.get('secret') || url.searchParams.get('verify_secret') || '').trim();
  if (!expectedSecret || providedSecret !== expectedSecret) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Invalid Gmail webhook secret.' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const workspaceId = String(
      body.workspace_id
      || body.workspaceId
      || url.searchParams.get('workspace_id')
      || url.searchParams.get('workspaceId')
      || env.AURAFLOW_DEFAULT_WORKSPACE_ID
      || ''
    ).trim();
    const result = await ingestGmailPubsubNotification('gmail', workspaceId, body);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      ok: true,
      ...result
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to process Gmail webhook' }));
  }
}

function decodePubsubMessageData(data = '') {
  if (!data) return {};
  try {
    return JSON.parse(Buffer.from(String(data), 'base64').toString('utf8'));
  } catch {
    return {};
  }
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
      const text = decodeGmailBody(part);
      if (text) return text;
    }
  }
  for (const part of parts) {
    const nested = extractGmailMessageBody(part);
    if (nested) return nested;
  }
  return '';
}

function parseMailboxIdentity(rawValue = '') {
  const value = String(rawValue || '').trim();
  const emailMatch = value.match(/<([^>]+)>/);
  const email = (emailMatch ? emailMatch[1] : value).trim();
  const name = value.includes('<') ? value.slice(0, value.indexOf('<')).replace(/^"|"$/g, '').trim() : email;
  return { email, name: name || email };
}

function normalizeGmailEnvelopeFromMessage(workspaceId, accountEmail, message = {}) {
  const threadId = String(message.threadId || '').trim() || `gmail:${message.id || 'thread'}`;
  const subject = getGmailHeader(message, 'Subject') || message.snippet || 'Incoming thread';
  const from = parseMailboxIdentity(getGmailHeader(message, 'From'));
  const body = extractGmailMessageBody(message.payload || {}) || message.snippet || subject;
  const deliveredAt = getGmailHeader(message, 'Date') || message.internalDate || new Date().toISOString();

  return {
    provider: 'gmail',
    workspaceId,
    accountId: accountEmail,
    eventType: 'gmail.message.received',
    headers: {
      authorization: 'Bearer pubsub-relay'
    },
    payload: {
      threadId,
      messageId: message.id || '',
      subject,
      snippet: message.snippet || body.slice(0, 180),
      from: {
        email: from.email,
        name: from.name
      },
      messages: [{
        id: message.id || `${threadId}:message:1`,
        direction: 'inbound',
        senderName: from.name,
        body,
        createdAt: deliveredAt,
        rawPayload: message
      }]
    }
  };
}

async function ingestGmailPubsubNotification(provider, workspaceIdHint, body = {}) {
  const envelope = body?.message?.data ? decodePubsubMessageData(body.message.data) : body;
  const accountEmail = String(envelope.emailAddress || envelope.email || '').trim().toLowerCase();
  const historyId = String(envelope.historyId || envelope.history_id || '').trim();
  let connection = workspaceIdHint
    ? await getWorkspaceConnection(workspaceIdHint, 'gmail', { includeCredentials: true }).catch(() => null)
    : null;

  if (!connection && accountEmail) {
    connection = await findWorkspaceConnectionByProviderAccount(
      'gmail',
      (item) => String(item.connection_metadata?.email || item.external_account_id || '').trim().toLowerCase() === accountEmail,
      { includeCredentials: true }
    );
  }

  if (!connection) {
    const gmailConnections = await supabaseRest('workspace_connections', {
      query: 'provider=eq.gmail&order=updated_at.desc&select=*',
      prefer: 'return=representation'
    }).catch(() => []);
    const sanitizedConnections = toArray(gmailConnections).map((row) => sanitizeWorkspaceConnection({
      ...row,
      credentials: decryptConnectionCredentials(row.credentials || {})
    }, { includeCredentials: true }));

    if (workspaceIdHint) {
      connection = sanitizedConnections.find((item) => String(item.workspace_id || '').trim() === String(workspaceIdHint || '').trim()) || null;
    }

    if (!connection && sanitizedConnections.length === 1) {
      connection = sanitizedConnections[0];
    }
  }

  if (!connection) {
    throw new Error('No Gmail workspace connection matched the incoming Pub/Sub notification.');
  }

  const workspaceId = String(connection.workspace_id || workspaceIdHint || '').trim();
  const channelRows = hasSupabaseAdminConfig()
    ? await supabaseRest('channels', {
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&provider=eq.gmail&select=*`,
      prefer: 'return=representation'
    }).catch(() => [])
    : [];
  const channel = Array.isArray(channelRows) ? channelRows[0] : channelRows;
  const priorHistoryId = String(
    channel?.external_metadata?.gmail_watch?.history_id ||
    connection.connection_metadata?.gmail_watch?.history_id ||
    ''
  ).trim();

  let messageIds = [];
  if (priorHistoryId && historyId && priorHistoryId !== historyId) {
    const historyResponse = await withWorkspaceGmailAccessToken(connection, async (accessToken) => gmailApiRequest(accessToken, 'users/me/history', {
      query: {
        startHistoryId: priorHistoryId,
        historyTypes: 'messageAdded'
      }
    }));
    messageIds = (historyResponse.history || []).flatMap((entry) => Array.isArray(entry.messagesAdded)
      ? entry.messagesAdded.map((item) => item?.message?.id).filter(Boolean)
      : []);
  }

  if (!messageIds.length) {
    const messagesResponse = await withWorkspaceGmailAccessToken(connection, async (accessToken) => gmailApiRequest(accessToken, 'users/me/messages', {
      query: {
        labelIds: 'INBOX',
        maxResults: 5
      }
    }));
    messageIds = (messagesResponse.messages || []).map((item) => item.id).filter(Boolean);
  }

  const ingested = [];
  for (const messageId of messageIds.slice(0, 10)) {
    const gmailMessage = await withWorkspaceGmailAccessToken(connection, async (accessToken) => gmailApiRequest(accessToken, `users/me/messages/${encodeURIComponent(messageId)}`, {
      query: { format: 'full' }
    }));
    const normalized = normalizeWebhookPayload(normalizeGmailEnvelopeFromMessage(workspaceId, accountEmail, gmailMessage));
    const result = await ingestCanonicalWebhookEvent({
      provider,
      workspaceId,
      normalized,
      verification: {
        provider: 'gmail',
        transport: 'pubsub-push',
        verified: true,
        signed: true,
        authHeaderPresent: true,
        note: 'Ingested from Gmail Pub/Sub notification.'
      },
      registerReplay: false,
      enqueueJob: true,
      source: 'gmail-pubsub'
    });
    ingested.push({ messageId, result });
  }

  const eventTime = new Date().toISOString();
  const watchMetadata = {
    ...(connection.connection_metadata?.gmail_watch || {}),
    history_id: historyId || priorHistoryId,
    last_notification_at: eventTime,
    webhook_verified_at: eventTime
  };
  await patchWorkspaceConnection(connection.id, {
    connection_metadata: {
      ...(connection.connection_metadata || {}),
      gmail_watch: watchMetadata,
      last_webhook_at: eventTime,
      last_provider_event: 'gmail.pubsub.push',
      webhook_verified_at: eventTime,
      webhook_state: 'verified'
    },
    last_error_message: null,
    last_error_at: null
  }).catch(() => null);
  await syncChannelFromConnection(workspaceId, 'gmail', {
    ...connection,
    connection_metadata: {
      ...(connection.connection_metadata || {}),
      gmail_watch: watchMetadata,
      webhook_verified_at: new Date().toISOString(),
      webhook_state: 'verified'
    }
  }, {
    status: 'configured',
    webhook_state: 'verified',
    external_metadata: {
      oauth_provider: 'google',
      connected_via: 'workspace_oauth',
      gmail_watch: watchMetadata,
      last_webhook_at: eventTime,
      last_provider_event: 'gmail.pubsub.push',
      last_webhook_verification: 'verified'
    },
    last_sync_at: eventTime,
    last_webhook_at: eventTime
  }).catch(() => null);

  return {
    ok: true,
    workspaceId,
    accountEmail,
    historyId: historyId || priorHistoryId,
    ingested: ingested.length
  };
}

async function syncChannelFromConnection(workspaceId, provider, connection = {}, extra = {}) {
  const providerKey = String(provider || '').trim().toLowerCase();
  const existingRows = hasSupabaseAdminConfig()
    ? await supabaseRest('channels', {
      method: 'GET',
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&provider=eq.${encodeURIComponent(providerKey)}&limit=1`
    }).catch(() => [])
    : [];
  const existing = hasSupabaseAdminConfig()
    ? (Array.isArray(existingRows) ? existingRows[0] : existingRows)
    : listDemoCollection(workspaceId, 'channels').find((item) => String(item.provider || '').toLowerCase() === providerKey);
  const mergedRelaySetup = {
    ...(existing?.relay_setup || existing?.external_metadata?.relay_setup || {}),
    ...(extra.relay_setup || extra.external_metadata?.relay_setup || {})
  };
  const mergedExternalMetadata = {
    ...(existing?.external_metadata || {}),
    ...(extra.external_metadata || {}),
    connection_id: connection.id || existing?.external_metadata?.connection_id || '',
    connection_provider: connection.provider || providerKey,
    connection_display_name: connection.display_name || existing?.external_metadata?.connection_display_name || '',
    connection_metadata: {
      ...(existing?.external_metadata?.connection_metadata || {}),
      ...(connection.connection_metadata || {})
    }
  };
  if (Object.keys(mergedRelaySetup).length) {
    mergedExternalMetadata.relay_setup = mergedRelaySetup;
  }

  const channelPayload = {
    workspace_id: workspaceId,
    provider: providerKey,
    channel_type: providerKey === 'gmail' ? 'email' : providerKey,
    display_name: connection.display_name || extra.display_name || existing?.display_name || providerKey.toUpperCase(),
    status: extra.status || existing?.status || 'configured',
    provider_account_id: connection.external_account_id || extra.provider_account_id || '',
    connection_state: extra.connection_state || connection.status || existing?.connection_state || 'connected',
    webhook_state: extra.webhook_state || existing?.webhook_state || 'pending',
    relay_setup: mergedRelaySetup,
    token_health: {
      provider: providerKey,
      status: connection.status === 'connected' ? 'healthy' : connection.status || 'unknown'
    },
    external_metadata: mergedExternalMetadata,
    last_webhook_at: extra.last_webhook_at || mergedExternalMetadata.last_webhook_at || existing?.last_webhook_at || null,
    last_sync_at: extra.last_sync_at || existing?.last_sync_at || null
  };

  if (hasSupabaseAdminConfig()) {
    try {
      const rows = await supabaseRest('channels', {
        method: 'POST',
        query: 'on_conflict=workspace_id,provider',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: [channelPayload]
      });
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      const message = String(error?.message || '');
      const conflictTargetMissing = message.includes('"code":"42P10"') || message.includes('no unique or exclusion constraint matching the ON CONFLICT specification');
      if (!conflictTargetMissing) {
        throw error;
      }

      const existingRows = await supabaseRest('channels', {
        method: 'GET',
        query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&provider=eq.${encodeURIComponent(providerKey)}&limit=1`
      });
      const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
      if (existing?.id) {
        const updatedRows = await supabaseRest('channels', {
          method: 'PATCH',
          query: `id=eq.${encodeURIComponent(existing.id)}`,
          prefer: 'return=representation',
          body: channelPayload
        });
        return Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
      }

      const createdRows = await supabaseRest('channels', {
        method: 'POST',
        prefer: 'return=representation',
        body: [channelPayload]
      });
      return Array.isArray(createdRows) ? createdRows[0] : createdRows;
    }
  }

  return existing?.id
    ? patchDemoCollectionRecord('channels', existing.id, channelPayload)
    : createDemoCollectionRecord(workspaceId, 'channels', channelPayload);
}

async function patchWorkspaceChannelByProvider(workspaceId, provider, patch = {}) {
  const providerKey = String(provider || '').trim().toLowerCase();
  if (!workspaceId || !providerKey) return null;

  if (hasSupabaseAdminConfig()) {
    const existingRows = await supabaseRest('channels', {
      method: 'GET',
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&provider=eq.${encodeURIComponent(providerKey)}&limit=1`
    }).catch(() => []);
    const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
    if (!existing?.id) return null;
    const updatedRows = await supabaseRest('channels', {
      method: 'PATCH',
      query: `id=eq.${encodeURIComponent(existing.id)}`,
      prefer: 'return=representation',
      body: patch
    });
    return Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
  }

  const existing = listDemoCollection(workspaceId, 'channels').find((item) => String(item.provider || '').toLowerCase() === providerKey);
  return existing?.id ? patchDemoCollectionRecord('channels', existing.id, patch) : null;
}

async function markWorkspaceProviderInboundEvent(workspaceId, provider, normalized = {}) {
  const providerKey = String(provider || '').trim().toLowerCase();
  if (!workspaceId || !providerKey) return;

  const eventTime = new Date().toISOString();
  const eventType = String(normalized?.eventType || `${providerKey}.message.received`).trim();
  const verification = normalized?.verification || {};
  const verified = Boolean(
    verification.verified
    || verification.signatureVerified
    || verification.authHeaderPresent
    || verification.internalRelay
  );

  let connection = null;
  try {
    const connections = await listWorkspaceConnections(workspaceId);
    connection = connections.find((item) => String(item.provider || '').toLowerCase() === providerKey) || null;
    if (!connection && providerKey === 'whatsapp') {
      const metaConnection = connections.find((item) => ['messenger', 'instagram'].includes(String(item.provider || '').toLowerCase()));
      if (metaConnection) {
        connection = {
          ...metaConnection,
          provider: 'whatsapp',
          display_name: metaConnection.display_name || 'WhatsApp business binding',
          status: 'pending',
          external_account_id: String(
            env.WHATSAPP_PHONE_NUMBER_ID
            || process.env.WHATSAPP_PHONE_NUMBER_ID
            || env.WHATSAPP_BUSINESS_ACCOUNT_ID
            || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
            || ''
          ).trim(),
          connection_metadata: {
            ...(metaConnection.connection_metadata || {}),
            root_provider: 'meta',
            binding_state: metaConnection.connection_metadata?.binding_state || 'pending_business_binding',
            phone_number_id: String(env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
            whatsapp_business_account_id: String(env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim()
          }
        };
      }
    }
  } catch {
    connection = null;
  }

  if (connection?.id) {
    await patchWorkspaceConnection(connection.id, {
      connection_metadata: {
        ...(connection.connection_metadata || {}),
        last_webhook_at: eventTime,
        last_provider_event: eventType,
        ...(verified ? { webhook_verified_at: eventTime, webhook_state: 'verified' } : {})
      },
      last_connected_at: connection.last_connected_at || eventTime
    }).catch(() => null);
  }

  const externalMetadata = {
    ...(connection?.connection_metadata || {}),
    last_webhook_at: eventTime,
    last_provider_event: eventType,
    ...(verified ? { webhook_verified_at: eventTime, webhook_state: 'verified' } : {})
  };

  if (connection) {
    await syncChannelFromConnection(workspaceId, providerKey, connection, {
      status: 'configured',
      connection_state: providerKey === 'whatsapp'
        ? (verified ? 'connected' : connection.status || 'pending')
        : connection.status || 'connected',
      webhook_state: verified ? 'verified' : 'pending',
      last_sync_at: eventTime,
      last_webhook_at: eventTime,
      external_metadata: externalMetadata,
      relay_setup: {
        ...(providerKey === 'whatsapp' ? {
          provider: 'whatsapp',
          oauth_provider: 'meta',
          relay_status: verified ? 'verified' : 'saved'
        } : {})
      }
    }).catch(() => null);
    return;
  }

  await patchWorkspaceChannelByProvider(workspaceId, providerKey, {
    webhook_state: verified ? 'verified' : 'pending',
    connection_state: providerKey === 'whatsapp' && verified ? 'connected' : undefined,
    last_webhook_at: eventTime,
    last_sync_at: eventTime,
    external_metadata: externalMetadata
  }).catch(() => null);
}

function verifyProviderInboundRequest(provider, body = {}, rawText = '', headers = {}, requestUrl = '') {
  const providerKey = String(provider || '').trim().toLowerCase();
  const normalizedHeaders = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key || '').toLowerCase(), value]));
  const internalRelay = validateIngestSecret(normalizedHeaders);

  if (internalRelay) {
    return {
      verified: true,
      reason: 'Validated with AuraFlow ingest secret.',
      signed: true,
      internalRelay: true
    };
  }

  if (['whatsapp', 'instagram', 'messenger', 'facebook'].includes(providerKey)) {
    if (looksLikeTwilioConversationsPayload(body, normalizedHeaders)) {
      return {
        ...verifyTwilioWebhookSignature(requestUrl, body, normalizedHeaders),
        internalRelay: false
      };
    }
    if (isUnsignedPreviewWebhook(providerKey, body, normalizedHeaders)) {
      return {
        verified: true,
        reason: 'Local preview seed webhook accepted without Meta signature.',
        signed: false,
        internalRelay: false
      };
    }
    return {
      ...verifyMetaWebhookSignature(rawText, normalizedHeaders),
      internalRelay: false
    };
  }

  if (providerKey === 'gmail') {
    const pubsubShape = Boolean(body?.message?.data);
    const pubsubAuth = String(
      normalizedHeaders.authorization
      || normalizedHeaders['x-goog-authenticated-user-email']
      || normalizedHeaders['x-goog-authenticated-user-id']
      || ''
    ).trim();
    if (pubsubShape) {
      return {
        verified: true,
        reason: pubsubAuth
          ? 'Accepted Gmail Pub/Sub push with authenticated relay headers.'
          : 'Accepted Gmail Pub/Sub push payload. Configure authenticated push headers in production.',
        signed: Boolean(pubsubAuth),
        internalRelay: false
      };
    }
    return {
      verified: false,
      reason: 'Gmail inbound must arrive as a Pub/Sub push payload or through the internal ingest relay.',
      signed: false,
      internalRelay: false
    };
  }

  return {
    verified: false,
    reason: 'Unknown inbound provider verification path.',
    signed: false,
    internalRelay: false
  };
}

function getRequestOrigin(req) {
  const host = String(req.headers.host || `localhost:${port}`).trim();
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').trim();
  const protocol = forwardedProto || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

function buildSupabaseHeaders(serviceKey, schema) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Profile': schema || 'public',
    'Content-Profile': schema || 'public'
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

async function supabaseRest(pathname, { method = 'GET', body = null, query = '', prefer = 'return=representation' } = {}) {
  const { url, serviceKey, schema } = getSupabaseAdminConfig();
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
      ...buildSupabaseHeaders(serviceKey, schema),
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return readJsonResponse(response);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildConversationMessageIndex(messages = []) {
  return toArray(messages).reduce((acc, message) => {
    const conversationId = String(message?.conversation_id || '').trim();
    if (!conversationId) return acc;
    if (!acc.has(conversationId)) acc.set(conversationId, []);
    acc.get(conversationId).push(message);
    return acc;
  }, new Map());
}

function deriveConversationRoutingTarget(conversation = {}, contact = null, messages = []) {
  const provider = String(conversation?.source_provider || conversation?.source || '').trim().toLowerCase();
  const contactIdentities = Array.isArray(contact?.metadata?.identities) ? contact.metadata.identities : [];
  const matchingIdentity = contactIdentities.find((identity) => String(identity?.provider || '').trim().toLowerCase() === provider) || null;
  const inboundMessages = toArray(messages)
    .filter((item) => String(item?.direction || '').trim().toLowerCase() === 'inbound')
    .sort((left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime());
  const latestInbound = inboundMessages[0] || null;
  const rawPayload = latestInbound?.raw_payload || latestInbound?.rawPayload || {};
  const nestedSenderId = rawPayload?.sender?.id || rawPayload?.from?.id || '';
  const nestedSenderEmail = rawPayload?.sender?.email || rawPayload?.from?.email || '';
  const nestedSenderPhone = rawPayload?.sender?.phone || rawPayload?.from?.phone || rawPayload?.from?.wa_id || '';

  const recipientId = String(
    conversation?.recipient_id
    || conversation?.recipientId
    || matchingIdentity?.external_identity_id
    || rawPayload?.recipient_id
    || rawPayload?.contact_external_id
    || nestedSenderId
    || contact?.external_contact_id
    || ''
  ).trim();
  const recipientEmail = String(
    conversation?.recipient_email
    || conversation?.recipientEmail
    || matchingIdentity?.email
    || rawPayload?.recipient_email
    || rawPayload?.contact_email
    || nestedSenderEmail
    || contact?.email
    || ''
  ).trim();
  const recipientPhone = String(
    conversation?.recipient_phone
    || conversation?.recipientPhone
    || matchingIdentity?.phone
    || rawPayload?.recipient_phone
    || rawPayload?.contact_phone
    || nestedSenderPhone
    || contact?.phone
    || contact?.external_contact_id
    || ''
  ).trim();
  const hasTwilioConversationRecipient = /^CH[0-9a-f]{32}$/i.test(recipientId);
  const isPublicTestRecipient = /public/i.test(recipientId);
  const replyTargetStatus = provider === 'instagram' || provider === 'messenger'
    ? (hasTwilioConversationRecipient ? 'ready' : recipientId ? 'placeholder' : 'missing')
    : provider === 'gmail'
      ? (recipientEmail ? 'ready' : 'missing')
      : provider === 'whatsapp'
        ? (recipientPhone ? 'ready' : 'missing')
        : 'unknown';
  const replyTargetNote = provider === 'instagram' || provider === 'messenger'
    ? hasTwilioConversationRecipient
      ? 'Real Twilio Conversation SID captured from inbound traffic.'
      : recipientId
        ? isPublicTestRecipient
          ? 'This is a public test thread, not a real Twilio conversation. Live replies will not work until a real Instagram or Messenger thread lands in AuraFlow through Twilio.'
          : 'This thread is using a test or placeholder routing ID. A real inbound Twilio conversation is still needed before live replies will work.'
        : 'No Twilio Conversation SID has been captured for this thread yet.'
    : provider === 'gmail'
      ? recipientEmail
        ? 'Reply target is using the linked contact email.'
        : 'No recipient email is available for this Gmail thread.'
      : provider === 'whatsapp'
        ? recipientPhone
          ? 'Reply target is using the linked contact phone number.'
          : 'No recipient phone number is available for this WhatsApp thread.'
        : 'Manual routing will be used for this thread.';

  return {
    recipient_id: provider === 'instagram' || provider === 'messenger' ? recipientId : (conversation?.recipient_id || conversation?.recipientId || ''),
    recipient_email: provider === 'gmail' ? recipientEmail : (conversation?.recipient_email || conversation?.recipientEmail || ''),
    recipient_phone: provider === 'whatsapp' ? recipientPhone : (conversation?.recipient_phone || conversation?.recipientPhone || ''),
    reply_target_identity_id: matchingIdentity?.id || null,
    reply_target_status: replyTargetStatus,
    reply_target_note: replyTargetNote
  };
}

function enrichConversationRouting(conversations = [], contacts = [], messages = []) {
  const contactsById = new Map(toArray(contacts).map((item) => [item.id, item]));
  const messagesByConversation = buildConversationMessageIndex(messages);
  return toArray(conversations).map((conversation) => ({
    ...conversation,
    ...deriveConversationRoutingTarget(
      conversation,
      contactsById.get(conversation?.contact_id) || null,
      messagesByConversation.get(conversation?.id) || []
    )
  }));
}

async function loadWorkspaceSnapshot(workspaceId) {
  const [
    members,
    contacts,
    contactIdentities,
    leads,
    trainingSources,
    conversations,
    messages,
    channels,
    connections,
    agents,
    followUpSequences,
    voiceProfiles,
    voiceSessions,
    voiceNotes,
    workspaceKnowledge,
    activityEvents,
    reliabilityEvents,
    messageTemplates
  ] = await Promise.all([
    supabaseRest('workspace_members', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=created_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('contacts', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('contact_identities', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('leads', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('training_sources', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('conversations', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('messages', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=created_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('channels', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    listWorkspaceConnections(workspaceId).catch(() => []),
    supabaseRest('agents', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('follow_up_sequences', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('voice_profiles', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('voice_sessions', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('voice_notes', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('workspace_knowledge', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('activity_events', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=created_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('reliability_events', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=created_at.desc&select=*`, prefer: 'return=representation' }).catch(() => []),
    supabaseRest('message_templates', { query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`, prefer: 'return=representation' }).catch(() => [])
  ]);
  const contactIdentityRows = toArray(contactIdentities);
  const identitiesByContactId = new Map();
  for (const identity of contactIdentityRows) {
    const key = String(identity.contact_id || '').trim();
    if (!key) continue;
    const existing = identitiesByContactId.get(key) || [];
    existing.push(identity);
    identitiesByContactId.set(key, existing);
  }
  const contactRows = toArray(contacts).map((contact) => ({
    ...contact,
    metadata: {
      ...(contact.metadata || {}),
      identities: identitiesByContactId.get(String(contact.id || '').trim()) || []
    }
  }));
  const messageRows = toArray(messages);
  const conversationRows = enrichConversationRouting(toArray(conversations), contactRows, messageRows);
  const syncJobs = listWorkspaceJobs(workspaceId);
  const replayDiagnostics = getWebhookReplayDiagnostics(workspaceId);
  const jobCounts = syncJobs.reduce((acc, job) => {
    const status = String(job.status || 'queued').toLowerCase();
    acc.total += 1;
    if (status === 'queued') acc.queued += 1;
    else if (status === 'retrying') acc.retrying += 1;
    else if (status === 'failed') acc.failed += 1;
    else if (status === 'completed') acc.completed += 1;
    else if (status === 'escalated') acc.escalated += 1;
    else if (status === 'assigned') acc.assigned += 1;
    return acc;
  }, { total: 0, queued: 0, retrying: 0, failed: 0, completed: 0, escalated: 0, assigned: 0 });

  return {
    members: toArray(members),
    contacts: contactRows,
    contactIdentities: contactIdentityRows,
    leads: toArray(leads),
    trainingSources: toArray(trainingSources),
    conversations: conversationRows,
    messages: messageRows,
    channels: toArray(channels),
    connections: toArray(connections),
    agents: toArray(agents),
    sequences: toArray(followUpSequences),
      voiceProfiles: toArray(voiceProfiles),
      voiceSessions: toArray(voiceSessions),
      voiceNotes: toArray(voiceNotes),
      messageTemplates: toArray(messageTemplates),
      workspaceKnowledge: toArray(workspaceKnowledge),
      activityEvents: toArray(activityEvents),
    reliabilityEvents: toArray(reliabilityEvents),
    syncJobs,
    workflowQueue: syncJobs.filter((job) => String(job.type || '').startsWith('workflow.')),
    reliability: {
      summary: {
        jobCounts,
        replayCounts: replayDiagnostics,
        hasRetryingJobs: jobCounts.retrying > 0,
        hasFailedJobs: jobCounts.failed > 0
      },
      recentFailures: syncJobs.filter((job) => ['retrying', 'failed'].includes(String(job.status || '').toLowerCase())).slice(0, 8),
      recentReplays: Array.isArray(replayDiagnostics.items) ? replayDiagnostics.items.slice(0, 8) : [],
      recentReliabilityEvents: toArray(reliabilityEvents).slice(0, 8)
    }
  };
}

async function handleWorkspacePhoneHealthBackfill(req, res, workspaceId) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const contacts = hasSupabaseAdminConfig()
      ? await supabaseRest('contacts', {
        query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`,
        prefer: 'return=representation'
      }).catch(() => [])
      : listDemoCollection('contacts').filter((item) => String(item.workspace_id || item.workspaceId || '').trim() === workspaceId);

    const results = {
      total: Array.isArray(contacts) ? contacts.length : 0,
      processed: 0,
      enriched: 0,
      skippedMissingPhone: 0,
      unchanged: 0,
      failed: 0,
      carriers: {}
    };

    for (const contact of Array.isArray(contacts) ? contacts : []) {
      const enrichment = await enrichExistingContactPhoneHealth(contact).catch((error) => ({
        changed: false,
        skipped: false,
        reason: 'error',
        error
      }));

      if (enrichment?.reason === 'missing_phone') {
        results.skippedMissingPhone += 1;
        continue;
      }
      if (enrichment?.reason === 'unchanged') {
        results.unchanged += 1;
        continue;
      }
      if (!enrichment?.changed || !enrichment?.patch) {
        results.failed += 1;
        continue;
      }

      const updated = hasSupabaseAdminConfig()
        ? await supabaseRest('contacts', {
          method: 'PATCH',
          query: `id=eq.${encodeURIComponent(contact.id)}`,
          body: enrichment.patch,
          prefer: 'return=representation'
        })
        : patchDemoCollectionRecord('contacts', contact.id, enrichment.patch);
      const record = Array.isArray(updated) ? updated[0] : updated;
      const carrier = String(record?.metadata?.phone_health?.carrier_name || record?.metadata?.phone_lookup?.carrier_name || '').trim();
      if (carrier) {
        results.carriers[carrier] = Number(results.carriers[carrier] || 0) + 1;
      }
      results.processed += 1;
      results.enriched += 1;
    }

    emitWorkspaceMutation(workspaceId, 'contacts.phone_health_backfilled', {
      workspaceId,
      summary: results
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ workspaceId, ...results }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to backfill contact phone health.' }));
  }
}

async function handleChannelCollection(req, res, workspaceId) {
  if (req.method === 'GET') {
    try {
      const rows = hasSupabaseAdminConfig()
        ? await supabaseRest('channels', {
          query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`
        })
        : listDemoCollection(workspaceId, 'channels');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(toArray(rows)));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: error?.message || 'Failed to load channels' }));
    }
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const rows = hasSupabaseAdminConfig()
      ? await supabaseRest('channels', {
        method: 'POST',
        query: 'on_conflict=workspace_id,provider',
        body: [{
          workspace_id: workspaceId,
          provider: body.provider || '',
          channel_type: body.channel_type || body.channelType || 'email',
          display_name: body.display_name || body.displayName || body.provider || 'Channel',
          status: body.status || 'configured',
          provider_account_id: body.provider_account_id || body.providerAccountId || '',
          external_metadata: body.external_metadata || body.externalMetadata || {}
        }]
      })
      : createDemoCollectionRecord(workspaceId, 'channels', body);
    const record = Array.isArray(rows) ? rows[0] : rows;
    enqueueWorkspaceJob(workspaceId, 'channel.create', { channel: record, body });
    emitWorkspaceMutation(workspaceId, 'channel.created', { record, body });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(record));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to create channel' }));
  }
}

async function handleChannelRecord(req, res, channelId) {
  if (req.method !== 'PATCH') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const rows = hasSupabaseAdminConfig()
      ? await supabaseRest('channels', {
        method: 'PATCH',
        query: `id=eq.${encodeURIComponent(channelId)}`,
        body,
        prefer: 'return=representation'
      })
      : patchDemoCollectionRecord('channels', channelId, body);
    const record = Array.isArray(rows) ? rows[0] : rows;
    enqueueWorkspaceJob(record?.workspace_id || body.workspace_id || body.workspaceId, 'channel.update', { channel: record, body });
    emitWorkspaceMutation(record?.workspace_id || body.workspace_id || body.workspaceId, 'channel.updated', { record, body });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(record));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to update channel' }));
  }
}

async function handleWorkspaceSnapshot(req, res, workspaceId) {
  try {
    let snapshot;
    if (hasSupabaseAdminConfig()) {
      try {
        snapshot = await loadWorkspaceSnapshot(workspaceId);
      } catch (error) {
        console.warn('Supabase workspace snapshot load failed, falling back to demo data.', error);
        snapshot = loadDemoWorkspaceSnapshot(workspaceId);
      }
    } else {
      snapshot = loadDemoWorkspaceSnapshot(workspaceId);
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(snapshot));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to load workspace snapshot' }));
  }
}

async function handleWorkspaceCollectionRoot(req, res) {
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url, 'http://localhost');
      const userId = url.searchParams.get('user_id') || '';
      let workspaces;
      if (hasSupabaseAdminConfig()) {
        try {
          workspaces = toArray(await supabaseRest('workspace_members', {
            query: `${userId ? `user_id=eq.${encodeURIComponent(userId)}&` : ''}select=workspace:workspaces(*),user_id&order=created_at.desc`
          })).map((row) => row.workspace).filter(Boolean);
        } catch (error) {
          console.warn('Supabase workspace list failed, falling back to demo data.', error);
          workspaces = listDemoWorkspaces(userId);
        }
      } else {
        workspaces = listDemoWorkspaces(userId);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(workspaces));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: error?.message || 'Failed to load workspaces' }));
    }
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    let rows;
    if (hasSupabaseAdminConfig()) {
      try {
        rows = await supabaseRest('workspaces', {
          method: 'POST',
          body: [{
            name: body.name || 'AuraFlow Workspace',
            slug: body.slug || (body.name || 'auraflow-workspace').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            plan: body.plan || 'starter'
          }]
        });
      } catch (error) {
        console.warn('Supabase workspace create failed, falling back to demo data.', error);
        rows = createDemoWorkspace(body);
      }
    } else {
      rows = createDemoWorkspace(body);
    }
    const record = Array.isArray(rows) ? rows[0] : rows;
    enqueueWorkspaceJob(record?.id || record?.workspace_id, 'workspace.create', { workspace: record, body });
    emitWorkspaceMutation(record?.id || record?.workspace_id, 'workspace.created', { record, body });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(record));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to create workspace' }));
  }
}

async function handleWorkspaceMemberCollection(req, res, workspaceId) {
  if (req.method === 'GET') {
    try {
      const rows = hasSupabaseAdminConfig()
        ? await supabaseRest('workspace_members', {
          query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&select=*&order=created_at.desc`
        })
        : listDemoWorkspaceMembers(workspaceId);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(toArray(rows)));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: error?.message || 'Failed to load workspace members' }));
    }
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const rows = hasSupabaseAdminConfig()
      ? await supabaseRest('workspace_members', {
        method: 'POST',
        body: [{
          workspace_id: workspaceId,
          user_id: body.user_id || body.userId || '',
          role: body.role || 'owner'
        }]
      })
      : createDemoWorkspaceMember(workspaceId, body);
    const record = Array.isArray(rows) ? rows[0] : rows;
    enqueueWorkspaceJob(workspaceId, 'workspace.member.create', { member: record, body });
    emitWorkspaceMutation(workspaceId, 'workspace.member.created', { record, body });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(record));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to create workspace member' }));
  }
}

async function handleChannelConnectSession(req, res, workspaceId) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const provider = String(body.provider || body.channel || '').trim().toLowerCase();
    const result = await createWorkspaceOAuthSession(req, workspaceId, provider, body);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to create connect session' }));
  }
}

async function handleWorkspaceConnectionCollection(req, res, workspaceId) {
  if (req.method === 'GET') {
    try {
      const rows = hasWorkspaceConnectionConfig()
        ? await listWorkspaceConnections(workspaceId)
        : [];
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(rows));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: error?.message || 'Failed to load workspace connections' }));
    }
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const record = hasWorkspaceConnectionConfig()
      ? await upsertWorkspaceConnection(workspaceId, body)
      : { ok: false, reason: 'Workspace connection storage is not configured.' };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(record));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to save workspace connection' }));
  }
}

async function handleWorkspaceConnectionRecord(req, res, connectionId) {
  if (req.method !== 'PATCH') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const record = await patchWorkspaceConnection(connectionId, body);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(record));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to update workspace connection' }));
  }
}

async function handleGmailOAuthCallback(req, res, url) {
  const origin = getRequestOrigin(req);
  try {
    const error = url.searchParams.get('error') || '';
    if (error) {
      throw new Error(error);
    }
    const state = verifyConnectionState(url.searchParams.get('state') || '', getTokenEncryptionSecret());
    const workspaceId = String(state.workspaceId || '').trim();
    const tokens = await exchangeGoogleCodeForTokens(req, url.searchParams.get('code') || '');
    const profile = await fetchGoogleProfile(tokens.access_token || '');
    const tokenExpiresAt = Number(tokens.expires_in || 0)
      ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
      : null;

    const connection = await upsertWorkspaceConnection(workspaceId, {
      provider: 'gmail',
      connection_type: 'oauth',
      status: 'connected',
      display_name: profile.email || profile.name || 'Gmail mailbox',
      external_account_id: profile.email || profile.id || '',
      external_account_label: profile.name || profile.email || '',
      connection_metadata: {
        provider_user_id: profile.id || '',
        email: profile.email || '',
        picture: profile.picture || '',
        scope: tokens.scope || ''
      },
      credentials: {
        access_token: tokens.access_token || '',
        refresh_token: tokens.refresh_token || '',
        id_token: tokens.id_token || ''
      },
      scopes: String(tokens.scope || '').split(/\s+/).filter(Boolean),
      token_expires_at: tokenExpiresAt,
      last_connected_at: new Date().toISOString()
    });

    let watchMetadata = null;
    try {
      watchMetadata = await registerWorkspaceGmailWatch(workspaceId, {
        ...connection,
        credentials: {
          access_token: tokens.access_token || '',
          refresh_token: tokens.refresh_token || '',
          id_token: tokens.id_token || ''
        },
        connection_metadata: {
          ...(connection.connection_metadata || {}),
          email: profile.email || ''
        }
      });
    } catch (watchError) {
      await patchWorkspaceConnection(connection.id, {
        connection_metadata: {
          ...(connection.connection_metadata || {}),
          gmail_watch_error: watchError?.message || 'watch_failed'
        },
        last_error_message: `Watch registration pending: ${watchError?.message || 'watch_failed'}`,
        last_error_at: new Date().toISOString()
      }).catch(() => null);
    }

    await syncChannelFromConnection(workspaceId, 'gmail', connection, {
      status: 'configured',
      webhook_state: 'pending',
      external_metadata: {
        oauth_provider: 'google',
        connected_via: 'workspace_oauth',
        ...(watchMetadata ? { gmail_watch: watchMetadata } : {})
      }
    }).catch((channelError) => {
      console.warn('Failed to sync Gmail channel from connection.', channelError);
    });

    const redirectUrl = buildAppReturnUrl(origin, {
      provider: 'gmail',
      status: 'connected',
      workspaceId
    });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(renderOAuthCallbackPage('Gmail connected', 'The Gmail mailbox is now linked to this workspace. Return to AuraFlow to continue setup and webhook verification.', { redirectUrl }));
  } catch (error) {
    const redirectUrl = buildAppReturnUrl(origin, {
      provider: 'gmail',
      status: 'error',
      error: error?.message || 'oauth_failed'
    });
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(renderOAuthCallbackPage('Gmail connection failed', error?.message || 'Google OAuth callback failed.', { redirectUrl, tone: 'error' }));
  }
}

async function handleFacebookOAuthCallback(req, res, url) {
  const origin = getRequestOrigin(req);
  try {
    const error = url.searchParams.get('error') || '';
    if (error) {
      throw new Error(error);
    }
    const state = verifyConnectionState(url.searchParams.get('state') || '', getTokenEncryptionSecret());
    const workspaceId = String(state.workspaceId || '').trim();
    const requestedProvider = String(state.provider || 'instagram').trim().toLowerCase();
    const tokens = await exchangeMetaCodeForTokens(req, url.searchParams.get('code') || '');
    const { profile, accounts } = await fetchMetaProfile(tokens.access_token || '');
    const grantedScopes = await fetchMetaGrantedPermissions(tokens.access_token || '').catch(() => []);
    const primaryPage = Array.isArray(accounts) ? accounts[0] || null : null;
    const instagramAccount = primaryPage?.instagram_business_account || null;
    const longLivedAccessToken = String(tokens.long_lived_access_token || tokens.access_token || '').trim();

    if (primaryPage) {
      await upsertWorkspaceConnection(workspaceId, {
        provider: 'facebook',
        connection_type: 'oauth',
        status: 'connected',
        display_name: primaryPage.name || 'Facebook page',
        external_account_id: primaryPage.id || '',
        external_account_label: primaryPage.name || '',
        connection_metadata: {
          root_provider: 'meta',
          profile_id: profile.id || '',
          profile_name: profile.name || '',
          page_id: primaryPage.id || '',
          page_name: primaryPage.name || '',
          available_pages: accounts.map((item) => ({ id: item.id, name: item.name })),
          permissions_checked_at: new Date().toISOString(),
          supports_leads_retrieval: grantedScopes.includes('leads_retrieval')
        },
        credentials: {
          access_token: primaryPage.access_token || tokens.access_token || ''
        },
        scopes: grantedScopes.length ? grantedScopes : String(tokens.scope || '').split(/\s+/).filter(Boolean),
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
          : null,
        last_connected_at: new Date().toISOString()
      });

      const messengerConnection = await upsertWorkspaceConnection(workspaceId, {
        provider: 'messenger',
        connection_type: 'oauth',
        status: 'connected',
        display_name: primaryPage.name || 'Messenger page',
        external_account_id: primaryPage.id || '',
        external_account_label: primaryPage.name || '',
        connection_metadata: {
          root_provider: 'meta',
          profile_id: profile.id || '',
          profile_name: profile.name || '',
          available_pages: accounts.map((item) => ({ id: item.id, name: item.name })),
          permissions_checked_at: new Date().toISOString(),
          supports_pages_messaging: grantedScopes.includes('pages_messaging')
        },
        credentials: {
          access_token: primaryPage.access_token || tokens.access_token || ''
        },
        scopes: grantedScopes.length ? grantedScopes : String(tokens.scope || '').split(/\s+/).filter(Boolean),
        last_connected_at: new Date().toISOString()
      });
      await syncChannelFromConnection(workspaceId, 'messenger', messengerConnection, {
        status: 'configured',
        webhook_state: 'pending',
        external_metadata: {
          oauth_provider: 'meta',
          connected_via: 'workspace_oauth'
        }
        }).catch((channelError) => {
          console.warn('Failed to sync Messenger channel from connection.', channelError);
        });
      }

      if (instagramAccount && primaryPage?.access_token) {
        const instagramConnection = await upsertWorkspaceConnection(workspaceId, {
          provider: 'instagram',
          connection_type: 'oauth',
          status: 'connected',
          display_name: instagramAccount.username || primaryPage.name || 'Instagram account',
          external_account_id: instagramAccount.id || '',
          external_account_label: instagramAccount.username || '',
          connection_metadata: {
            root_provider: 'meta',
            page_id: primaryPage.id || '',
            page_name: primaryPage.name || '',
            profile_id: profile.id || '',
            profile_name: profile.name || '',
            facebook_login_mode: 'business',
            botpress_push_status: 'pending',
            permissions_checked_at: new Date().toISOString()
          },
          credentials: {
            access_token: longLivedAccessToken,
            page_access_token: primaryPage.access_token || ''
          },
          scopes: grantedScopes.length ? grantedScopes : String(tokens.scope || '').split(/\s+/).filter(Boolean),
          token_expires_at: tokens.expires_in
            ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
            : null,
          last_connected_at: new Date().toISOString()
        });

        let botpressPushResult = null;
        try {
          botpressPushResult = await pushInstagramTokenToBotpress({
            workspaceId,
            accessToken: longLivedAccessToken,
            tokenExpiresAt: tokens.expires_in
              ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
              : '',
            profile,
            primaryPage,
            instagramAccount,
            connection: instagramConnection
          });
        } catch (pushError) {
          console.warn('Failed to push Instagram token to Botpress.', pushError);
          await patchWorkspaceConnection(instagramConnection.id, {
            connection_metadata: {
              ...(instagramConnection.connection_metadata || {}),
              botpress_push_status: 'failed',
              botpress_push_error: pushError?.message || 'botpress_push_failed'
            },
            last_error_message: pushError?.message || 'Botpress token push failed.',
            last_error_at: new Date().toISOString()
          }).catch(() => null);
        }

        if (botpressPushResult?.ok) {
          await patchWorkspaceConnection(instagramConnection.id, {
            connection_metadata: {
              ...(instagramConnection.connection_metadata || {}),
              botpress_push_status: 'connected',
              botpress_push_at: new Date().toISOString()
            },
            last_error_message: null,
            last_error_at: null,
            last_refreshed_at: new Date().toISOString()
          }).catch(() => null);
        }

        await syncChannelFromConnection(workspaceId, 'instagram', instagramConnection, {
          status: 'configured',
          connection_state: 'connected',
          webhook_state: botpressPushResult?.ok ? 'verified' : 'pending',
          external_metadata: {
            oauth_provider: 'facebook_login_for_business',
            connected_via: 'facebook_login',
            botpress_push_status: botpressPushResult?.ok ? 'connected' : 'pending',
            botpress_push_at: botpressPushResult?.ok ? new Date().toISOString() : null,
            facebook_page_id: primaryPage.id || '',
            instagram_business_account_id: instagramAccount.id || '',
            long_lived_access_token_present: Boolean(longLivedAccessToken)
          }
        }).catch((channelError) => {
          console.warn('Failed to sync Instagram channel from connection.', channelError);
        });
      }

    if (requestedProvider === 'whatsapp' || (primaryPage && (env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID))) {
      const whatsappConnection = await upsertWorkspaceConnection(workspaceId, {
        provider: 'whatsapp',
        connection_type: 'oauth',
        status: primaryPage ? 'pending' : 'needs_review',
        display_name: primaryPage?.name ? `${primaryPage.name} WhatsApp binding` : 'WhatsApp business binding',
        external_account_id: String(env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim(),
        external_account_label: primaryPage?.name || profile.name || 'Meta business',
        connection_metadata: {
          root_provider: 'meta',
          page_id: primaryPage?.id || '',
          page_name: primaryPage?.name || '',
          profile_id: profile.id || '',
          profile_name: profile.name || '',
          binding_state: primaryPage ? 'pending_business_binding' : 'missing_page_context',
          phone_number_id: String(env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
          whatsapp_business_account_id: String(env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim(),
          permissions_checked_at: new Date().toISOString()
        },
        credentials: {
          access_token: primaryPage?.access_token || tokens.access_token || ''
        },
        scopes: grantedScopes.length ? grantedScopes : String(tokens.scope || '').split(/\s+/).filter(Boolean),
        last_connected_at: new Date().toISOString(),
        last_error_message: primaryPage
          ? 'Meta OAuth succeeded. Complete WhatsApp business binding with a phone number and business account before live messaging.'
          : 'Meta OAuth succeeded, but no page context was returned for WhatsApp binding.'
      });
      await syncChannelFromConnection(workspaceId, 'whatsapp', whatsappConnection, {
        status: 'configured',
        connection_state: whatsappConnection.status || 'pending',
        webhook_state: 'pending',
        external_metadata: {
          oauth_provider: 'meta',
          connected_via: 'workspace_oauth',
          binding_state: whatsappConnection.connection_metadata?.binding_state || 'pending_business_binding'
        },
        relay_setup: {
          provider: 'whatsapp',
          oauth_provider: 'meta',
          relay_status: 'oauth_pending'
        }
      }).catch((channelError) => {
        console.warn('Failed to sync WhatsApp channel from connection.', channelError);
      });
    }

    const redirectUrl = buildAppReturnUrl(origin, {
      provider: requestedProvider === 'whatsapp' ? 'facebook' : requestedProvider,
      status: 'connected',
      workspaceId
    });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(renderOAuthCallbackPage('Facebook login connected', 'The workspace now has a Facebook Login for Business connection. Instagram token sync has been pushed to Botpress and the workspace connection is ready to use.', { redirectUrl }));
  } catch (error) {
    const redirectUrl = buildAppReturnUrl(origin, {
      provider: 'facebook',
      status: 'error',
      error: error?.message || 'oauth_failed'
    });
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(renderOAuthCallbackPage('Facebook login failed', error?.message || 'Facebook OAuth callback failed.', { redirectUrl, tone: 'error' }));
  }
}

async function handleMetaOAuthCallback(req, res, url) {
  return handleFacebookOAuthCallback(req, res, url);
}

async function handleApiSync(req, res, workspaceId = '') {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const nextWorkspaceId = body.workspaceId || body.workspace_id || workspaceId || '';
    const syncRecords = extractNangoRecords(body);
    const configuredProviders = Array.isArray(body.providers) && body.providers.length
      ? body.providers
      : (await getWorkspaceProviderReadiness(nextWorkspaceId)).filter((provider) => provider.configured);
    const syncResults = [];

    if (syncRecords.length) {
      for (const [index, record] of syncRecords.entries()) {
        const provider = String(body.provider || record.provider || record.provider_config_key || record.source_provider || 'gmail').toLowerCase();
        const normalized = buildNangoWebhookEnvelope({
          provider,
          workspaceId: nextWorkspaceId,
          body,
          record,
          index,
          eventType: body.eventType || body.type || `${provider}.sync.record`
        });
        const result = await ingestCanonicalWebhookEvent({
          provider,
          workspaceId: normalized.workspaceId || nextWorkspaceId,
          normalized,
          verification: normalized.verification,
          registerReplay: true,
          enqueueJob: true,
          source: 'sync'
        });
        await recordReliabilityEvent(normalized.workspaceId || nextWorkspaceId, provider, normalized.eventType, {
          record,
          body,
          result
        }, {
          status: 'received',
          replayKey: normalized.messages?.[0]?.externalId || normalized.conversation?.externalId || '',
          dedupeKey: normalized.messages?.[0]?.externalId || normalized.conversation?.externalId || ''
        }).catch((error) => {
          console.warn('Reliability log write failed.', error);
        });
        syncResults.push(result);
      }
    } else {
      for (const provider of configuredProviders) {
        const providerKey = String(provider.provider || provider.key || provider.name || '').toLowerCase();
        const channelPayload = {
          workspace_id: nextWorkspaceId,
          provider: providerKey,
          channel_type: provider.channelType || provider.channel_type || (providerKey === 'gmail' ? 'email' : providerKey),
          display_name: provider.label || provider.displayName || providerKey.toUpperCase(),
          status: 'configured',
          provider_account_id: provider.externalAccountId || provider.providerAccountId || '',
          connection_state: provider.connectionState || 'connecting',
          webhook_state: provider.webhookState || 'unknown',
          relay_setup: {
            provider: providerKey,
            sync_requested_at: new Date().toISOString(),
            source: body.source || 'api-sync'
          },
          token_health: {
            provider: providerKey,
            status: provider.tokenHealth || 'unknown'
          },
          external_metadata: {
            configured_from_env: true,
            missing: provider.missing || [],
            rollout_priority: provider.rolloutPriority || null
          },
          last_sync_at: new Date().toISOString()
        };

        try {
          if (hasSupabaseAdminConfig()) {
            await supabaseRest('channels', {
              method: 'POST',
              query: 'on_conflict=workspace_id,provider',
              prefer: 'resolution=merge-duplicates,return=representation',
              body: [channelPayload]
            });
          } else {
            const existing = listDemoCollection(nextWorkspaceId, 'channels').find((item) => String(item.provider || '').toLowerCase() === providerKey);
            if (existing?.id) {
              patchDemoCollectionRecord('channels', existing.id, channelPayload);
            } else {
              createDemoCollectionRecord(nextWorkspaceId, 'channels', channelPayload);
            }
          }
        } catch (error) {
          console.warn('Provider sync channel persistence failed.', error);
        }

        let triggerResult = { skipped: true, reason: 'Nango not configured' };
        if (getNangoSecretKey() && getNangoBaseUrl()) {
          try {
            triggerResult = await triggerNangoSync(nextWorkspaceId, providerKey, provider.connectionId || provider.connection_id || '', provider.syncs || []);
          } catch (error) {
            triggerResult = { error: error?.message || String(error) };
          }
        }

        await recordReliabilityEvent(nextWorkspaceId, providerKey, 'provider.sync.triggered', {
          provider,
          triggerResult,
          body
        }, {
          status: triggerResult?.error ? 'failed' : 'triggered',
          replayKey: provider.connectionId || provider.connection_id || providerKey,
          dedupeKey: provider.connectionId || provider.connection_id || providerKey,
          errorMessage: triggerResult?.error || ''
        }).catch((error) => {
          console.warn('Reliability log write failed.', error);
        });
        enqueueWorkspaceJob(nextWorkspaceId, 'provider.sync.triggered', {
          provider: providerKey,
          triggerResult,
          source: 'api-sync'
        });
        syncResults.push({
          provider: providerKey,
          triggerResult
        });
      }
    }

    const channels = hasSupabaseAdminConfig()
      ? await supabaseRest('channels', {
        query: `workspace_id=eq.${encodeURIComponent(nextWorkspaceId)}&order=updated_at.desc&select=*`
      })
      : listDemoCollection(nextWorkspaceId, 'channels');

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      ok: true,
      workspaceId: nextWorkspaceId,
      channels: toArray(channels),
      syncResults
    }));
  } catch (error) {
    res.writeHead(500, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ error: error?.message || 'Failed to sync providers' }));
  }
}

async function handleContactMerge(req, res, contactId) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const rows = hasSupabaseAdminConfig()
      ? await supabaseRest('contacts', {
      method: 'PATCH',
        query: `id=eq.${encodeURIComponent(contactId)}`,
        body,
        prefer: 'return=representation'
      })
      : patchDemoCollectionRecord('contacts', contactId, body);
    const record = Array.isArray(rows) ? rows[0] : rows;
    emitWorkspaceMutation(record?.workspace_id || body.workspace_id || body.workspaceId, 'contact.updated', { record, body });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(record));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to merge contacts' }));
  }
}

async function handleWorkspaceCollection(req, res, workspaceId, table, workspaceField = 'workspace_id') {
  if (req.method === 'GET') {
    try {
      const rows = hasSupabaseAdminConfig()
        ? await supabaseRest(table, {
          query: `${workspaceField}=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`
        })
        : listDemoCollection(workspaceId, table);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(toArray(rows)));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: error?.message || `Failed to load ${table}` }));
    }
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const payload = Array.isArray(body) ? body : [body];
    const rows = hasSupabaseAdminConfig()
      ? await supabaseRest(table, {
        method: 'POST',
        body: payload.map((item) => ({ ...item, [workspaceField]: workspaceId }))
      })
      : payload.map((item) => createDemoCollectionRecord(workspaceId, table, { ...item, [workspaceField]: workspaceId }));
    const record = Array.isArray(rows) ? rows[0] : rows;
    emitWorkspaceMutation(workspaceId, `${table}.created`, { record, body: payload });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(record));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || `Failed to create ${table}` }));
  }
}

async function createWorkspaceRecordData(table, workspaceId, body = {}, workspaceField = 'workspace_id') {
  const recordBody = {
    ...(body || {}),
    [workspaceField]: workspaceId
  };
  const rows = hasSupabaseAdminConfig()
    ? await supabaseRest(table, {
      method: 'POST',
      body: [recordBody]
    })
    : createDemoCollectionRecord(workspaceId, table, recordBody);
  return Array.isArray(rows) ? rows[0] : rows;
}

async function handleTwilioVoiceToken(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const workspaceId = String(body.workspaceId || body.workspace_id || '').trim();
    const role = String(body.role || '').trim().toLowerCase();
    const user = body.user || {};
    const token = createTwilioVoiceAccessToken({ workspaceId, user, role });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      softphoneReady: true,
      ...token
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to create Twilio Voice token.' }));
  }
}

async function handleTwilioVoiceCallStart(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const workspaceId = String(body.workspaceId || body.workspace_id || '').trim();
    const conversationId = String(body.conversationId || body.conversation_id || '').trim();
    const contactId = String(body.contactId || body.contact_id || '').trim() || null;
    const voiceProfileId = String(body.voiceProfileId || body.voice_profile_id || '').trim() || null;
    const to = String(body.to || '').trim();
    const contactName = String(body.contactName || body.contact_name || 'Lead').trim() || 'Lead';
    const identity = String(body.identity || '').trim();
    const simulateLocalProgress = body.simulateLocalProgress !== false;

    if (!workspaceId) {
      throw new Error('A workspace is required to start a voice session.');
    }
    if (!to) {
      throw new Error('A destination phone number is required to start a voice session.');
    }

    const now = new Date().toISOString();
    const voiceSession = await createWorkspaceRecordData('voice_sessions', workspaceId, {
      contact_id: contactId,
      voice_profile_id: voiceProfileId,
      status: 'dialing',
      session_type: 'call',
      disclosure_text: String(body.disclosureText || body.disclosure_text || 'This call may be recorded for quality and training.').trim(),
      outcome: null,
      analysis_status: 'pending',
      analysis_summary: null,
      analysis_sentiment: null,
      analysis_metadata: {
        source: 'softphone_bootstrap',
        transport: 'twilio_voice_sdk_bootstrap',
        conversation_id: conversationId || null,
        destination_phone: to,
        contact_name: contactName,
        softphone_identity: identity || null,
        call_state: 'dialing',
        relay_url: getMediaStreamRelayUrl(workspaceId, ''),
        started_at: now
      },
      created_at: now,
      updated_at: now
    });

    const sessionId = String(voiceSession?.id || '').trim();
    if (sessionId && simulateLocalProgress) {
      setTimeout(async () => {
        try {
          const patch = {
            status: 'in_progress',
            updated_at: new Date().toISOString(),
            analysis_metadata: {
              ...(voiceSession?.analysis_metadata || {}),
              source: 'softphone_bootstrap',
              transport: 'twilio_voice_sdk_bootstrap',
              conversation_id: conversationId || null,
              destination_phone: to,
              contact_name: contactName,
              softphone_identity: identity || null,
              call_state: 'connected',
              relay_url: getMediaStreamRelayUrl(workspaceId, sessionId),
              connected_at: new Date().toISOString()
            }
          };
          if (hasSupabaseAdminConfig()) {
            await supabaseRest('voice_sessions', {
              method: 'PATCH',
              query: `id=eq.${encodeURIComponent(sessionId)}`,
              body: patch,
              prefer: 'return=representation'
            });
          } else {
            patchDemoCollectionRecord('voice_sessions', sessionId, patch);
          }
          emitWorkspaceMutation(workspaceId, 'voice_sessions.updated', {
            recordId: sessionId,
            status: 'in_progress',
            call_state: 'connected'
          });
        } catch (error) {
          console.warn('Softphone local connect-state patch failed.', error?.message || error);
        }
      }, 1500);
    }

    emitWorkspaceMutation(workspaceId, 'voice_sessions.created', {
      record: voiceSession,
      conversationId,
      contactId
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      session: voiceSession,
      localCallState: 'dialing',
      relayUrl: getMediaStreamRelayUrl(workspaceId, sessionId),
      twimlUrl: `${getPublicBaseUrl()}/.netlify/functions/twilio-voice-twiml`
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to start softphone call session.' }));
  }
}

async function handleTwilioVoiceTwiml(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const rawBody = req.method === 'POST'
      ? await readRequestBodyWithRaw(req)
      : { body: {}, rawText: '', contentType: '' };
    const requestLike = {
      ...Object.fromEntries(url.searchParams.entries()),
      ...(rawBody.body || {})
    };
    const responseXml = renderTwilioVoiceTwiML(requestLike, process.env, getPublicBaseUrl());
    res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(responseXml);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to generate TwiML.' }));
  }
}

async function handleTestVoiceRelay(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const workspaceId = String(body.workspaceId || body.workspace_id || '').trim();
    const voiceSessionId = String(body.voiceSessionId || body.voice_session_id || '').trim();
    const detail = {
      workspaceId,
      voiceSessionId,
      conversationId: String(body.conversationId || body.conversation_id || '').trim(),
      contactId: String(body.contactId || body.contact_id || '').trim(),
      speaker: String(body.speaker || 'Lead').trim() || 'Lead',
      transcript: String(body.transcript || '').trim(),
      isFinal: body.isFinal !== false,
      mood: String(body.mood || 'neutral').trim().toLowerCase() || 'neutral',
      ts: new Date().toISOString()
    };

    if (!workspaceId || !detail.transcript) {
      throw new Error('workspaceId and transcript are required.');
    }

    publishWorkspaceEvent(workspaceId, {
      type: 'voice.transcript.relay',
      mutationType: 'relay.transcript',
      detail
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, detail }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to publish a local test relay event.' }));
  }
}

async function getRecordData(table, recordId) {
  if (!recordId) return null;
  if (hasSupabaseAdminConfig()) {
    const rows = await supabaseRest(table, {
      method: 'GET',
      query: `id=eq.${encodeURIComponent(recordId)}&limit=1&select=*`
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }
  const collections = getDemoCollection(table);
  return collections.find((item) => String(item?.id || '').trim() === String(recordId || '').trim()) || null;
}

async function handleLeadNotificationTest(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const body = await readJsonBody(req);
    const workspaceId = String(
      body.workspaceId
      || body.workspace_id
      || url.searchParams.get('workspace_id')
      || url.searchParams.get('workspaceId')
      || env.AURAFLOW_DEFAULT_WORKSPACE_ID
      || ''
    ).trim();
    const notificationEmail = String(
      body.to
      || body.email
      || process.env.LEAD_NOTIFICATION_EMAIL
      || process.env.OWNER_NOTIFICATION_EMAIL
      || process.env.GMAIL_INBOX_ADDRESS
      || ''
    ).trim();

    if (!notificationEmail) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'LEAD_NOTIFICATION_EMAIL is not configured.' }));
      return;
    }

    const workspaceName = workspaceId ? await resolveWorkspaceName(workspaceId).catch(() => '') : '';
    const result = await sendProviderOutboundMessage({
      workspaceId,
      provider: 'gmail',
      connection: {
        email: process.env.GMAIL_FROM_EMAIL || process.env.GMAIL_INBOX_ADDRESS || notificationEmail,
        credentials: {
          access_token: process.env.GMAIL_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN || '',
          refresh_token: process.env.GMAIL_REFRESH_TOKEN || ''
        },
        connection_metadata: {
          email: notificationEmail
        }
      },
      conversation: {
        subject: `New Lead Captured for ${workspaceName || 'AuraFlow Workspace'}!`,
        recipient_email: notificationEmail,
        source_provider: 'gmail'
      },
      message: {
        body: buildLeadNotificationBody({
          workspaceName,
          lead: {
            name: body.leadName || 'Launch Readiness Lead',
            email: body.leadEmail || 'reviewer@example.com',
            phone_e164: body.leadPhone || '+15550001111',
            company: body.company || workspaceName || 'AuraFlow Review',
            capture_reason: 'Lead notification delivery verification'
          },
          messageBody: body.message || 'This is a test lead notification sent from AuraFlow launch readiness checks.'
        }),
        recipient_email: notificationEmail
      }
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      ok: true,
      workspaceId,
      workspaceName,
      notificationEmail,
      providerTransport: result.providerTransport,
      providerMessageId: result.providerMessageId,
      sentAt: result.sentAt
    }));
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    const statusCode = message.includes('fetch failed') || message.includes('network') || message.includes('econnrefused')
      ? 503
      : 500;
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      error: statusCode === 503
        ? 'Gmail API is unreachable from this environment. Retry the test once outbound network access is available.'
        : (error?.message || 'Failed to send lead notification test')
    }));
  }
}

function normalizeKnowledgeUploadPayload(body = {}) {
  const items = Array.isArray(body.items) && body.items.length ? body.items : [body];
  return items
    .map((item) => ({
      title: String(item.title || item.file_name || item.name || item.url || 'Workspace knowledge').trim(),
      source_type: String(item.source_type || item.sourceType || (item.url ? 'url' : 'document')).trim() || 'document',
      url: String(item.url || item.source_url || item.website_url || '').trim(),
      text: String(item.content || item.text || item.body || item.excerpt || item.answer || item.summary || '').trim(),
      tags: Array.isArray(item.tags) ? item.tags : [],
      relevance: String(item.relevance || '').trim() || null,
      metadata: item.metadata || item.additional_metadata || {}
    }))
    .filter((item) => Boolean(item.text || item.url || item.title));
}

async function persistKnowledgeChunks(workspaceId, entry) {
  const chunks = splitKnowledgeTextIntoChunks(entry.text || entry.url || entry.title || '', 1000);
  const normalizedChunks = chunks.length ? chunks : [entry.url || entry.title || 'Workspace knowledge'];
  const baseMetadata = {
    ...(entry.metadata || {}),
    source_url: entry.url || null,
    source_title: entry.title || null,
    source_type: entry.source_type || 'document',
    original_length: String(entry.text || '').length,
    chunk_count: normalizedChunks.length
  };

  const workspaceKnowledgeRows = normalizedChunks.map((chunk, index) => ({
    workspace_id: workspaceId,
    title: entry.title || 'Workspace knowledge',
    source_type: entry.source_type || 'document',
    url: entry.url || null,
    body: chunk,
    content: chunk,
    summary: chunk.slice(0, 180),
    chunk_index: index + 1,
    chunk_count: normalizedChunks.length,
    tags: entry.tags || [],
    priority: entry.relevance ? 100 : 50,
    metadata: {
      ...baseMetadata,
      chunk_index: index + 1
    }
  }));

  try {
    const rows = await supabaseRest('workspace_knowledge', {
      method: 'POST',
      body: workspaceKnowledgeRows,
      prefer: 'return=representation'
    });
    return rows;
  } catch (error) {
    const fallbackRows = normalizedChunks.map((chunk, index) => ({
      workspace_id: workspaceId,
      source_type: entry.source_type || 'document',
      title: entry.title || 'Workspace knowledge',
      body: chunk,
      tags: entry.tags || [],
      relevance: entry.relevance || null,
      metadata: {
        ...baseMetadata,
        chunk_index: index + 1
      }
    }));
    const rows = await supabaseRest('training_sources', {
      method: 'POST',
      body: fallbackRows,
      prefer: 'return=representation'
    });
    return rows;
  }
}

async function handleWorkspaceKnowledgeUpload(req, res, workspaceId) {
  if (req.method === 'GET') {
    try {
      const rows = hasSupabaseAdminConfig()
        ? await supabaseRest('workspace_knowledge', {
          query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`
        }).catch(async () => supabaseRest('training_sources', {
          query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`
        }))
        : listDemoCollection(workspaceId, 'training_sources');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(toArray(rows)));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: error?.message || 'Failed to load workspace knowledge' }));
    }
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const entries = normalizeKnowledgeUploadPayload(body);
    const uploaded = [];
    for (const entry of entries) {
      const savedRows = await persistKnowledgeChunks(workspaceId, entry);
      uploaded.push(...toArray(savedRows));
    }
    emitWorkspaceMutation(workspaceId, 'workspace.knowledge.uploaded', { workspaceId, uploaded, body });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, workspaceId, uploaded }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to upload workspace knowledge' }));
  }
}

async function handleRecordPatch(req, res, table, recordId) {
  if (req.method !== 'PATCH') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const rows = hasSupabaseAdminConfig()
      ? await supabaseRest(table, {
        method: 'PATCH',
        query: `id=eq.${encodeURIComponent(recordId)}`,
        body,
        prefer: 'return=representation'
      })
      : patchDemoCollectionRecord(table, recordId, body);
    const record = Array.isArray(rows) ? rows[0] : rows;
    emitWorkspaceMutation(record?.workspace_id || body.workspace_id || body.workspaceId, `${table}.updated`, { record, body });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(record));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || `Failed to update ${table}` }));
  }
}

async function handleConversationReply(req, res, conversationId) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const workspaceId = body.workspace_id || body.workspaceId || '';
    const message = hasSupabaseAdminConfig()
      ? await supabaseRest('messages', {
        method: 'POST',
        body: [{
          workspace_id: workspaceId,
          conversation_id: conversationId,
          source_provider: body.source_provider || body.sourceProvider || 'manual',
          external_message_id: body.external_message_id || body.externalMessageId || `reply:${conversationId}:${Date.now()}`,
          direction: body.direction || 'outbound',
          sender_name: body.sender_name || body.senderName || 'AuraFlow',
          body: body.body || '',
          channel: body.channel || providerToChannel(body.source_provider || body.sourceProvider || 'manual') || 'whatsapp',
          raw_payload: body.raw_payload || body.rawPayload || {}
        }]
      })
      : replyToDemoConversation(conversationId, body);

    const conversationRecord = hasSupabaseAdminConfig()
      ? await supabaseRest('conversations', {
        query: `id=eq.${encodeURIComponent(conversationId)}&select=*`,
        prefer: 'return=representation'
      }).then((rows) => Array.isArray(rows) ? rows[0] : rows).catch(() => null)
      : findDemoConversation(conversationId);
    const contactRecord = hasSupabaseAdminConfig() && conversationRecord?.contact_id
      ? await supabaseRest('contacts', {
        query: `id=eq.${encodeURIComponent(conversationRecord.contact_id)}&select=*`,
        prefer: 'return=representation'
      }).then((rows) => Array.isArray(rows) ? rows[0] : rows).catch(() => null)
      : null;
    const conversationMessages = hasSupabaseAdminConfig()
      ? await supabaseRest('messages', {
        query: `conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.desc&select=*`,
        prefer: 'return=representation'
      }).catch(() => [])
      : [];
    const routing = deriveConversationRoutingTarget(conversationRecord, contactRecord, conversationMessages);
    const providerKey = String(body.source_provider || body.sourceProvider || conversationRecord?.source_provider || body.channel || conversationRecord?.source || 'manual').toLowerCase();
    const replyTargetStatus = String(routing.reply_target_status || '').toLowerCase();
    if (['instagram', 'messenger'].includes(providerKey) && ['missing', 'placeholder'].includes(replyTargetStatus)) {
      const statusLabel = replyTargetStatus === 'placeholder' ? 'test-only recipient' : 'missing platform recipient';
      res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        error: `Cannot send ${providerKey} reply: ${statusLabel}.`,
        provider: providerKey,
        reply_target_status: routing.reply_target_status || 'missing',
        reply_target_note: routing.reply_target_note || 'A real inbound Twilio conversation is required before live replies can be sent.'
      }));
      return;
    }
    const workspaceConnection = hasWorkspaceConnectionConfig()
      ? await getWorkspaceConnection(workspaceId, providerKey, { includeCredentials: true }).catch(() => null)
      : null;
    const providerResult = await sendProviderOutboundMessage({
      workspaceId,
      connection: workspaceConnection || {},
      conversation: {
        id: conversationId,
        workspace_id: workspaceId,
        source_provider: providerKey,
        source: body.channel || conversationRecord?.source || conversationRecord?.source_provider || 'manual',
        status: body.status || conversationRecord?.status || 'open',
        subject: body.subject || conversationRecord?.subject || 'AuraFlow reply',
        recipient_email: body.recipient_email || body.recipientEmail || routing.recipient_email || '',
        recipient_phone: body.recipient_phone || body.recipientPhone || routing.recipient_phone || '',
        recipient_id: body.recipient_id || body.recipientId || routing.recipient_id || ''
      },
      message: {
        ...(Array.isArray(message) ? message[0] : message),
        recipient_email: body.recipient_email || body.recipientEmail || routing.recipient_email || '',
        recipient_phone: body.recipient_phone || body.recipientPhone || routing.recipient_phone || '',
        recipient_id: body.recipient_id || body.recipientId || routing.recipient_id || ''
      },
      mode: body.mode || 'sent'
    });
    if (
      workspaceConnection?.id &&
      providerKey === 'gmail' &&
      String(workspaceConnection?.credentials?.access_token || '').trim()
    ) {
      await patchWorkspaceConnection(workspaceConnection.id, {
        credentials: {
          ...workspaceConnection.credentials
        },
        last_refreshed_at: new Date().toISOString(),
        last_error_at: null,
        last_error_message: null
      }).catch((connectionError) => {
        console.warn('Failed to persist refreshed Gmail connection token.', connectionError);
      });
    }

    const messageRecord = Array.isArray(message) ? message[0] : message;
    const deliveryPatch = {
      external_message_id: providerResult.providerMessageId || messageRecord?.external_message_id || messageRecord?.externalMessageId || '',
      delivery_state: providerResult.providerDeliveryStatus || body.mode || 'sent',
      raw_payload: {
        ...(messageRecord?.raw_payload || messageRecord?.rawPayload || {}),
        provider_result: providerResult,
        delivery_state: providerResult.providerDeliveryStatus || body.mode || 'sent'
      },
      updated_at: new Date().toISOString()
    };
    try {
      if (hasSupabaseAdminConfig()) {
        if (messageRecord?.id) {
          await supabaseRest('messages', {
            method: 'PATCH',
            query: `id=eq.${encodeURIComponent(messageRecord.id)}`,
            body: deliveryPatch,
            prefer: 'return=representation'
          });
        }
      } else if (messageRecord?.id) {
        patchDemoCollectionRecord('messages', messageRecord.id, deliveryPatch);
      }
      Object.assign(messageRecord, deliveryPatch);
    } catch (error) {
      console.warn('Failed to persist outbound delivery state.', error);
    }

    if (body.patchConversation !== false) {
      if (hasSupabaseAdminConfig()) {
        await supabaseRest('conversations', {
          method: 'PATCH',
          query: `id=eq.${encodeURIComponent(conversationId)}`,
          body: {
            updated_at: new Date().toISOString(),
            last_message_at: body.last_message_at || new Date().toISOString(),
            status: body.status || 'open'
          },
          prefer: 'return=representation'
        }).catch(() => null);
      }
    }

    enqueueWorkspaceJob(messageRecord?.workspace_id || workspaceId, 'conversation.reply', {
      conversationId,
      message: messageRecord,
      body,
      providerResult
    });
    emitWorkspaceMutation(messageRecord?.workspace_id || body.workspace_id || body.workspaceId, 'conversation.replied', {
      conversationId,
      message: messageRecord,
      body,
      providerResult
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(messageRecord));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to create conversation reply' }));
  }
}

async function updateMessageDeliveryState(workspaceId, providerMessageId, patch = {}) {
  const key = String(providerMessageId || '').trim();
  const nextPatch = {
    ...patch,
    updated_at: new Date().toISOString()
  };
  if (!key) return null;

  if (hasSupabaseAdminConfig()) {
    const rows = await supabaseRest('messages', {
      method: 'PATCH',
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&external_message_id=eq.${encodeURIComponent(key)}`,
      body: nextPatch,
      prefer: 'return=representation'
    }).catch(() => null);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  return updateDemoMessageByExternalId(workspaceId, key, nextPatch);
}

async function applyDeliveryReceipts(workspaceId, normalized = {}) {
  const receipts = Array.isArray(normalized?.deliveryReceipts) ? normalized.deliveryReceipts : [];
  if (!receipts.length) return [];

  const results = [];
  for (const receipt of receipts) {
    const state = String(receipt.status || '').toLowerCase();
    const update = await updateMessageDeliveryState(workspaceId, receipt.externalMessageId, {
      delivery_state: state || 'sent',
      delivery_receipts: [receipt]
    }).catch((error) => {
      console.warn('Failed to update delivery receipt state.', error);
      return null;
    });
    if (update) {
      results.push(update);
      emitWorkspaceMutation(workspaceId, `message.${state || 'delivered'}`, {
        provider: normalized.provider || 'meta',
        receipt,
        message: update
      });
    }
  }
  return results;
}

async function handleWorkspaceActivityEvents(req, res, workspaceId) {
  if (req.method === 'GET') {
    try {
      const rows = hasSupabaseAdminConfig()
        ? await supabaseRest('activity_events', {
          query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=created_at.desc&select=*`
        })
        : listDemoCollection(workspaceId, 'activity_events');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(toArray(rows)));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: error?.message || 'Failed to load activity events' }));
    }
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const rows = hasSupabaseAdminConfig()
      ? await supabaseRest('activity_events', {
        method: 'POST',
        body: [{
          workspace_id: workspaceId,
          entity_type: body.entity_type || body.entityType || 'conversation',
          entity_id: body.entity_id || body.entityId || null,
          event_type: body.event_type || body.eventType || 'event_created',
          payload: body.payload || {}
        }]
      })
      : createDemoActivityEvent(workspaceId, body);
    const record = Array.isArray(rows) ? rows[0] : rows;
    enqueueWorkspaceJob(workspaceId, 'activity.create', { activity: record, body });
    emitWorkspaceMutation(workspaceId, 'activity.event.created', { record, body });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(record));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to create activity event' }));
  }
}

async function handleWorkspaceReliability(req, res, workspaceId) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const jobs = listWorkspaceJobs(workspaceId);
  const replays = listWebhookReplays(workspaceId);
  const reliabilityEvents = hasSupabaseAdminConfig()
    ? await supabaseRest('reliability_events', {
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=created_at.desc&select=*`
    }).catch(() => [])
    : loadDemoWorkspaceSnapshot(workspaceId).reliabilityEvents || [];
  const jobCounts = jobs.reduce((acc, job) => {
    const status = String(job.status || 'queued').toLowerCase();
    acc.total += 1;
    if (status === 'queued') acc.queued += 1;
    else if (status === 'retrying') acc.retrying += 1;
    else if (status === 'failed') acc.failed += 1;
    else if (status === 'completed') acc.completed += 1;
    else if (status === 'escalated') acc.escalated += 1;
    else if (status === 'assigned') acc.assigned += 1;
    return acc;
  }, { total: 0, queued: 0, retrying: 0, failed: 0, completed: 0, escalated: 0, assigned: 0 });
  const replayDiagnostics = getWebhookReplayDiagnostics(workspaceId);
  const recentFailures = jobs.filter((job) => ['retrying', 'failed'].includes(String(job.status || '').toLowerCase())).slice(0, 8);
  const recentReplays = replays.slice(0, 8);

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({
    workspaceId,
    summary: {
      jobCounts,
      replayCounts: replayDiagnostics,
      hasRetryingJobs: jobCounts.retrying > 0,
      hasFailedJobs: jobCounts.failed > 0
    },
    recentFailures,
    recentReplays,
    recentReliabilityEvents: toArray(reliabilityEvents).slice(0, 8)
  }));
}

async function handleWebhookReplayRetry(req, res, workspaceId, replayKey) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const replay = getWebhookReplay(workspaceId, replayKey);
    if (!replay) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Replay entry not found' }));
      return;
    }

    const normalized = replay.detail || {};
    const result = await ingestCanonicalWebhookEvent({
      provider: normalized.provider || 'gmail',
      workspaceId: workspaceId || normalized.workspaceId || '',
      normalized,
      enqueueJob: true,
      registerReplay: false,
      source: 'replay'
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, replayKey, workspaceId, result }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to retry replay entry' }));
  }
}

function searchWorkspaceSnapshot(snapshot = {}, query = '') {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const collections = {
    contacts: Array.isArray(snapshot.contacts) ? snapshot.contacts : [],
    leads: Array.isArray(snapshot.leads) ? snapshot.leads : [],
    conversations: Array.isArray(snapshot.conversations) ? snapshot.conversations : [],
    messages: Array.isArray(snapshot.messages) ? snapshot.messages : [],
    activityEvents: Array.isArray(snapshot.activityEvents) ? snapshot.activityEvents : []
  };

  if (!normalizedQuery) {
    return collections;
  }

  const includes = (value) => String(value || '').toLowerCase().includes(normalizedQuery);
  return {
    contacts: collections.contacts.filter((item) => [item.name, item.email, item.phone, item.company, ...(Array.isArray(item.tags) ? item.tags : [])].some(includes)),
    leads: collections.leads.filter((item) => [item.name, item.email, item.phone, item.company, item.lead_stage, item.capture_reason, ...(Array.isArray(item.tags) ? item.tags : [])].some(includes)),
    conversations: collections.conversations.filter((item) => [item.subject, item.summary, item.status, item.priority, item.source, item.assigned_to].some(includes)),
    messages: collections.messages.filter((item) => [item.body, item.sender_name, item.direction, item.source_provider].some(includes)),
    activityEvents: collections.activityEvents.filter((item) => [item.event_type, item.entity_type, JSON.stringify(item.payload || {})].some(includes))
  };
}

async function handleWorkspaceSearch(req, res, workspaceId) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
    const snapshot = hasSupabaseAdminConfig()
      ? await loadWorkspaceSnapshot(workspaceId)
      : loadDemoWorkspaceSnapshot(workspaceId);
    const results = searchWorkspaceSnapshot(snapshot, q);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ q, workspaceId, results }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || 'Failed to search workspace' }));
  }
}

function getProviderReadiness() {
  if (!hasSupabaseAdminConfig()) {
    return getDemoProviderReadiness();
  }

  const googleClientId = env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
  const gmailInboxAddress = env.GMAIL_INBOX_ADDRESS || process.env.GMAIL_INBOX_ADDRESS || '';
  const twilioAccountSid = env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID || '';
  const twilioAuthToken = env.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || '';
  const twilioConversationsServiceSid = env.TWILIO_CONVERSATIONS_SERVICE_SID || process.env.TWILIO_CONVERSATIONS_SERVICE_SID || '';
  const twilioWebhookBaseUrl = env.TWILIO_WEBHOOK_BASE_URL || process.env.TWILIO_WEBHOOK_BASE_URL || '';
  const twilioWhatsappSender = env.TWILIO_WHATSAPP_SENDER || process.env.TWILIO_WHATSAPP_SENDER || env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_NUMBER || env.TWILIO_WHATSAPP_SANDBOX_NUMBER || process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER || '';
  const twilioWhatsappAccountSid = env.TWILIO_WHATSAPP_ACCOUNT_SID || process.env.TWILIO_WHATSAPP_ACCOUNT_SID || '';
  const twilioInstagramAccountSid = env.TWILIO_INSTAGRAM_ACCOUNT_SID || process.env.TWILIO_INSTAGRAM_ACCOUNT_SID || '';
  const twilioMessengerAccountSid = env.TWILIO_MESSENGER_ACCOUNT_SID || process.env.TWILIO_MESSENGER_ACCOUNT_SID || '';
  const gmailWebhookReady = Boolean(
    env.GMAIL_WEBHOOK_URL ||
    env.GMAIL_WEBHOOK_TOPIC ||
    env.GMAIL_WEBHOOK_SECRET ||
    env.GMAIL_PUSH_SUBSCRIPTION
  );
  const twilioWebhookReady = Boolean(twilioWebhookBaseUrl || twilioConversationsServiceSid);
  const twilioConfigured = Boolean(twilioAccountSid && twilioAuthToken && twilioConversationsServiceSid);

  return [
    {
      provider: 'gmail',
      label: 'Gmail',
      channelType: 'email',
      configured: Boolean(googleClientId && googleClientSecret && gmailInboxAddress),
      externalAccountId: gmailInboxAddress || '',
      outboundImplemented: true,
      outboundReady: Boolean(googleClientId && googleClientSecret && gmailInboxAddress),
      inboundReady: gmailWebhookReady,
      manualSetupMode: true,
      verificationMode: 'oauth + pubsub',
      recipientRequirement: 'email_address',
      operationalStatus: !googleClientId || !googleClientSecret || !gmailInboxAddress
        ? 'token_missing'
        : gmailWebhookReady
          ? 'connected'
          : 'webhook_stale',
      statusReason: !googleClientId || !googleClientSecret || !gmailInboxAddress
        ? 'Missing Google credentials or inbox address.'
        : gmailWebhookReady
          ? 'Connected and webhook-ready.'
          : 'Connected but Gmail webhook or push subscription is missing.',
      missing: [
        !googleClientId && 'GOOGLE_CLIENT_ID',
        !googleClientSecret && 'GOOGLE_CLIENT_SECRET',
        !gmailInboxAddress && 'GMAIL_INBOX_ADDRESS'
      ].filter(Boolean),
      rolloutPriority: 1,
      rolloutNote: 'Primary rollout target for the first live inbox.'
    },
    {
      provider: 'whatsapp',
      label: 'WhatsApp',
      channelType: 'whatsapp',
      configured: Boolean(twilioConfigured && (twilioWhatsappSender || twilioWhatsappAccountSid)),
      externalAccountId: twilioWhatsappAccountSid || twilioWhatsappSender || twilioConversationsServiceSid || '',
      outboundImplemented: true,
      outboundReady: Boolean(twilioConfigured && (twilioWhatsappSender || twilioWhatsappAccountSid)),
      inboundReady: Boolean(twilioConfigured && twilioWebhookReady),
      manualSetupMode: true,
      verificationMode: 'twilio conversations webhook',
      recipientRequirement: 'phone_number',
      operationalStatus: !twilioConfigured || !(twilioWhatsappSender || twilioWhatsappAccountSid)
        ? 'token_missing'
        : twilioWebhookReady
          ? 'connected'
          : 'webhook_stale',
      statusReason: !twilioConfigured || !(twilioWhatsappSender || twilioWhatsappAccountSid)
        ? 'Missing Twilio credentials, Conversations service SID, or the registered WhatsApp sender mapping.'
        : twilioWebhookReady
          ? 'Twilio Conversations and the webhook receiver are configured.'
          : 'Twilio credentials are present, but the webhook receiver URL is not configured.',
      missing: [
        !twilioAccountSid && 'TWILIO_ACCOUNT_SID',
        !twilioAuthToken && 'TWILIO_AUTH_TOKEN',
        !twilioConversationsServiceSid && 'TWILIO_CONVERSATIONS_SERVICE_SID',
        !(twilioWhatsappSender || twilioWhatsappAccountSid) && 'TWILIO_WHATSAPP_SENDER or TWILIO_WHATSAPP_ACCOUNT_SID'
      ].filter(Boolean),
      rolloutPriority: 2,
      rolloutNote: 'Use the registered Twilio WhatsApp sender for production traffic, approved templates, and the Netlify webhook receiver.'
    },
    {
      provider: 'instagram',
      label: 'Instagram',
      channelType: 'instagram',
      configured: Boolean(twilioConfigured),
      externalAccountId: twilioInstagramAccountSid || twilioConversationsServiceSid || '',
      outboundImplemented: true,
      outboundReady: Boolean(twilioConfigured),
      inboundReady: Boolean(twilioConfigured && twilioWebhookReady),
      manualSetupMode: true,
      verificationMode: 'twilio conversations webhook',
      recipientRequirement: 'twilio_conversation_sid',
      recipientHint: 'Instagram replies run through the Twilio Conversation SID captured from the inbound thread.',
      operationalStatus: !twilioConfigured
        ? 'token_missing'
        : twilioWebhookReady
          ? 'connected'
          : 'webhook_stale',
      statusReason: !twilioConfigured
        ? 'Missing Twilio credentials or Conversations service SID.'
        : twilioWebhookReady
          ? 'Twilio Conversations is ready to receive Instagram events once you link the account in Twilio.'
          : 'Twilio credentials are present, but the webhook receiver URL is not configured.',
      missing: [
        !twilioAccountSid && 'TWILIO_ACCOUNT_SID',
        !twilioAuthToken && 'TWILIO_AUTH_TOKEN',
        !twilioConversationsServiceSid && 'TWILIO_CONVERSATIONS_SERVICE_SID'
      ].filter(Boolean),
      rolloutPriority: 3,
      rolloutNote: 'Link Instagram in the Twilio Console and AuraFlow will consume the unified Conversations webhook shape.'
    },
    {
      provider: 'messenger',
      label: 'Messenger',
      channelType: 'messenger',
      configured: Boolean(twilioConfigured),
      externalAccountId: twilioMessengerAccountSid || twilioConversationsServiceSid || '',
      outboundImplemented: true,
      outboundReady: Boolean(twilioConfigured),
      inboundReady: Boolean(twilioConfigured && twilioWebhookReady),
      manualSetupMode: true,
      verificationMode: 'twilio conversations webhook',
      recipientRequirement: 'twilio_conversation_sid',
      recipientHint: 'Messenger replies run through the Twilio Conversation SID captured from the inbound thread.',
      operationalStatus: !twilioConfigured
        ? 'token_missing'
        : twilioWebhookReady
          ? 'connected'
          : 'webhook_stale',
      statusReason: !twilioConfigured
        ? 'Missing Twilio credentials or Conversations service SID.'
        : twilioWebhookReady
          ? 'Twilio Conversations is ready to receive Messenger events once you link the account in Twilio.'
          : 'Twilio credentials are present, but the webhook receiver URL is not configured.',
      missing: [
        !twilioAccountSid && 'TWILIO_ACCOUNT_SID',
        !twilioAuthToken && 'TWILIO_AUTH_TOKEN',
        !twilioConversationsServiceSid && 'TWILIO_CONVERSATIONS_SERVICE_SID'
      ].filter(Boolean),
      rolloutPriority: 4,
      rolloutNote: 'Link Messenger in the Twilio Console and AuraFlow will consume the same unified Conversations webhook format.'
    }
  ];
}

async function getWorkspaceProviderReadiness(workspaceId = '') {
  const baseReadiness = getProviderReadiness();
  if (!workspaceId || !hasWorkspaceConnectionConfig()) {
    return baseReadiness;
  }

  const connections = await listWorkspaceConnections(workspaceId).catch(() => []);
  const connectionsByProvider = new Map(connections.map((item) => [String(item.provider || '').toLowerCase(), item]));
  const channels = hasSupabaseAdminConfig()
    ? await supabaseRest('channels', {
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&select=*`
    }).catch(() => [])
    : listDemoCollection(workspaceId, 'channels');
  const channelsByProvider = new Map(toArray(channels).map((item) => [String(item.provider || '').toLowerCase(), item]));

  return baseReadiness.map((provider) => {
    const providerKey = String(provider.provider || '').toLowerCase();
    const connection = connectionsByProvider.get(providerKey);
    const channel = channelsByProvider.get(providerKey);
    if (!connection) {
      const channelConnected = ['connected', 'pending', 'needs_review'].includes(String(channel?.connection_state || '').toLowerCase());
      if (!channel || !channelConnected) {
        return provider;
      }
      const channelState = String(channel.connection_state || '').toLowerCase();
      const channelWebhookVerified = String(channel.webhook_state || '').toLowerCase() === 'verified' || Boolean(channel.last_webhook_at || channel.external_metadata?.last_webhook_at);
      return {
        ...provider,
        configured: true,
        externalAccountId: channel.provider_account_id || provider.externalAccountId,
        outboundReady: channelState === 'connected',
        inboundReady: channelWebhookVerified || provider.inboundReady,
        manualSetupMode: false,
        connectionState: channel.connection_state || 'connected',
        connectionDisplayName: channel.display_name || '',
        operationalStatus: channelState === 'connected'
          ? (channelWebhookVerified || provider.inboundReady ? 'connected' : 'oauth_connected')
          : channelState === 'pending'
            ? 'pending_binding'
            : channelState === 'needs_review'
              ? 'needs_review'
              : provider.operationalStatus,
        statusReason: channelState === 'connected'
          ? channelWebhookVerified || provider.inboundReady
            ? `${provider.label} is connected for this workspace.`
            : `${provider.label} is connected, but webhook verification is still pending.`
          : channelState === 'pending'
            ? `${provider.label} is authorized for this workspace, but provider-specific binding still needs to be completed.`
            : `${provider.label} needs review before it can be trusted for live traffic.`,
        missing: []
      };
    }

    const connectionState = String(connection.status || '').toLowerCase() || 'connected';
    const hasWorkspaceConnection = Boolean(connection?.id);
    const webhookVerified = Boolean(
      connection.connection_metadata?.webhook_verified_at ||
      connection.connection_metadata?.webhook_state === 'verified'
    );
    const watchRegistered = Boolean(connection.connection_metadata?.gmail_watch?.registered_at);
    const connected = connectionState === 'connected';
    const pendingBinding = connectionState === 'pending';
    const needsReview = connectionState === 'needs_review';

    return {
      ...provider,
      configured: provider.configured || connected || hasWorkspaceConnection,
      externalAccountId: connection.external_account_id || provider.externalAccountId,
      outboundReady: provider.outboundImplemented ? connected : provider.outboundReady,
      inboundReady: webhookVerified || watchRegistered || provider.inboundReady,
      manualSetupMode: false,
      connectionState: connection.status || 'connected',
      connectionDisplayName: connection.display_name || '',
      connectionId: connection.id || '',
      operationalStatus: connected
        ? (webhookVerified || provider.inboundReady ? 'connected' : watchRegistered ? 'watch_registered' : 'oauth_connected')
        : pendingBinding
          ? 'pending_binding'
          : needsReview
            ? 'needs_review'
        : provider.operationalStatus,
      statusReason: connected
        ? webhookVerified || provider.inboundReady
          ? `${provider.label} is connected for this workspace.`
          : watchRegistered
            ? `${provider.label} is connected and Gmail watch is registered, but Pub/Sub delivery has not been verified yet.`
            : `${provider.label} is connected, but webhook verification is still pending.`
        : pendingBinding
          ? connection.last_error_message || `${provider.label} is authorized for this workspace, but provider-specific binding still needs to be completed.`
          : needsReview
            ? connection.last_error_message || `${provider.label} needs review before it can be trusted for live traffic.`
        : provider.statusReason,
      missing: hasWorkspaceConnection ? [] : provider.missing
    };
  });
}

function getConversationChannelProfile(conversation = {}) {
  const providerKey = String(
    conversation.source_provider
    || conversation.sourceProvider
    || conversation.channel
    || conversation.source
    || ''
  ).trim().toLowerCase();

  const profiles = {
    gmail: {
      key: 'gmail',
      label: 'Gmail',
      replyStyle: [
        'Write like a polished support email.',
        'Use complete sentences and preserve thread continuity when relevant.',
        'Prefer one or two compact paragraphs with a courteous close.',
        'Avoid slang, emojis, and overly casual phrasing unless the customer clearly set that tone.'
      ],
      summaryStyle: 'Highlight the customer request, any promised follow-up, and whether the thread needs a formal owner.',
      classifyStyle: 'Bias toward operational clarity, urgency, and whether a formal follow-up is required.'
    },
    whatsapp: {
      key: 'whatsapp',
      label: 'WhatsApp',
      replyStyle: [
        'Keep the reply concise, warm, and action-oriented.',
        'Use short paragraphs or short sentences that read naturally on mobile.',
        'Focus on the next step, confirmation, or clarification.',
        'Avoid email-style greetings or sign-offs.'
      ],
      summaryStyle: 'Emphasize the latest ask, whether the conversation is blocking the customer, and the immediate next step.',
      classifyStyle: 'Bias toward response speed, handoff need, and whether the customer is waiting on an operational action.'
    },
    instagram: {
      key: 'instagram',
      label: 'Instagram DM',
      replyStyle: [
        'Keep the reply brief, conversational, and human.',
        'Use a natural DM voice without sounding sloppy or overly formal.',
        'Avoid long paragraphs, email-style closings, or corporate filler.',
        'Give a clear next step if the customer is asking for help, pricing, or access.'
      ],
      summaryStyle: 'Capture the customer intent fast, note sales interest or dissatisfaction, and flag whether a human should step in publicly or privately.',
      classifyStyle: 'Bias toward lead intent, sentiment, and whether the DM should move into a higher-touch support or sales workflow.'
    },
    messenger: {
      key: 'messenger',
      label: 'Messenger',
      replyStyle: [
        'Write in a short, friendly chat tone.',
        'Stay helpful and direct, with quick answers and minimal ceremony.',
        'Avoid formal email phrasing or long explanatory blocks.',
        'If the issue is complex, acknowledge it and suggest a human follow-up.'
      ],
      summaryStyle: 'Focus on customer intent, urgency, and whether the conversation can stay in chat or needs escalation.',
      classifyStyle: 'Bias toward support triage, escalation need, and the next operator action.'
    }
  };

  return profiles[providerKey] || {
    key: providerKey || 'manual',
    label: providerKey ? providerKey[0].toUpperCase() + providerKey.slice(1) : 'General messaging',
    replyStyle: [
      'Keep the reply clear, warm, and commercially useful.',
      'Match the channel tone without becoming overly casual or robotic.',
      'Answer directly, and suggest human handoff when certainty or policy risk is low.'
    ],
    summaryStyle: 'Summarize the customer need, urgency, and any follow-up or escalation signal.',
    classifyStyle: 'Classify for operational usefulness and clear next-step routing.'
  };
}

async function createAiAssist(body = {}) {
  return createAiAssistResponse(body, {
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '',
    OPENROUTER_MODEL: env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || '',
    GEMINI_API_KEY: env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
    GEMINI_MODEL: env.GEMINI_MODEL || process.env.GEMINI_MODEL || ''
  });
}

function buildDeepgramRuntimeEnv() {
  return {
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '',
    OPENROUTER_MODEL: env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || '',
    GEMINI_API_KEY: env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
    GEMINI_MODEL: env.GEMINI_MODEL || process.env.GEMINI_MODEL || '',
    DEEPGRAM_API_KEY: env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_KEY || '',
    DEEPGRAM_MODEL: env.DEEPGRAM_MODEL || process.env.DEEPGRAM_MODEL || '',
    DEEPGRAM_AURA_MODEL: env.DEEPGRAM_AURA_MODEL || process.env.DEEPGRAM_AURA_MODEL || '',
    DEEPGRAM_LANGUAGE: env.DEEPGRAM_LANGUAGE || process.env.DEEPGRAM_LANGUAGE || '',
    DEEPGRAM_FILLER_DELAY_MS: env.DEEPGRAM_FILLER_DELAY_MS || process.env.DEEPGRAM_FILLER_DELAY_MS || ''
  };
}

async function handleAiRequest(req, res, mode) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const body = await readJsonBody(req);
  const result = await createAiAssist({ ...body, mode });
  res.writeHead(result.statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(result.body);
}

async function handleVoiceAgentTurn(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const body = await readJsonBody(req);
  const result = await createVoiceAgentTurnResponse(body, buildDeepgramRuntimeEnv());
  res.writeHead(result.statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(result.body);
}

async function handleVoiceNoteAnalysis(req, res, workspaceId) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (!workspaceId) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Workspace id is required' }));
    return;
  }

  if (!hasDeepgramConfig(buildDeepgramRuntimeEnv())) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Deepgram is not configured' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const audioUrl = String(body.audio_url || body.audioUrl || '').trim();
    const audioBase64 = String(body.audio_base64 || body.audioBase64 || '').trim();
    const noteBody = String(body.body || body.transcript || '').trim();
    if (!audioUrl && !audioBase64 && !noteBody) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Provide audio or transcript text for analysis.' }));
      return;
    }

    const analysis = audioUrl || audioBase64
      ? await analyzeVoiceAudio({
        audioUrl,
        audioBase64,
        mimeType: body.audio_mime_type || body.audioMimeType || 'audio/wav',
        language: body.language || 'en'
      }, buildDeepgramRuntimeEnv())
      : await analyzeVoiceText({
        text: noteBody,
        language: body.language || 'en'
      }, buildDeepgramRuntimeEnv());

    const payload = buildVoiceNoteFromAnalysis({
      workspaceId,
      contactId: body.contact_id || body.contactId || '',
      voiceProfileId: body.voice_profile_id || body.voiceProfileId || '',
      voiceSessionId: body.voice_session_id || body.voiceSessionId || '',
      title: body.title || '',
      body: noteBody,
      status: body.status || 'analyzed',
      audioUrl,
      metadata: body.metadata || {}
    }, analysis);

    const linkedSessionId = String(body.voice_session_id || body.voiceSessionId || '').trim();
    const linkedContactId = String(payload.contact_id || body.contact_id || body.contactId || '').trim();
    let record = await createWorkspaceRecordData('voice_notes', workspaceId, payload);
    if (linkedSessionId && record?.id && String(record?.voice_session_id || '').trim() !== linkedSessionId) {
      record = await handleRecordPatchData('voice_notes', record.id, {
        voice_session_id: linkedSessionId
      });
    }
    const contactRecord = linkedContactId ? await getRecordData('contacts', linkedContactId).catch(() => null) : null;
    const voiceSessionRecord = linkedSessionId ? await getRecordData('voice_sessions', linkedSessionId).catch(() => null) : null;
    const followUpAutomation = await createVoiceFollowUpArtifacts(workspaceId, {
      noteRecord: record,
      notePayload: payload,
      analysis,
      contact: contactRecord,
      voiceSession: voiceSessionRecord
    });
    const mergedNoteMetadata = {
      ...(record?.metadata || {}),
      follow_up_plan: followUpAutomation.plan,
      follow_up_sequence_id: followUpAutomation.sequenceRecord?.id || null
    };
    if (record?.id) {
      record = await handleRecordPatchData('voice_notes', record.id, {
        metadata: mergedNoteMetadata
      });
    }
    if (linkedSessionId) {
      await handleRecordPatchData('voice_sessions', linkedSessionId, {
        status: 'completed',
        outcome: body.outcome || 'analyzed',
        analysis_status: 'ready',
        analysis_summary: payload.summary,
        analysis_sentiment: payload.sentiment,
        analysis_metadata: {
          sentiment_score: payload.sentiment_score,
          note_id: record?.id || '',
          source_provider: payload.source_provider || 'deepgram',
          follow_up_plan: followUpAutomation.plan,
          follow_up_sequence_id: followUpAutomation.sequenceRecord?.id || null
        }
      });
    }
    if (record?.id) {
      record = await getRecordData('voice_notes', record.id) || record;
    }
    emitWorkspaceMutation(workspaceId, 'voice.note_saved', {
      record,
      analysis: {
        sourceType: analysis.sourceType,
        sentiment: analysis.sentiment,
        sentimentScore: analysis.sentimentScore
      }
    });
    if (linkedSessionId) {
      emitWorkspaceMutation(workspaceId, 'voice.session_analyzed', {
        voiceSessionId: linkedSessionId,
        analysisSummary: payload.summary,
        analysisSentiment: payload.sentiment,
        noteId: record?.id || '',
        followUpSequenceId: followUpAutomation.sequenceRecord?.id || '',
        followUpTiming: followUpAutomation.plan?.followUpTiming || ''
      });
    }
    if (followUpAutomation.sequenceRecord?.id) {
      emitWorkspaceMutation(workspaceId, 'follow_up.sequence_saved', {
        record: followUpAutomation.sequenceRecord,
        source: 'voice_analysis',
        voiceSessionId: linkedSessionId || null
      });
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(record));
  } catch (error) {
    res.writeHead(500, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ error: error?.message || 'Deepgram voice analysis failed' }));
  }
}

async function handleRecordPatchData(table, recordId, patch = {}) {
  if (!recordId) return null;
  if (hasSupabaseAdminConfig()) {
    const rows = await supabaseRest(table, {
      method: 'PATCH',
      query: `id=eq.${encodeURIComponent(recordId)}`,
      body: {
        ...patch,
        updated_at: new Date().toISOString()
      },
      prefer: 'return=representation'
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }
  return patchDemoCollectionRecord(table, recordId, patch);
}

async function handleWebhookIngest(req, res, provider, workspaceId = '') {
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const verifyToken = env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || '';
    const challenge = url.searchParams.get('hub.challenge') || url.searchParams.get('challenge') || '';
    const mode = url.searchParams.get('hub.mode') || url.searchParams.get('mode') || '';
    const token = url.searchParams.get('hub.verify_token') || url.searchParams.get('verify_token') || '';
    if (provider === 'whatsapp' || provider === 'instagram' || provider === 'messenger' || provider === 'facebook') {
      if (!verifyToken || token !== verifyToken) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Invalid webhook verification token' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(challenge || mode || 'verified');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, provider, workspaceId }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let normalized = null;
  const { body, rawText } = await readRequestBodyWithRaw(req);
  const headers = Object.fromEntries(req.headers ? Object.entries(req.headers) : []);
  const verification = verifyProviderInboundRequest(provider, body, rawText, headers, `${getRequestOrigin(req)}${req.url || ''}`);
  if (!verification.verified) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: verification.reason || 'Invalid webhook signature' }));
    return;
  }
  const syncRecords = extractNangoRecords(body);
  if (syncRecords.length) {
    const syncResults = [];
    for (const [index, record] of syncRecords.entries()) {
      const normalizedRecord = buildNangoWebhookEnvelope({
        provider,
        workspaceId: body.workspaceId || body.workspace_id || workspaceId || '',
        body,
        record,
        index,
        eventType: body.eventType || body.type || `${provider}.sync.record`
      });
      const result = await ingestCanonicalWebhookEvent({
        provider,
        workspaceId: normalizedRecord.workspaceId || workspaceId || '',
        normalized: normalizedRecord,
        verification: normalizedRecord.verification,
        registerReplay: true,
        enqueueJob: true,
        source: 'sync'
      });
      await recordReliabilityEvent(normalizedRecord.workspaceId || workspaceId || '', provider, normalizedRecord.eventType, {
        body,
        record,
        result
      }, {
        status: 'received',
        replayKey: normalizedRecord.messages?.[0]?.externalId || normalizedRecord.conversation?.externalId || '',
        dedupeKey: normalizedRecord.messages?.[0]?.externalId || normalizedRecord.conversation?.externalId || ''
      }).catch((error) => {
        console.warn('Reliability log write failed.', error);
      });
      syncResults.push(result);
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      ok: true,
      source: 'nango-sync',
      provider,
      workspaceId: body.workspaceId || body.workspace_id || workspaceId || '',
      records: syncResults.length,
      results: syncResults
    }));
    return;
  }
  normalized = normalizeWebhookPayload({ ...body, provider, workspaceId, headers });
  if (String(provider || '').toLowerCase() === 'gmail' && body?.message?.data) {
    try {
      const result = await ingestGmailPubsubNotification('gmail', workspaceId, body);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify(result));
      return;
    } catch (error) {
      normalized = normalizeWebhookPayload({
        provider,
        workspaceId,
        headers,
        payload: {
          subject: 'Gmail Pub/Sub notification',
          body: error?.message || 'Failed to hydrate Gmail Pub/Sub notification.',
          historyId: decodePubsubMessageData(body.message.data).historyId || '',
          direction: 'inbound'
        }
      });
      normalized.verification = {
        ...(normalized.verification || {}),
        signatureVerified: verification.verified,
        signatureReason: verification.reason,
        relayHydrationError: error?.message || 'gmail_pubsub_hydration_failed'
      };
    }
  }
  normalized.verification = {
    ...(normalized.verification || {}),
    signatureVerified: verification.verified,
    signatureReason: verification.reason
  };

  try {
    const replay = registerWebhookReplay(normalized.workspaceId || workspaceId || provider, normalized);
    if (!replay.accepted) {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify({
        ok: true,
        duplicate: true,
        replayKey: replay.replayKey,
        provider,
        workspaceId: normalized.workspaceId || workspaceId || ''
      }));
      return;
    }

    const result = await ingestCanonicalWebhookEvent({
      provider,
      workspaceId: normalized.workspaceId || workspaceId,
      normalized,
      verification: normalized.verification,
      registerReplay: false,
      enqueueJob: true,
      source: 'webhook'
    });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(result));
  } catch (error) {
    const replayWorkspaceId = normalized?.workspaceId || workspaceId || provider;
    const replayJob = enqueueWorkspaceJob(replayWorkspaceId, 'provider.webhook.ingest', {
      provider,
      eventType: normalized?.eventType || `${provider}.message.received`,
      verification: normalized?.verification || {
        provider,
        verified: false,
        reason: error?.message || 'Webhook ingest failed'
      },
      normalized: normalized || {
        provider,
        workspaceId: replayWorkspaceId,
        eventType: `${provider}.message.received`,
        verification: { provider, verified: false, reason: error?.message || 'Webhook ingest failed' }
      },
      error: error?.message || String(error)
    });
    if (replayJob?.id) {
      scheduleWorkspaceJobRetry(replayWorkspaceId, replayJob.id, error?.message || `Failed to ingest ${provider} webhook`, {
        note: `Replay webhook ingest for ${provider}`,
        assigned_to: 'Webhook replay worker'
      });
    }
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error?.message || `Failed to ingest ${provider} webhook` }));
  }
}

async function serve(filePath, res) {
  const content = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  res.end(content);
}

async function serveHtmlTemplate(filePath, res, replacements = {}) {
  let content = await fs.readFile(filePath, 'utf8');
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(key, String(value ?? ''));
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/runtime-config.js') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(runtimeConfigSource());
      return;
    }

    if (pathname === '/.netlify/functions/events') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      attachWorkspaceStream(req, res, url.searchParams.get('workspace_id') || url.searchParams.get('workspaceId') || '');
      return;
    }

    if (pathname === '/.netlify/functions/nango-session') {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      const body = await readJsonBody(req);
      const result = await createNangoSession(body);
      res.writeHead(result.statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(result.body);
      return;
    }

    if (pathname === '/auth/google/callback') {
      await handleGmailOAuthCallback(req, res, url);
      return;
    }

    if (pathname === '/auth/meta/callback') {
      await handleMetaOAuthCallback(req, res, url);
      return;
    }

    if (pathname === '/api/auth/facebook/callback') {
      await handleFacebookOAuthCallback(req, res, url);
      return;
    }

    if (pathname === '/api/webhooks/gmail' || pathname === '/.netlify/functions/webhooks-gmail') {
      await handleGmailPubsubWebhook(req, res, url);
      return;
    }

    if (pathname === '/api/webhooks/gmail/watch' || pathname === '/api/test/gmail-watch') {
      await handleGmailWatchActivation(req, res, url);
      return;
    }

    if (pathname === '/api/test/gmail-diagnostics') {
      await handleGmailDiagnostics(req, res, url);
      return;
    }

    if (pathname === '/api/test/lead-notification' || pathname === '/.netlify/functions/test-lead-notification') {
      await handleLeadNotificationTest(req, res);
      return;
    }

    if (pathname === '/api/test/botpress' || pathname === '/.netlify/functions/test-botpress') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      const replyWebhookConfigured = Boolean(
        env.BOTPRESS_WEBHOOK_URL ||
        process.env.BOTPRESS_WEBHOOK_URL ||
        env.BOTPRESS_REPLY_WEBHOOK_URL ||
        process.env.BOTPRESS_REPLY_WEBHOOK_URL
      );
      const tokenPushConfigured = Boolean(
        env.BOTPRESS_TOKEN_PUSH_URL ||
        process.env.BOTPRESS_TOKEN_PUSH_URL ||
        env.BOTPRESS_INSTAGRAM_WEBHOOK_URL ||
        process.env.BOTPRESS_INSTAGRAM_WEBHOOK_URL
      );

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        ok: true,
        configured: replyWebhookConfigured || tokenPushConfigured,
        reply_webhook_configured: replyWebhookConfigured,
        token_push_configured: tokenPushConfigured,
        instagram_ready: replyWebhookConfigured || tokenPushConfigured,
        workspace_id: env.AURAFLOW_DEFAULT_WORKSPACE_ID || process.env.AURAFLOW_DEFAULT_WORKSPACE_ID || ''
      }));
      return;
    }

    if (pathname === '/admin/review-demo') {
      const reviewWorkspaceId = url.searchParams.get('workspace_id') || url.searchParams.get('workspaceId') || env.AURAFLOW_DEFAULT_WORKSPACE_ID || '';
      let workspace = null;
      let snapshot = null;
      const fallbackWorkspaceId = 'ws-northstar-commerce';
      try {
        if (reviewWorkspaceId && hasSupabaseAdminConfig()) {
          snapshot = await loadWorkspaceSnapshot(reviewWorkspaceId);
          const workspaceRows = await supabaseRest('workspaces', {
            query: `id=eq.${encodeURIComponent(reviewWorkspaceId)}&select=*`
          }).catch(() => []);
          workspace = Array.isArray(workspaceRows) ? workspaceRows[0] : workspaceRows;
        }
      } catch (error) {
        console.warn('Review demo snapshot load failed, falling back to demo data.', error);
      }

      if (!snapshot || !snapshot.conversations?.length && !snapshot.channels?.length) {
        const demoSnapshot = loadDemoWorkspaceSnapshot(fallbackWorkspaceId);
        snapshot = demoSnapshot;
        workspace = workspace || demoSnapshot.workspace || {};
      }

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(renderReviewDemoPage({ workspace, snapshot }));
      return;
    }

    if (pathname === '/.netlify/functions/provider-readiness') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify(await getWorkspaceProviderReadiness(url.searchParams.get('workspace_id') || url.searchParams.get('workspaceId') || '')));
      return;
    }

    if (pathname === '/api/sync' || pathname === '/.netlify/functions/workspaces/sync') {
      await handleApiSync(req, res, url.searchParams.get('workspace_id') || url.searchParams.get('workspaceId') || '');
      return;
    }

    if (pathname === '/.netlify/functions/ai-reply') {
      await handleAiRequest(req, res, 'reply');
      return;
    }

    if (pathname === '/.netlify/functions/ai-summary') {
      await handleAiRequest(req, res, 'summary');
      return;
    }

    if (pathname === '/.netlify/functions/ai-classify') {
      await handleAiRequest(req, res, 'classify');
      return;
    }

    if (pathname === '/.netlify/functions/ai-next-action') {
      await handleAiRequest(req, res, 'next_action');
      return;
    }

    if (pathname === '/.netlify/functions/ai-briefing') {
      await handleAiRequest(req, res, 'briefing');
      return;
    }

    if (pathname === '/.netlify/functions/voice-agent-turn') {
      await handleVoiceAgentTurn(req, res);
      return;
    }
    if (pathname === '/.netlify/functions/twilio-voice-token') {
      await handleTwilioVoiceToken(req, res);
      return;
    }
    if (pathname === '/.netlify/functions/twilio-voice-call-start') {
      await handleTwilioVoiceCallStart(req, res);
      return;
    }
    if (pathname === '/.netlify/functions/twilio-voice-twiml') {
      await handleTwilioVoiceTwiml(req, res);
      return;
    }
    if (pathname === '/.netlify/functions/test-voice-relay') {
      await handleTestVoiceRelay(req, res);
      return;
    }

    const webhookRelayTestMatch = pathname.match(/^\/(?:\.netlify\/functions\/test-callback|\.netlify\/functions\/api\/test-callback|api\/test-callback)\/([^/]+)(?:\/test-relay)?$/);
    if (webhookRelayTestMatch) {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      const provider = String(webhookRelayTestMatch[1] || '').toLowerCase();
      const body = await readJsonBody(req);
      const workspaceId = body.workspaceId || body.workspace_id || '';
      const relay = body.relay || body.testRelay || {};
      const syntheticBody = buildRelayTestEnvelope(provider, workspaceId, relay);
      const verification = provider === 'gmail'
        ? {
            provider: 'gmail',
            transport: 'pubsub-push',
            verified: true,
            signed: true,
            authHeaderPresent: true,
            note: 'Gmail relay test executed from the local preview server.'
          }
        : {
            provider,
            transport: 'meta-webhook',
            verified: true,
            signed: true,
            note: 'Meta relay test executed from the local preview server.'
          };

      try {
        const result = await ingestCanonicalWebhookEvent({
          provider,
          workspaceId,
          body: syntheticBody,
          verification,
          registerReplay: true,
          enqueueJob: true,
          source: 'relay-test'
        });
        await recordReliabilityEvent(workspaceId || result.workspaceId || '', provider, 'reliability.test_callback', {
          relay,
          syntheticBody,
          result
        }, {
          status: 'tested',
          replayKey: result?.replayKey || syntheticBody?.messages?.[0]?.externalId || '',
          dedupeKey: result?.replayKey || syntheticBody?.messages?.[0]?.externalId || ''
        }).catch((error) => {
          console.warn('Reliability log write failed.', error);
        });
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({
          ok: true,
          provider,
          workspaceId: result.workspaceId || workspaceId || '',
          relayTest: true,
          ...result
        }));
      } catch (error) {
        res.writeHead(500, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: error?.message || 'Relay test failed' }));
      }
      return;
    }

    if (
      pathname === '/.netlify/functions/whatsapp-webhook'
      || pathname === '/whatsapp-webhook'
      || pathname.startsWith('/.netlify/functions/webhooks/')
      || pathname.startsWith('/.netlify/functions/api/webhook/')
      || pathname.startsWith('/api/webhook/')
    ) {
      const provider = pathname.endsWith('whatsapp-webhook')
        ? 'whatsapp'
        : pathname.split('/').pop();
      const workspaceId = url.searchParams.get('workspace_id')
        || url.searchParams.get('workspaceId')
        || (provider === 'whatsapp' ? (env.AURAFLOW_DEFAULT_WORKSPACE_ID || process.env.AURAFLOW_DEFAULT_WORKSPACE_ID || '') : '');
      await handleWebhookIngest(req, res, provider, workspaceId);
      return;
    }

    if (pathname === '/.netlify/functions/provider-ingest') {
      if (req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({
          ok: true,
          configured: hasSupabaseAdminConfig(),
          contract: getIngestContract()
        }));
        return;
      }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    if (!validateIngestSecret(Object.fromEntries(req.headers ? Object.entries(req.headers) : []))) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Invalid ingest secret' }));
      return;
    }

    let normalized = null;
    const { body, rawText } = await readJsonBodyWithRaw(req);
    try {
      const headers = Object.fromEntries(req.headers ? Object.entries(req.headers) : []);
      const verification = ['whatsapp', 'instagram', 'messenger', 'facebook'].includes(String(body.provider || 'gmail').toLowerCase())
        ? (
          isUnsignedPreviewWebhook(body.provider || 'gmail', body, headers)
            ? { verified: true, reason: 'Local preview seed webhook accepted without Meta signature.' }
            : verifyMetaWebhookSignature(rawText, headers)
        )
        : { verified: true, reason: 'Non-Meta provider.' };
        if (!verification.verified) {
          res.writeHead(401, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          });
          res.end(JSON.stringify({ error: verification.reason || 'Invalid webhook signature' }));
          return;
        }
        normalized = normalizeWebhookPayload({
          ...body,
          provider: body.provider || 'gmail',
          workspaceId: body.workspaceId || body.workspace_id || '',
          headers
        });
        normalized.verification = { ...(normalized.verification || {}), signatureVerified: verification.verified, signatureReason: verification.reason };
        const replay = registerWebhookReplay(normalized.workspaceId || body.workspaceId || body.workspace_id, normalized);
        if (!replay.accepted) {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          });
          res.end(JSON.stringify({
            ok: true,
            duplicate: true,
            replayKey: replay.replayKey,
            provider: normalized.provider || body.provider || 'gmail',
            workspaceId: normalized.workspaceId || body.workspaceId || body.workspace_id || ''
          }));
          return;
        }
        const result = hasSupabaseAdminConfig()
          ? await ingestProviderPayload(body)
          : ingestDemoProviderPayload(body);
        await applyDeliveryReceipts(normalized.workspaceId || body.workspaceId || body.workspace_id || result.workspaceId, normalized);
        const workflowPlan = enqueueInboundWorkflow(body.provider || normalized.provider || 'gmail', normalized, result);
        enqueueWorkspaceJob(body.workspaceId || body.workspace_id || result.workspaceId, 'provider.ingest', {
          body,
          eventType: normalized.eventType,
          verification: normalized.verification
        });
        emitWorkspaceMutation(body.workspaceId || body.workspace_id || result.workspaceId, 'provider.ingest.completed', {
          body,
          eventType: normalized.eventType,
          verification: normalized.verification,
          result,
          workflowPlan
        });
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ ...result, workflowPlan }));
      } catch (error) {
        const replayWorkspaceId = body.workspaceId || body.workspace_id || normalized?.workspaceId || '';
        const replayJob = enqueueWorkspaceJob(replayWorkspaceId, 'provider.ingest', {
          body,
          eventType: normalized?.eventType || `${body.provider || 'gmail'}.message.received`,
          verification: normalized?.verification || verification,
          error: error?.message || String(error)
        });
        if (replayJob?.id) {
          scheduleWorkspaceJobRetry(replayWorkspaceId, replayJob.id, error?.message || 'Provider ingestion failed', {
            note: `Replay provider ingest for ${body.provider || normalized.provider || 'gmail'}`,
            assigned_to: 'Webhook replay worker'
          });
        }
        res.writeHead(500, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: error?.message || 'Provider ingestion failed' }));
      }
      return;
    }

    const workspaceChannelsMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/channels$/);
    if (workspaceChannelsMatch) {
      await handleChannelCollection(req, res, workspaceChannelsMatch[1]);
      return;
    }

    const workspaceConnectionsMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/connections$/);
    if (workspaceConnectionsMatch) {
      await handleWorkspaceConnectionCollection(req, res, workspaceConnectionsMatch[1]);
      return;
    }

    const workspaceConnectionStartMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/connections\/([^/]+)\/start$/);
    if (workspaceConnectionStartMatch) {
      await handleChannelConnectSession(req, res, workspaceConnectionStartMatch[1]);
      return;
    }

    const workspaceChannelConnectSessionMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/channels\/connect-session$/);
    if (workspaceChannelConnectSessionMatch) {
      await handleChannelConnectSession(req, res, workspaceChannelConnectSessionMatch[1]);
      return;
    }

    const workspaceChannelSyncMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/channels\/sync$/);
    if (workspaceChannelSyncMatch) {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }
      const body = await readJsonBody(req);
      const result = hasSupabaseAdminConfig()
        ? await supabaseRest('channels', {
          method: 'POST',
          query: 'on_conflict=workspace_id,provider',
          body: Array.isArray(body?.providers) ? body.providers : []
        })
        : listDemoCollection(workspaceChannelSyncMatch[1], 'channels');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(toArray(result)));
      return;
    }

    const workspaceSnapshotMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/snapshot$/);
    if (workspaceSnapshotMatch) {
      await handleWorkspaceSnapshot(req, res, workspaceSnapshotMatch[1]);
      return;
    }

    const channelRecordMatch = pathname.match(/^\/\.netlify\/functions\/channels\/([^/]+)$/);
    if (channelRecordMatch) {
      await handleChannelRecord(req, res, channelRecordMatch[1]);
      return;
    }

    const connectionRecordMatch = pathname.match(/^\/\.netlify\/functions\/connections\/([^/]+)$/);
    if (connectionRecordMatch) {
      await handleWorkspaceConnectionRecord(req, res, connectionRecordMatch[1]);
      return;
    }

    const workspaceConversationsMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/conversations$/);
    if (workspaceConversationsMatch) {
      await handleWorkspaceCollection(req, res, workspaceConversationsMatch[1], 'conversations');
      return;
    }

    const workspaceContactsMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/contacts$/);
    if (workspaceContactsMatch) {
      await handleWorkspaceCollection(req, res, workspaceContactsMatch[1], 'contacts');
      return;
    }
    const workspaceContactPhoneBackfillMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/contacts\/backfill-phone-health$/);
    if (workspaceContactPhoneBackfillMatch) {
      await handleWorkspacePhoneHealthBackfill(req, res, workspaceContactPhoneBackfillMatch[1]);
      return;
    }

    const workspaceLeadsMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/leads$/);
    if (workspaceLeadsMatch) {
      await handleWorkspaceCollection(req, res, workspaceLeadsMatch[1], 'leads');
      return;
    }

    const workspaceMessagesMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/messages$/);
    if (workspaceMessagesMatch) {
      await handleWorkspaceCollection(req, res, workspaceMessagesMatch[1], 'messages');
      return;
    }

    const workspaceAgentsMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/agents$/);
    if (workspaceAgentsMatch) {
      await handleWorkspaceCollection(req, res, workspaceAgentsMatch[1], 'agents');
      return;
    }

    const workspaceFollowUpsMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/follow-ups$/);
    if (workspaceFollowUpsMatch) {
      await handleWorkspaceCollection(req, res, workspaceFollowUpsMatch[1], 'follow_up_sequences');
      return;
    }

    const workspaceVoiceProfilesMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/voice-profiles$/);
    if (workspaceVoiceProfilesMatch) {
      await handleWorkspaceCollection(req, res, workspaceVoiceProfilesMatch[1], 'voice_profiles');
      return;
    }

    const workspaceVoiceSessionsMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/voice-sessions$/);
    if (workspaceVoiceSessionsMatch) {
      await handleWorkspaceCollection(req, res, workspaceVoiceSessionsMatch[1], 'voice_sessions');
      return;
    }

    const workspaceVoiceNotesMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/voice-notes$/);
    if (workspaceVoiceNotesMatch) {
      await handleWorkspaceCollection(req, res, workspaceVoiceNotesMatch[1], 'voice_notes');
      return;
    }

    const workspaceVoiceNoteAnalyzeMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/voice-notes\/analyze$/);
    if (workspaceVoiceNoteAnalyzeMatch) {
      await handleVoiceNoteAnalysis(req, res, workspaceVoiceNoteAnalyzeMatch[1]);
      return;
    }

    const workspaceKnowledgeMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/workspace-knowledge$/);
    if (workspaceKnowledgeMatch) {
      await handleWorkspaceKnowledgeUpload(req, res, workspaceKnowledgeMatch[1]);
      return;
    }

    const workspaceActivityEventsMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/activity-events$/);
    if (workspaceActivityEventsMatch) {
      await handleWorkspaceActivityEvents(req, res, workspaceActivityEventsMatch[1]);
      return;
    }

    const workspaceReliabilityMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/reliability$/);
    if (workspaceReliabilityMatch) {
      await handleWorkspaceReliability(req, res, workspaceReliabilityMatch[1]);
      return;
    }

    const webhookReplayRetryMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/replay-events\/([^/]+)\/retry$/);
    if (webhookReplayRetryMatch) {
      await handleWebhookReplayRetry(req, res, webhookReplayRetryMatch[1], webhookReplayRetryMatch[2]);
      return;
    }

    const workspaceSearchMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/search$/);
    if (workspaceSearchMatch) {
      await handleWorkspaceSearch(req, res, workspaceSearchMatch[1]);
      return;
    }

    const workspaceJobsMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/sync-jobs$/);
    const workspaceJobMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/sync-jobs\/([^/]+)$/);
    if (workspaceJobMatch) {
      if (req.method !== 'PATCH') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      try {
        const body = await readJsonBody(req);
        const job = updateWorkspaceJob(workspaceJobMatch[1], workspaceJobMatch[2], body);
        if (!job) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: 'Workflow job not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(job));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: error?.message || 'Failed to update workflow job' }));
      }
      return;
    }
    if (workspaceJobsMatch) {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(listWorkspaceJobs(workspaceJobsMatch[1])));
        return;
      }

      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const job = enqueueWorkspaceJob(workspaceJobsMatch[1], body.type || body.jobType || 'manual', body.payload || body);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(job));
        return;
      }

      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    if (pathname === '/.netlify/functions/workspaces') {
      await handleWorkspaceCollectionRoot(req, res);
      return;
    }

    const workspaceMembersMatch = pathname.match(/^\/\.netlify\/functions\/workspaces\/([^/]+)\/members$/);
    if (workspaceMembersMatch) {
      await handleWorkspaceMemberCollection(req, res, workspaceMembersMatch[1]);
      return;
    }

    const contactRecordMatch = pathname.match(/^\/\.netlify\/functions\/contacts\/([^/]+)$/);
    if (contactRecordMatch) {
      await handleRecordPatch(req, res, 'contacts', contactRecordMatch[1]);
      return;
    }

    const conversationReplyMatch = pathname.match(/^\/\.netlify\/functions\/conversations\/([^/]+)\/reply$/);
    if (conversationReplyMatch) {
      await handleConversationReply(req, res, conversationReplyMatch[1]);
      return;
    }

    const conversationQueueMatch = pathname.match(/^\/\.netlify\/functions\/conversations\/([^/]+)\/reply-queue$/);
    if (conversationQueueMatch) {
      await handleConversationReply(req, res, conversationQueueMatch[1]);
      return;
    }

    const conversationRecordMatch = pathname.match(/^\/\.netlify\/functions\/conversations\/([^/]+)$/);
    if (conversationRecordMatch) {
      await handleRecordPatch(req, res, 'conversations', conversationRecordMatch[1]);
      return;
    }

    const contactMergeMatch = pathname.match(/^\/\.netlify\/functions\/contacts\/([^/]+)\/merge$/);
    if (contactMergeMatch) {
      await handleContactMerge(req, res, contactMergeMatch[1]);
      return;
    }

    const messageDeliveryStateMatch = pathname.match(/^\/\.netlify\/functions\/messages\/provider\/([^/]+)\/state$/);
    if (messageDeliveryStateMatch) {
      if (req.method !== 'PATCH') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      try {
        const body = await readJsonBody(req);
        const workspaceId = body.workspace_id || body.workspaceId || '';
        const record = await updateMessageDeliveryState(workspaceId, messageDeliveryStateMatch[1], {
          delivery_state: body.delivery_state || body.deliveryState || 'sent',
          raw_payload: body.raw_payload || body.rawPayload || {},
          delivery_receipts: Array.isArray(body.delivery_receipts || body.deliveryReceipts) ? (body.delivery_receipts || body.deliveryReceipts) : undefined
        });
        if (!record) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: 'Message not found' }));
          return;
        }
        emitWorkspaceMutation(record?.workspace_id || workspaceId, 'message.updated', {
          record,
          body
        });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(record));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: error?.message || 'Failed to update message state' }));
      }
      return;
    }

    const messageRecordMatch = pathname.match(/^\/\.netlify\/functions\/messages\/([^/]+)$/);
    if (messageRecordMatch) {
      await handleRecordPatch(req, res, 'messages', messageRecordMatch[1]);
      return;
    }

    const agentRecordMatch = pathname.match(/^\/\.netlify\/functions\/agents\/([^/]+)$/);
    if (agentRecordMatch) {
      await handleRecordPatch(req, res, 'agents', agentRecordMatch[1]);
      return;
    }

    const voiceProfileRecordMatch = pathname.match(/^\/\.netlify\/functions\/voice-profiles\/([^/]+)$/);
    if (voiceProfileRecordMatch) {
      await handleRecordPatch(req, res, 'voice_profiles', voiceProfileRecordMatch[1]);
      return;
    }

    const voiceSessionRecordMatch = pathname.match(/^\/\.netlify\/functions\/voice-sessions\/([^/]+)$/);
    if (voiceSessionRecordMatch) {
      await handleRecordPatch(req, res, 'voice_sessions', voiceSessionRecordMatch[1]);
      return;
    }

    const apiVoiceSessionRecordMatch = pathname.match(/^\/api\/voice-sessions\/([^/]+)$/);
    if (apiVoiceSessionRecordMatch) {
      await handleRecordPatch(req, res, 'voice_sessions', apiVoiceSessionRecordMatch[1]);
      return;
    }

    const voiceNoteRecordMatch = pathname.match(/^\/\.netlify\/functions\/voice-notes\/([^/]+)$/);
    if (voiceNoteRecordMatch) {
      await handleRecordPatch(req, res, 'voice_notes', voiceNoteRecordMatch[1]);
      return;
    }

    if (pathname === '/' || pathname === '/index.html') {
      await serve(path.join(root, 'index.html'), res);
      return;
    }

    if (pathname === '/preview.html') {
      const redirectUrl = new URL('/dashboard', 'http://localhost');
      url.searchParams.forEach((value, key) => redirectUrl.searchParams.set(key, value));
      res.writeHead(302, {
        Location: `${redirectUrl.pathname}${redirectUrl.search}`
      });
      res.end();
      return;
    }

    if (pathname === '/dashboard' || pathname === '/dashboard/' || pathname === '/dashboard/index.html') {
      await serve(path.join(root, 'preview.html'), res);
      return;
    }

    if (pathname === '/privacy' || pathname === '/privacy.html') {
      await serveHtmlTemplate(path.join(root, 'privacy.html'), res, {
        '__AURAFLOW_FACEBOOK_APP_ID__': env.FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID || env.META_APP_ID || process.env.META_APP_ID || ''
      });
      return;
    }

    if (pathname === '/data-deletion' || pathname === '/data-deletion.html') {
      await serve(path.join(root, 'data-deletion.html'), res);
      return;
    }

    if (pathname === '/health' || pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, port, service: 'auraflow-relay' }));
      return;
    }

    if (pathname === '/twilio-media-stream' || pathname === '/twilio-media-stream/') {
      res.writeHead(426, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify({
        ok: false,
        error: 'websocket_upgrade_required',
        message: 'This endpoint accepts WebSocket upgrades for Twilio Media Streams.'
      }));
      return;
    }

    const target = path.normalize(path.join(root, pathname.replace(/^\//, '')));
    if (!target.startsWith(root)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    await serve(target, res);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

const mediaRelayServer = new WebSocketServer({ noServer: true });

mediaRelayServer.on('error', (error) => {
  console.warn('Twilio media relay server error:', error?.message || error);
});

mediaRelayServer.on('connection', (socket, request) => {
  socket.on('error', (error) => {
    console.warn('Twilio media relay socket error:', error?.message || error);
  });
  const deepgramApiKey = String(process.env.DEEPGRAM_API_KEY || '').trim();
  const relayState = {
    workspaceId: '',
    voiceSessionId: '',
    conversationId: '',
    contactId: '',
    contactName: '',
    identity: '',
    streamSid: '',
    liveMood: 'neutral',
    transcriptSegments: [],
    baseMetadata: {},
    sockets: new Map(),
    persistTimer: null,
    sentimentTimer: null,
    sentimentInFlight: false
  };

  const trackToSpeaker = (track = '') => String(track || '').toLowerCase() === 'outbound' ? 'Operator' : 'Lead';

  const publishTranscriptState = (phase, detail = {}) => {
    if (!relayState.workspaceId) return;
    publishWorkspaceEvent(relayState.workspaceId, {
      type: 'voice.transcript.relay',
      mutationType: phase,
      detail: {
        workspaceId: relayState.workspaceId,
        voiceSessionId: relayState.voiceSessionId,
        conversationId: relayState.conversationId,
        contactId: relayState.contactId,
        mood: relayState.liveMood,
        ...detail
      }
    });
  };

  const buildTranscriptPatch = () => ({
    analysis_status: relayState.transcriptSegments.length ? 'in_progress' : 'pending',
    analysis_sentiment: relayState.liveMood,
    analysis_metadata: {
      ...relayState.baseMetadata,
      call_state: 'connected',
      relay_stream_sid: relayState.streamSid || null,
      conversation_id: relayState.conversationId || relayState.baseMetadata.conversation_id || null,
      contact_id: relayState.contactId || null,
      contact_name: relayState.contactName || relayState.baseMetadata.contact_name || null,
      softphone_identity: relayState.identity || relayState.baseMetadata.softphone_identity || null,
      live_mood: relayState.liveMood,
      live_transcript: relayState.transcriptSegments.slice(-24),
      relay_url: getMediaStreamRelayUrl(relayState.workspaceId, relayState.voiceSessionId),
      last_transcript_at: new Date().toISOString()
    }
  });

  const persistRelaySnapshot = async () => {
    if (!relayState.voiceSessionId) return;
    try {
      const record = await handleRecordPatchData('voice_sessions', relayState.voiceSessionId, buildTranscriptPatch());
      relayState.baseMetadata = record?.analysis_metadata || relayState.baseMetadata;
    } catch (error) {
      publishTranscriptState('relay.error', { message: error?.message || 'Failed to persist live transcript snapshot.' });
    }
  };

  const scheduleRelaySnapshotPersist = () => {
    if (relayState.persistTimer) return;
    relayState.persistTimer = setTimeout(async () => {
      relayState.persistTimer = null;
      await persistRelaySnapshot();
    }, 900);
  };

  const refreshLiveMood = async () => {
    if (relayState.sentimentInFlight) return;
    const finalTranscript = relayState.transcriptSegments.filter((item) => item.final !== false).map((item) => item.text).join(' ').trim();
    if (!finalTranscript) return;
    relayState.sentimentInFlight = true;
    try {
      const sentiment = await analyzeVoiceText({ text: finalTranscript.slice(-3000) });
      relayState.liveMood = String(sentiment?.sentiment || 'neutral').trim().toLowerCase() || 'neutral';
      publishTranscriptState('relay.mood', { mood: relayState.liveMood });
      scheduleRelaySnapshotPersist();
    } catch (error) {
      publishTranscriptState('relay.error', { message: error?.message || 'Failed to refresh live call mood.' });
    } finally {
      relayState.sentimentInFlight = false;
    }
  };

  const scheduleMoodRefresh = () => {
    if (relayState.sentimentTimer) clearTimeout(relayState.sentimentTimer);
    relayState.sentimentTimer = setTimeout(() => {
      relayState.sentimentTimer = null;
      refreshLiveMood().catch(() => null);
    }, 1200);
  };

  const ensureDeepgramSocket = (track = 'inbound') => {
    const normalizedTrack = String(track || 'inbound').toLowerCase();
    if (!deepgramApiKey) return null;
    if (relayState.sockets.has(normalizedTrack)) return relayState.sockets.get(normalizedTrack);
    const deepgramSocket = new WebSocket(buildDeepgramStreamingUrl(), {
      headers: {
        Authorization: `Token ${deepgramApiKey}`
      }
    });
    relayState.sockets.set(normalizedTrack, deepgramSocket);
    deepgramSocket.on('open', () => {
      publishTranscriptState('relay.connected', {
        message: `Deepgram relay connected for ${normalizedTrack}.`,
        track: normalizedTrack
      });
    });
    deepgramSocket.on('message', (data) => {
      try {
        const payload = JSON.parse(Buffer.from(data).toString('utf8'));
        const transcript = String(payload?.channel?.alternatives?.[0]?.transcript || '').trim();
        if (!transcript) return;
        const isFinal = Boolean(payload?.is_final);
        const speaker = trackToSpeaker(normalizedTrack);
        const startedAt = new Date().toISOString();
        const last = relayState.transcriptSegments.at(-1);
        if (last && last.speaker === speaker && last.final === false) {
          last.text = transcript;
          last.final = isFinal;
          last.startedAt = startedAt;
        } else {
          relayState.transcriptSegments.push({
            speaker,
            text: transcript,
            final: isFinal,
            startedAt
          });
        }
        relayState.transcriptSegments = relayState.transcriptSegments.slice(-24);
        publishTranscriptState('relay.transcript', {
          transcript,
          isFinal,
          speaker,
          track: normalizedTrack,
          startedAt
        });
        scheduleRelaySnapshotPersist();
        if (isFinal) {
          scheduleMoodRefresh();
        }
      } catch (error) {
        publishTranscriptState('relay.error', { message: error?.message || 'Failed to parse Deepgram transcript payload.' });
      }
    });
    deepgramSocket.on('error', (error) => {
      publishTranscriptState('relay.error', { message: error?.message || 'Deepgram relay error.', track: normalizedTrack });
    });
    return deepgramSocket;
  };

  if (!deepgramApiKey) {
    publishTranscriptState('relay.idle', { message: 'Deepgram API key is not configured yet. Relay is waiting.' });
  }

  socket.on('message', (raw) => {
    try {
      const payload = JSON.parse(Buffer.from(raw).toString('utf8'));
      if (payload?.event === 'start') {
        const params = payload?.start?.customParameters || {};
        relayState.workspaceId = String(params.workspaceId || '').trim();
        relayState.voiceSessionId = String(params.voiceSessionId || '').trim();
        relayState.conversationId = String(params.conversationId || '').trim();
        relayState.contactId = String(params.contactId || '').trim();
        relayState.contactName = String(params.contactName || '').trim();
        relayState.identity = String(params.identity || '').trim();
        relayState.streamSid = String(payload?.start?.streamSid || '').trim();
        if (relayState.voiceSessionId) {
          getRecordData('voice_sessions', relayState.voiceSessionId)
            .then((record) => {
              relayState.baseMetadata = record?.analysis_metadata || {};
            })
            .catch(() => null);
        }
        publishTranscriptState('relay.started', {
          streamSid: relayState.streamSid || null,
          message: 'Twilio media stream connected.'
        });
        return;
      }
      if (payload?.event === 'media' && payload?.media?.payload) {
        const track = String(payload?.media?.track || 'inbound').toLowerCase();
        const deepgramSocket = ensureDeepgramSocket(track);
        if (deepgramSocket?.readyState === WebSocket.OPEN) {
          deepgramSocket.send(Buffer.from(String(payload.media.payload), 'base64'));
        }
        return;
      }
      if (payload?.event === 'stop') {
        publishTranscriptState('relay.stopped', { streamSid: payload?.stop?.streamSid || null });
        if (relayState.sentimentTimer) {
          clearTimeout(relayState.sentimentTimer);
          relayState.sentimentTimer = null;
        }
        refreshLiveMood().catch(() => null).finally(() => {
          persistRelaySnapshot().catch(() => null);
        });
        relayState.sockets.forEach((item) => item?.close?.());
      }
    } catch (error) {
      publishTranscriptState('relay.error', { message: error?.message || 'Failed to process Twilio media stream payload.' });
    }
  });

  socket.on('close', () => {
    if (relayState.persistTimer) {
      clearTimeout(relayState.persistTimer);
      relayState.persistTimer = null;
    }
    if (relayState.sentimentTimer) {
      clearTimeout(relayState.sentimentTimer);
      relayState.sentimentTimer = null;
    }
    relayState.sockets.forEach((item) => item?.close?.());
    publishTranscriptState('relay.closed', { message: 'Twilio media relay socket closed.' });
  });
});

server.on('upgrade', (request, socket, head) => {
  socket.on('error', (error) => {
    console.warn('Upgrade socket error:', error?.message || error);
  });
  let upgradeUrl;
  try {
    upgradeUrl = new URL(request.url || '/', `http://${request.headers.host || `localhost:${port}`}`);
  } catch (error) {
    console.warn('Failed to parse websocket upgrade URL:', error?.message || error);
    socket.destroy();
    return;
  }
  if (upgradeUrl.pathname !== '/twilio-media-stream' && upgradeUrl.pathname !== '/twilio-media-stream/') {
    socket.destroy();
    return;
  }
  try {
    mediaRelayServer.handleUpgrade(request, socket, head, (ws) => {
      mediaRelayServer.emit('connection', ws, request);
    });
  } catch (error) {
    console.warn('WebSocket upgrade handling failed:', error?.message || error);
    socket.destroy();
  }
});

server.on('error', (error) => {
  console.error('AuraFlow preview failed to start:', error.message);
  process.exitCode = 1;
});

server.listen(port, '0.0.0.0', () => {
  startReplayWorker();
  startProviderHealthWorker();
  startGmailWatchRenewalWorker();
  console.log(`AuraFlow preview running at http://localhost:${port}`);
});
