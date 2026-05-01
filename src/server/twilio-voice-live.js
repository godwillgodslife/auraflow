function normalizeText(value, fallback = '') {
  return String(value || '').trim() || fallback;
}

function getSupabaseAdminConfig(runtimeEnv = {}) {
  return {
    url: runtimeEnv.SUPABASE_URL || process.env.SUPABASE_URL || '',
    serviceKey:
      runtimeEnv.AURAFLOW_SUPABASE_SERVICE_ROLE_KEY
      || runtimeEnv.SUPABASE_SERVICE_ROLE_KEY
      || process.env.AURAFLOW_SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || '',
    schema: runtimeEnv.SUPABASE_SCHEMA || process.env.SUPABASE_SCHEMA || 'public'
  };
}

export function hasVoiceSupabaseAdminConfig(runtimeEnv = {}) {
  const { url, serviceKey } = getSupabaseAdminConfig(runtimeEnv);
  return Boolean(url && serviceKey);
}

function buildSupabaseHeaders(serviceKey, schema, prefer = 'return=representation') {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Profile': schema || 'public',
    'Content-Profile': schema || 'public',
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function readJson(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

async function supabaseRest(pathname, { method = 'GET', body = null, query = '', prefer = 'return=representation' } = {}, runtimeEnv = {}) {
  const { url, serviceKey, schema } = getSupabaseAdminConfig(runtimeEnv);
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
    headers: buildSupabaseHeaders(serviceKey, schema, prefer),
    body: body ? JSON.stringify(body) : undefined
  });
  return readJson(response);
}

export function getPublicBaseUrl(runtimeEnv = {}, fallbackOrigin = '') {
  return normalizeText(
    runtimeEnv.AURAFLOW_PUBLIC_BASE_URL
    || runtimeEnv.PUBLIC_BASE_URL
    || runtimeEnv.URL
    || process.env.AURAFLOW_PUBLIC_BASE_URL
    || process.env.PUBLIC_BASE_URL
    || process.env.URL
    || fallbackOrigin,
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

export function getMediaStreamRelayUrl(runtimeEnv = {}, fallbackOrigin = '') {
  const explicit = normalizeText(
    runtimeEnv.TWILIO_MEDIA_STREAM_WSS_URL
    || runtimeEnv.AURAFLOW_MEDIA_STREAM_WSS_URL
    || process.env.TWILIO_MEDIA_STREAM_WSS_URL
    || process.env.AURAFLOW_MEDIA_STREAM_WSS_URL
  );
  if (explicit) return explicit.replace(/\/$/, '');
  const baseUrl = getPublicBaseUrl(runtimeEnv, fallbackOrigin);
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(baseUrl)) {
    return `${baseUrl.replace(/^http/i, 'ws')}/twilio-media-stream`;
  }
  return '';
}

function getTwilioVoiceConfig(runtimeEnv = {}) {
  return {
    accountSid: normalizeText(runtimeEnv.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID),
    apiKeySid: normalizeText(runtimeEnv.TWILIO_API_KEY || runtimeEnv.TWILIO_API_KEY_SID || process.env.TWILIO_API_KEY || process.env.TWILIO_API_KEY_SID),
    apiKeySecret: normalizeText(runtimeEnv.TWILIO_API_SECRET || process.env.TWILIO_API_SECRET),
    appSid: normalizeText(runtimeEnv.TWILIO_VOICE_APP_SID || runtimeEnv.TWILIO_TWIML_APP_SID || process.env.TWILIO_VOICE_APP_SID || process.env.TWILIO_TWIML_APP_SID),
    callerId: normalizeText(runtimeEnv.TWILIO_VOICE_CALLER_ID || process.env.TWILIO_VOICE_CALLER_ID || process.env.TWILIO_SMS_FROM_NUMBER || process.env.TWILIO_WHATSAPP_NUMBER),
    tokenTtlSeconds: Math.max(300, Number(runtimeEnv.TWILIO_VOICE_TOKEN_TTL || process.env.TWILIO_VOICE_TOKEN_TTL || 3600))
  };
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createSignedJwt(header, payload, secret) {
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = toBase64Url(crypto.createHmac('sha256', secret).update(data).digest());
  return `${data}.${signature}`;
}

export function buildSoftphoneIdentity({ workspaceId = '', user = {}, role = '' } = {}) {
  const email = normalizeText(user?.email, '').toLowerCase();
  const local = email.includes('@') ? email.split('@')[0] : email;
  const workspaceToken = normalizeText(workspaceId, 'workspace').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 32) || 'workspace';
  const userToken = normalizeText(local || role, 'agent').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 32) || 'agent';
  return `auraflow-${workspaceToken}-${userToken}`.slice(0, 120);
}

export async function createTwilioVoiceAccessToken({ workspaceId = '', user = {}, role = '' } = {}, runtimeEnv = {}) {
  const config = getTwilioVoiceConfig(runtimeEnv);
  if (!config.accountSid || !config.apiKeySid || !config.apiKeySecret || !config.appSid) {
    throw new Error('Twilio Voice config is incomplete.');
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const identity = buildSoftphoneIdentity({ workspaceId, user, role });
  const payload = {
    jti: `${config.apiKeySid}-${nowSeconds}`,
    iss: config.apiKeySid,
    sub: config.accountSid,
    iat: nowSeconds,
    exp: nowSeconds + config.tokenTtlSeconds,
    grants: {
      identity,
      voice: {
        outgoing: {
          application_sid: config.appSid,
          params: {
            workspaceId,
            role: normalizeText(role, 'agent')
          }
        },
        incoming: {
          allow: false
        }
      }
    }
  };
  const token = createSignedJwt({ typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' }, payload, config.apiKeySecret);
  return {
    token,
    identity,
    expiresAt: new Date((nowSeconds + config.tokenTtlSeconds) * 1000).toISOString(),
    appSid: config.appSid,
    callerId: config.callerId || null
  };
}

export async function createVoiceSessionRecord(payload = {}, runtimeEnv = {}) {
  if (!hasVoiceSupabaseAdminConfig(runtimeEnv)) {
    throw new Error('Supabase admin config is required for voice session creation.');
  }
  const workspaceId = normalizeText(payload.workspaceId || payload.workspace_id);
  const conversationId = normalizeText(payload.conversationId || payload.conversation_id);
  const contactId = normalizeText(payload.contactId || payload.contact_id);
  const contactName = normalizeText(payload.contactName || payload.contact_name, 'Lead');
  const to = normalizeText(payload.to);
  const identity = normalizeText(payload.identity, 'softphone');
  const voiceProfileId = normalizeText(payload.voiceProfileId || payload.voice_profile_id);
  if (!workspaceId || !to) {
    throw new Error('workspaceId and destination phone are required.');
  }
  const now = new Date().toISOString();
  const relayUrl = getMediaStreamRelayUrl(runtimeEnv);
  const rows = await supabaseRest('voice_sessions', {
    method: 'POST',
    body: [{
      workspace_id: workspaceId,
      contact_id: contactId || null,
      voice_profile_id: voiceProfileId || null,
      status: 'dialing',
      session_type: 'call',
      disclosure_text: normalizeText(payload.disclosureText || payload.disclosure_text, 'This call may be recorded for quality and training.'),
      outcome: null,
      analysis_status: 'pending',
      analysis_summary: null,
      analysis_sentiment: null,
      analysis_metadata: {
        source: 'softphone_bootstrap',
        transport: 'twilio_voice_sdk_browser',
        conversation_id: conversationId || null,
        destination_phone: to,
        contact_name: contactName,
        softphone_identity: identity || null,
        call_state: 'dialing',
        relay_url: relayUrl,
        live_mood: 'neutral',
        live_transcript: [],
        started_at: now
      },
      created_at: now,
      updated_at: now
    }]
  }, runtimeEnv);
  const session = Array.isArray(rows) ? rows[0] : rows;
  return {
    session,
    relayUrl,
    twimlUrl: `${getPublicBaseUrl(runtimeEnv)}/.netlify/functions/twilio-voice-twiml`
  };
}

export async function patchVoiceSessionRecord(sessionId, patch = {}, runtimeEnv = {}) {
  if (!sessionId) throw new Error('sessionId is required.');
  const rows = await supabaseRest('voice_sessions', {
    method: 'PATCH',
    query: `id=eq.${encodeURIComponent(sessionId)}`,
    body: {
      ...patch,
      updated_at: patch.updated_at || new Date().toISOString()
    }
  }, runtimeEnv);
  return Array.isArray(rows) ? rows[0] : rows;
}

function escapeXml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function renderTwilioVoiceTwiML(requestLike = {}, runtimeEnv = {}, fallbackOrigin = '') {
  const config = getTwilioVoiceConfig(runtimeEnv);
  const to = normalizeText(requestLike.To || requestLike.to);
  const workspaceId = normalizeText(requestLike.workspaceId || requestLike.workspace_id);
  const voiceSessionId = normalizeText(requestLike.voiceSessionId || requestLike.voice_session_id);
  const conversationId = normalizeText(requestLike.conversationId || requestLike.conversation_id);
  const contactId = normalizeText(requestLike.contactId || requestLike.contact_id);
  const contactName = normalizeText(requestLike.contactName || requestLike.contact_name);
  const identity = normalizeText(requestLike.identity);
  const relayUrl = getMediaStreamRelayUrl(runtimeEnv, fallbackOrigin);

  const params = [
    ['workspaceId', workspaceId],
    ['voiceSessionId', voiceSessionId],
    ['conversationId', conversationId],
    ['contactId', contactId],
    ['contactName', contactName],
    ['identity', identity]
  ].filter(([, value]) => Boolean(value));

  const parameterXml = params.map(([name, value]) => `<Parameter name="${escapeXml(name)}" value="${escapeXml(value)}" />`).join('');
  const dialTarget = to
    ? `<Dial callerId="${escapeXml(config.callerId || '')}"><Number>${escapeXml(to)}</Number></Dial>`
    : '<Say>Missing destination number.</Say>';

  const streamBlock = relayUrl
    ? `<Start>
    <Stream url="${escapeXml(relayUrl)}" track="both_tracks">
      ${parameterXml}
    </Stream>
  </Start>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamBlock}
  ${dialTarget}
</Response>`;
}
import crypto from 'node:crypto';
