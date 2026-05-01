import { buildNangoWebhookEnvelope, buildNangoTriggerBody, extractNangoRecords } from "./provider-sync.ts";
import { normalizeChannel, normalizeSourceProvider, resolveChannel } from "./integration-vocab.ts";

function env(name, fallback = "") {
  return Deno.env.get(name) || fallback;
}

function normalizeText(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function normalizeBoolean(value) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return false;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePhone(value) {
  const raw = normalizeText(value, "");
  if (!raw) return "";
  const cleaned = raw.replace(/^whatsapp:/i, "").replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  return `+${cleaned}`;
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
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function supabaseBase() {
  return env("SUPABASE_URL").replace(/\/$/, "");
}

function supabaseHeaders() {
  const serviceKey = env("AURAFLOW_SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  const schema = env("SUPABASE_SCHEMA", "public");
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema
  };
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function supabaseRest(pathname, { method = "GET", query = "", body = null, prefer = "return=representation" } = {}) {
  const baseUrl = supabaseBase();
  const serviceKey = env("AURAFLOW_SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceKey) {
    throw new Error("Supabase service role key is missing.");
  }

  const endpoint = new URL(`${baseUrl}/rest/v1/${pathname}`);
  if (query) {
    const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    params.forEach((value, key) => endpoint.searchParams.set(key, value));
  }

  const response = await fetch(endpoint, {
    method,
    headers: {
      ...supabaseHeaders(),
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Supabase request failed with ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

async function searchTrainingSources(workspaceId, queryText = "") {
  if (!workspaceId) return [];
  const rows = await supabaseRest("training_sources", {
    query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`,
    prefer: "return=representation"
  }).catch(() => []);
  const sources = Array.isArray(rows) ? rows : [];
  const normalizedQuery = normalizeText(queryText, "").toLowerCase();
  if (!normalizedQuery) {
    return sources.slice(0, 5);
  }
  const keywords = normalizedQuery.split(/\s+/).filter(Boolean);
  const ranked = sources
    .map((source) => {
      const haystack = [
        source.title,
        source.body,
        Array.isArray(source.tags) ? source.tags.join(" ") : "",
        source.relevance,
        source.source_type
      ].join(" ").toLowerCase();
      const score = keywords.reduce((acc, keyword) => acc + (haystack.includes(keyword) ? 1 : 0), 0);
      return { source, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  return (ranked.length ? ranked.map((item) => item.source) : sources).slice(0, 5);
}

async function searchBusinessKnowledge(workspaceId, queryText = "") {
  if (!workspaceId) return [];
  const rows = await supabaseRest("business_knowledge", {
    query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=priority.desc,updated_at.desc&select=*`,
    prefer: "return=representation"
  }).catch(() => []);
  const records = Array.isArray(rows) ? rows : [];
  const normalizedQuery = normalizeText(queryText, "").toLowerCase();
  if (!normalizedQuery) return records.slice(0, 5);
  const keywords = normalizedQuery.split(/\s+/).filter(Boolean);
  const ranked = records
    .map((entry) => {
      const haystack = [
        entry.topic,
        entry.question,
        entry.answer,
        Array.isArray(entry.tags) ? entry.tags.join(" ") : ""
      ].join(" ").toLowerCase();
      const score = keywords.reduce((acc, keyword) => acc + (haystack.includes(keyword) ? 1 : 0), 0);
      return { entry, score };
    })
    .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || (right.entry.priority || 0) - (left.entry.priority || 0));
    return (ranked.length ? ranked.map((item) => item.entry) : records).slice(0, 5);
  }

async function searchWorkspaceKnowledge(workspaceId, queryText = "") {
  if (!workspaceId) return [];
  const rows = await supabaseRest("workspace_knowledge", {
    query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=priority.desc,updated_at.desc&select=*`,
    prefer: "return=representation"
  }).catch(() => []);
  const records = Array.isArray(rows) ? rows : [];
  const normalizedQuery = normalizeText(queryText, "").toLowerCase();
  if (!normalizedQuery) return records.slice(0, 6);
  const keywords = normalizedQuery.split(/\s+/).filter(Boolean);
  const ranked = records
    .map((entry) => {
      const haystack = [
        entry.title,
        entry.topic,
        entry.question,
        entry.answer,
        entry.summary,
        entry.url,
        entry.file_name,
        entry.source_type,
        Array.isArray(entry.tags) ? entry.tags.join(" ") : ""
      ].join(" ").toLowerCase();
      const score = keywords.reduce((acc, keyword) => acc + (haystack.includes(keyword) ? 1 : 0), 0);
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || (right.entry.priority || 0) - (left.entry.priority || 0));
  return (ranked.length ? ranked.map((item) => item.entry) : records).slice(0, 6);
}

async function fetchWorkspacePersona(workspaceId) {
  if (!workspaceId) {
    return {
      workspaceName: "AuraFlow Workspace",
      botName: "Aura",
      toneOfVoice: "Professional"
    };
  }

  const [workspaceRows, agentRows] = await Promise.all([
    supabaseRest("workspaces", {
      query: `id=eq.${encodeURIComponent(workspaceId)}&select=*`,
      prefer: "return=representation"
    }).catch(() => []),
    supabaseRest("agents", {
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&select=*`,
      prefer: "return=representation"
    }).catch(() => [])
  ]);

  const workspace = Array.isArray(workspaceRows) ? workspaceRows[0] : null;
  const activeAgent = (Array.isArray(agentRows) ? agentRows : []).find((item) => String(item.status || "").toLowerCase() === "active")
    || (Array.isArray(agentRows) ? agentRows[0] : null);

  return {
    workspaceName: normalizeText(workspace?.name, "AuraFlow Workspace"),
    botName: normalizeText(activeAgent?.name || workspace?.bot_name || workspace?.agent_name, "Aura"),
    toneOfVoice: normalizeText(activeAgent?.tone || workspace?.tone_of_voice || workspace?.tone, "Professional"),
    instructions: normalizeText(activeAgent?.instructions || workspace?.instructions, "")
  };
}

function normalizeLeadText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractLeadSignalsFromText(text = "") {
  const normalized = normalizeLeadText(text);
  const emailMatches = normalized.match(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi) || [];
  const phoneMatches = normalized.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  return {
    emails: Array.from(new Set(emailMatches.map((value) => String(value).trim().toLowerCase()))),
    phones: Array.from(new Set(phoneMatches.map((value) => normalizePhone(value)).filter(Boolean))),
    hasLeadSignal: Boolean(emailMatches.length || phoneMatches.length),
    excerpt: normalized.slice(0, 240)
  };
}

function buildLeadExternalId({ email = "", phone = "", fallback = "" } = {}) {
  if (email) return `email:${String(email).trim().toLowerCase()}`;
  if (phone) return `phone:${normalizePhone(phone)}`;
  return fallback ? `ref:${String(fallback).trim()}` : "";
}

function buildLeadNotificationBody({ workspaceName = "", lead = {}, messageBody = "" } = {}) {
  const lines = [
    `New Lead Captured for ${workspaceName || "AuraFlow Workspace"}!`,
    "",
    `Name: ${lead.name || "Unknown lead"}`,
    lead.email ? `Email: ${lead.email}` : "",
    lead.phone_e164 || lead.phone ? `Phone: ${lead.phone_e164 || lead.phone}` : "",
    lead.company ? `Company: ${lead.company}` : "",
    lead.capture_reason ? `Why captured: ${lead.capture_reason}` : "",
    messageBody ? `Message: ${normalizeLeadText(messageBody).slice(0, 260)}` : ""
  ].filter(Boolean);
  return lines.join("\n");
}

async function resolveWorkspaceName(workspaceId) {
  if (!workspaceId) return "";
  const rows = await supabaseRest("workspaces", {
    query: `id=eq.${encodeURIComponent(workspaceId)}&select=*`,
    prefer: "return=representation"
  }).catch(() => []);
  const workspace = Array.isArray(rows) ? rows[0] : rows;
  return normalizeText(workspace?.name, "");
}

async function sendLeadNotificationEmail({ workspaceId = "", workspaceName = "", lead = {}, messageBody = "" } = {}) {
  const notificationEmail = normalizeText(
    env("LEAD_NOTIFICATION_EMAIL")
    || env("OWNER_NOTIFICATION_EMAIL")
    || env("GMAIL_INBOX_ADDRESS")
    || env("GMAIL_FROM_EMAIL")
    || "",
    ""
  );
  if (!notificationEmail) {
    return { skipped: true, reason: "No notification email configured." };
  }

  const fromAddress = normalizeText(env("GMAIL_FROM_EMAIL") || env("GMAIL_INBOX_ADDRESS") || notificationEmail, "");
  if (!fromAddress) {
    return { skipped: true, reason: "No Gmail from address configured." };
  }

  const subject = `New Lead Captured for ${workspaceName || "AuraFlow Workspace"}!`;
  const mime = [
    `To: ${notificationEmail}`,
    `From: ${fromAddress}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    buildLeadNotificationBody({ workspaceName, lead, messageBody })
  ].join("\r\n");

  let accessToken = normalizeText(env("GMAIL_ACCESS_TOKEN") || env("GOOGLE_ACCESS_TOKEN") || "", "");
  if (!accessToken) {
    const refreshToken = normalizeText(env("GMAIL_REFRESH_TOKEN") || "", "");
    const clientId = normalizeText(env("GOOGLE_CLIENT_ID") || "", "");
    const clientSecret = normalizeText(env("GOOGLE_CLIENT_SECRET") || "", "");
    if (refreshToken && clientId && clientSecret) {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token"
        }).toString()
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.access_token) {
        accessToken = String(data.access_token || "").trim();
      }
    }
  }

  if (!accessToken) {
    return { skipped: true, reason: "No Gmail access token available." };
  }

  const raw = btoa(unescape(encodeURIComponent(mime))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Failed to send lead notification email with ${response.status}`);
  }
  return text ? JSON.parse(text) : {};
}

async function captureLeadFromEnvelope({ workspaceId = "", provider = "", contactRow = null, conversationRow = null, messageRow = null, workspaceName = "" } = {}) {
  if (!workspaceId || !messageRow) return null;
  if (String(messageRow.direction || "").trim().toLowerCase() !== "inbound") return null;

  const leadSourceText = [
    messageRow.body,
    messageRow.sender_name,
    contactRow?.email,
    contactRow?.phone,
    contactRow?.phone_e164,
    conversationRow?.subject,
    conversationRow?.summary
  ].filter(Boolean).join(" ");
  const signals = extractLeadSignalsFromText(leadSourceText);
  if (!signals.hasLeadSignal) {
    return null;
  }
  const primaryEmail = signals.emails[0] || normalizeText(contactRow?.email || "", "").toLowerCase();
  const primaryPhone = signals.phones[0] || normalizePhone(contactRow?.phone_e164 || contactRow?.phone || "");

  const externalLeadId = buildLeadExternalId({
    email: primaryEmail,
    phone: primaryPhone,
    fallback: messageRow.external_message_id || messageRow.id || `${workspaceId}-${Date.now()}`
  });
  if (!externalLeadId) return null;

  const existingRows = await supabaseRest("leads", {
    query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&external_lead_id=eq.${encodeURIComponent(externalLeadId)}&select=*`,
    prefer: "return=representation"
  }).catch(() => []);
  const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;

  const leadRow = {
    workspace_id: workspaceId,
    source_provider: normalizeText(provider || contactRow?.source_provider || "manual", "manual").toLowerCase(),
    external_lead_id: externalLeadId,
    contact_id: contactRow?.id || null,
    conversation_id: conversationRow?.id || null,
    name: normalizeText(contactRow?.name || messageRow.sender_name || "Lead", "Lead"),
    email: primaryEmail || "",
    phone: primaryPhone || "",
    phone_e164: primaryPhone || null,
    company: normalizeText(contactRow?.company || "", ""),
    lead_stage: normalizeText(contactRow?.lead_stage || contactRow?.leadStage || "new", "new"),
    lead_score: Number(contactRow?.metadata?.lead_score || 0) || 0,
    capture_reason: normalizeLeadText(messageRow.body || signals.excerpt || "Lead identified from inbound message"),
    captured_from: normalizeText(provider || messageRow.source_provider || "manual", "manual").toLowerCase(),
    tags: Array.from(new Set([
      ...(Array.isArray(contactRow?.tags) ? contactRow.tags : []),
      "lead-captured",
      normalizeText(provider || messageRow.source_provider || "manual", "manual").toLowerCase()
    ])).filter(Boolean),
    metadata: {
      signal: signals,
      conversation_subject: conversationRow?.subject || "",
      source_message_id: messageRow.id || messageRow.external_message_id || "",
      source_message_body: messageRow.body || ""
    }
  };

  const savedRows = await supabaseRest("leads", {
    method: "POST",
    query: "on_conflict=workspace_id,source_provider,external_lead_id",
    body: [leadRow],
    prefer: "resolution=merge-duplicates,return=representation"
  }).catch(() => []);
  const saved = Array.isArray(savedRows) ? savedRows[0] : savedRows || leadRow;

  await supabaseRest("activity_events", {
    method: "POST",
    body: [{
      workspace_id: workspaceId,
      entity_type: "lead",
      entity_id: saved.id || null,
      event_type: "lead_captured",
      payload: {
        provider,
        source_message_id: messageRow.id || messageRow.external_message_id || null,
        conversation_id: conversationRow?.id || null,
        signals,
        new_lead: !existing,
        lead: saved
      }
    }],
    prefer: "return=representation"
  }).catch(() => null);

  if (!existing) {
    await sendLeadNotificationEmail({
      workspaceId,
      workspaceName,
      lead: saved,
      messageBody: messageRow.body || ""
    }).catch((error) => {
      console.warn("Lead notification email failed.", error?.message || error);
    });
  }

  return {
    saved,
    isNewLead: !existing,
    signals
  };
}

function collapseWhitespace(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function summarizeKnowledgeExcerpt(value = "", maxLength = 180) {
  const normalized = collapseWhitespace(value);
  if (!normalized) return "";

  const sentenceMatch = normalized.match(/^(.{1,240}[.!?])(\s|$)/);
  const excerpt = sentenceMatch ? sentenceMatch[1] : normalized.slice(0, Math.max(60, maxLength));
  return excerpt.length > maxLength ? `${excerpt.slice(0, maxLength).trimEnd()}...` : excerpt;
}

function compactKnowledgeEntries(entries = [], { maxEntries = 6, maxChars = 2400, maxExcerptChars = 180 } = {}) {
  const sourceEntries = normalizeArray(entries);
  if (!sourceEntries.length) return [];

  const lines = [];
  let usedChars = 0;
  const limitedEntries = sourceEntries.slice(0, Math.max(1, maxEntries));
  const totalSourceChars = sourceEntries.reduce((sum, entry) => {
    const safeEntry = entry || {};
    const combined = [
      safeEntry.title,
      safeEntry.topic,
      safeEntry.question,
      safeEntry.answer,
      safeEntry.summary,
      safeEntry.body,
      safeEntry.content,
      safeEntry.url,
      safeEntry.file_name,
      safeEntry.source_type
    ].join(" ");
    return sum + collapseWhitespace(combined).length;
  }, 0);

  for (const entry of limitedEntries) {
    const safeEntry = entry || {};
    const sourceLabel = safeEntry.title || safeEntry.topic || safeEntry.url || safeEntry.file_name || safeEntry.source_type || "Knowledge";
    const sourceType = safeEntry.source_type || safeEntry.document_type || safeEntry.kind || "source";
    const sourceUrl = safeEntry.url || safeEntry.file_url || safeEntry.source_url || "";
    const excerpt = summarizeKnowledgeExcerpt(
      safeEntry.body || safeEntry.content || safeEntry.summary || safeEntry.answer || safeEntry.question || "",
      maxExcerptChars
    );
    const line = `- ${sourceLabel} | ${sourceType}${sourceUrl ? ` | ${sourceUrl}` : ""}${excerpt ? ` | ${excerpt}` : ""}`;
    if (usedChars + line.length > maxChars) break;
    lines.push(line);
    usedChars += line.length + 1;
  }

  if (sourceEntries.length > lines.length || totalSourceChars > maxChars) {
    lines.unshift(`- Condensed ${sourceEntries.length} knowledge items for context safety.`);
  }

  return lines.slice(0, Math.max(1, maxEntries + 1));
}

  function metaSignatureValid(rawBody, signatureHeader) {
    const secret = env("META_APP_SECRET");
    if (!secret) return true;
  if (!signatureHeader || !rawBody) return false;
  const [prefix, value] = String(signatureHeader).split("=", 2);
  if (prefix !== "sha256" || !value) return false;
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  ).then((key) => crypto.subtle.sign("HMAC", key, encoder.encode(rawBody))).then((signature) => {
    const bytes = new Uint8Array(signature);
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return hex === value;
  });
}

async function logReliabilityEvent(workspaceId, provider, eventType, payload = {}, { status = "received", replayKey = "", dedupeKey = "", errorMessage = "" } = {}) {
  const row = {
    workspace_id: workspaceId,
    provider: normalizeText(provider, "gmail").toLowerCase(),
    event_type: normalizeText(eventType, "reliability.test_callback"),
    status: normalizeText(status, "received"),
    replay_key: replayKey || null,
    dedupe_key: dedupeKey || null,
    payload,
    error_message: errorMessage || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  return supabaseRest("reliability_events", {
    method: "POST",
    body: [row],
    prefer: "return=representation"
  });
}

async function upsertChannel(workspaceId, provider, patch = {}) {
  const row = {
    workspace_id: workspaceId,
    provider,
    channel_type: provider === "gmail" ? "email" : provider,
    display_name: provider.toUpperCase(),
    status: patch.status || "configured",
    provider_account_id: patch.provider_account_id || patch.providerAccountId || "",
    connection_state: patch.connection_state || patch.connectionState || "connected",
    webhook_state: patch.webhook_state || patch.webhookState || "unknown",
    relay_setup: patch.relay_setup || patch.relaySetup || {},
    token_health: patch.token_health || patch.tokenHealth || {},
    last_webhook_at: patch.last_webhook_at || patch.lastWebhookAt || null,
    last_sync_at: patch.last_sync_at || patch.lastSyncAt || null,
    external_metadata: patch.external_metadata || patch.externalMetadata || {}
  };

  return supabaseRest("channels", {
    method: "POST",
    query: "on_conflict=workspace_id,provider",
    body: [row],
    prefer: "resolution=merge-duplicates,return=representation"
  });
}

async function saveEnvelopeToSupabase(envelope = {}) {
  const workspaceId = normalizeText(envelope.workspaceId || envelope.workspace_id, "");
  const provider = normalizeSourceProvider(envelope.provider || "gmail") || "gmail";
  if (!workspaceId) throw new Error("workspaceId is required.");
  const contactPhone = normalizePhone(envelope.contact?.phone || envelope.contact?.phone_e164 || "");

  const contactRow = envelope.contact
    ? await (async () => {
      const baseRow = {
        workspace_id: workspaceId,
        source_provider: provider,
        external_contact_id: envelope.contact.externalId || envelope.contact.external_id || `${provider}:contact`,
        name: envelope.contact.name || "Unknown contact",
        email: envelope.contact.email || "",
        phone: envelope.contact.phone || "",
        phone_e164: contactPhone || null,
        company: envelope.contact.company || "",
        lead_stage: envelope.contact.leadStage || "new",
        owner_name: envelope.contact.ownerName || null,
        tags: normalizeArray(envelope.contact.tags),
        metadata: { source_provider: provider, sync_source: envelope.verification?.transport || "webhook" }
      };

      if (contactPhone) {
        const byPhone = await supabaseRest("contacts", {
          method: "POST",
          query: "on_conflict=workspace_id,phone_e164",
          prefer: "resolution=merge-duplicates,return=representation",
          body: [baseRow]
        }).then((rows) => (Array.isArray(rows) ? rows[0] : rows));
        if (byPhone) return byPhone;
      }

      return supabaseRest("contacts", {
        method: "POST",
        query: "on_conflict=workspace_id,source_provider,external_contact_id",
        prefer: "resolution=merge-duplicates,return=representation",
        body: [baseRow]
      }).then((rows) => (Array.isArray(rows) ? rows[0] : rows));
    })()
    : null;

  const conversationRow = envelope.conversation
    ? await supabaseRest("conversations", {
      method: "POST",
      query: "on_conflict=workspace_id,source_provider,external_conversation_id",
      prefer: "resolution=merge-duplicates,return=representation",
      body: [{
        workspace_id: workspaceId,
        contact_id: contactRow?.id || null,
        source_provider: provider,
        external_conversation_id: envelope.conversation.externalId || envelope.conversation.external_id || `${provider}:thread`,
        identity_phone: contactPhone || null,
        subject: envelope.conversation.subject || "Incoming thread",
        status: envelope.conversation.status || "open",
        priority: envelope.conversation.priority || "normal",
        source: envelope.conversation.source || provider,
        assigned_to: envelope.conversation.assignedTo || null,
        summary: envelope.conversation.summary || "",
        last_message_at: envelope.messages?.[envelope.messages.length - 1]?.createdAt || new Date().toISOString()
      }]
    }).then((rows) => (Array.isArray(rows) ? rows[0] : rows))
    : null;

  const messageRows = [];
  for (const [index, message] of normalizeArray(envelope.messages).entries()) {
    const channel = normalizeChannel(resolveChannel(provider, message), "whatsapp");
    const row = {
      workspace_id: workspaceId,
      conversation_id: conversationRow?.id || message.conversation_id || null,
      source_provider: provider,
      channel,
      external_message_id: message.externalId || message.external_id || `${provider}:message:${index + 1}`,
      provider_message_id: message.providerMessageId || message.provider_message_id || "",
      direction: message.direction || "inbound",
      sender_name: message.senderName || "",
      body: message.body || "",
      delivery_state: message.deliveryState || message.delivery_state || (String(message.direction || "").toLowerCase() === "outbound" ? "sent" : "received"),
      delivery_receipts: normalizeArray(message.deliveryReceipts || message.delivery_receipts),
      raw_payload: message.rawPayload || message.raw_payload || {},
      created_at: message.createdAt || message.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const saved = await supabaseRest("messages", {
      method: "POST",
      query: "on_conflict=workspace_id,source_provider,external_message_id",
      prefer: "resolution=merge-duplicates,return=representation",
      body: [row]
    }).then((rows) => (Array.isArray(rows) ? rows[0] : rows));
    messageRows.push(saved);
  }

  const latestMessage = messageRows[messageRows.length - 1] || null;
  const workspacePersona = await fetchWorkspacePersona(workspaceId);
  const leadCapture = await captureLeadFromEnvelope({
    workspaceId,
    provider,
    contactRow,
    conversationRow,
    messageRow: latestMessage,
    workspaceName: workspacePersona.workspaceName || ""
  }).catch(() => null);
  if (conversationRow && latestMessage) {
    const knowledgeQuery = [
      conversationRow.subject,
      conversationRow.summary,
      latestMessage.body,
      latestMessage.sender_name
    ].filter(Boolean).join(" ");
    const [trainingSources, workspaceKnowledge, businessKnowledge] = await Promise.all([
      searchTrainingSources(workspaceId, knowledgeQuery),
      searchWorkspaceKnowledge(workspaceId, knowledgeQuery),
      searchBusinessKnowledge(workspaceId, knowledgeQuery)
    ]);
    const aiPaused = [
      conversationRow?.is_ai_paused,
      conversationRow?.isAiPaused,
      envelope.conversation?.is_ai_paused,
      envelope.conversation?.isAiPaused
    ].some((value) => normalizeBoolean(value));

    if (aiPaused) {
      await supabaseRest("conversations", {
        method: "PATCH",
        query: `id=eq.${encodeURIComponent(conversationRow.id)}`,
        body: {
          is_ai_paused: true,
          last_message_at: latestMessage.createdAt || latestMessage.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        prefer: "return=representation"
      }).catch(() => null);

      await supabaseRest("activity_events", {
        method: "POST",
        body: [{
          workspace_id: workspaceId,
          entity_type: "conversation",
          entity_id: conversationRow.id,
          event_type: "conversation.ai_paused",
          payload: {
            provider,
            message_id: latestMessage.id || latestMessage.external_message_id || null,
            paused: true,
            human_takeover: true
          }
        }],
        prefer: "return=representation"
      }).catch(() => null);

      return { contactRow, conversationRow, messageRows, aiPaused: true, leadCapture, workspacePersona, workspaceKnowledge, businessKnowledge, trainingSources };
    }

    const aiDraft = await generateAiDraft({
      workspaceName: workspacePersona.workspaceName || "AuraFlow Workspace",
      conversation: conversationRow,
      messages: messageRows,
      trainingSources,
      businessKnowledge,
      workspaceKnowledge,
      persona: workspacePersona,
      channel: resolveChannel(provider, latestMessage)
    }).catch((error) => ({
      intent: "unknown",
      confidence: 0,
      draftReply: "",
      error: error?.message || String(error)
    }));
    const confidenceThreshold = Number(env("AI_HUMAN_REVIEW_THRESHOLD", "0.45"));
    const confidence = Number(aiDraft.confidence || 0);
    const existingStatus = String(conversationRow.status || "open").toLowerCase();
    const requiresHumanReview = Number.isFinite(confidence)
      && confidence > 0
      && confidence < confidenceThreshold
      && !["closed", "resolved"].includes(existingStatus);
    const nextStatus = requiresHumanReview ? "escalated" : conversationRow.status || "open";

    await supabaseRest("conversations", {
      method: "PATCH",
      query: `id=eq.${encodeURIComponent(conversationRow.id)}`,
      body: {
        status: nextStatus,
        intent: aiDraft.intent || "unknown",
        intent_confidence: aiDraft.confidence || 0,
        draft_reply: aiDraft.draftReply || "",
        ai_draft_reply: aiDraft.draftReply || "",
        summary: conversationRow.summary || latestMessage.body || "",
        updated_at: new Date().toISOString()
      },
      prefer: "return=representation"
    }).catch(() => null);

    await supabaseRest("activity_events", {
      method: "POST",
      body: [{
        workspace_id: workspaceId,
        entity_type: "conversation",
        entity_id: conversationRow.id,
        event_type: "message.created",
        payload: {
          provider,
          message_id: latestMessage.id,
          intent: aiDraft.intent || "unknown",
          intent_confidence: confidence,
          requires_human_review: requiresHumanReview,
          draft_reply: aiDraft.draftReply || "",
          ai_draft_reply: aiDraft.draftReply || "",
          training_source_count: trainingSources.length,
          business_knowledge_count: businessKnowledge.length
        }
      }],
      prefer: "return=representation"
    }).catch(() => null);

    if (requiresHumanReview) {
      await supabaseRest("activity_events", {
        method: "POST",
        body: [{
          workspace_id: workspaceId,
          entity_type: "conversation",
          entity_id: conversationRow.id,
          event_type: "ai_low_confidence_escalation",
          payload: {
            provider,
            confidence,
            threshold: confidenceThreshold
          }
        }],
        prefer: "return=representation"
      }).catch(() => null);
    }
  }

  return { contactRow, conversationRow, messageRows, leadCapture };
}

async function generateAiDraft({ workspaceName = "AuraFlow Workspace", conversation = {}, messages = [], trainingSources = [], businessKnowledge = [], workspaceKnowledge = [], persona = {}, channel = "whatsapp" } = {}) {
  const openRouterKey = env("OPENROUTER_API_KEY") || env("OPENAI_API_KEY");
  const openRouterModel = env("OPENROUTER_MODEL", "openai/gpt-4o-mini");
  const geminiKey = env("GEMINI_API_KEY");
  const geminiModel = env("GEMINI_MODEL", "gemini-2.5-flash");
  const apiKey = openRouterKey || geminiKey;
  if (!apiKey) {
    return {
      intent: "unknown",
      confidence: 0,
      draftReply: ""
    };
  }

  const botName = normalizeText(persona.botName || persona.name || workspaceName, "Aura");
  const toneOfVoice = normalizeText(persona.toneOfVoice || persona.tone || "Professional", "Professional");
  const personaInstructions = normalizeText(persona.instructions || persona.systemInstructions || "", "");
  const toneGuidance = {
    professional: "Polished, clear, direct, and businesslike.",
    friendly: "Warm, approachable, and helpful without sounding casual or sloppy.",
    luxury: "Refined, premium, and concise with elevated language.",
    direct: "Short, decisive, and action-oriented.",
    conversational: "Natural, human, and easy to read."
  };
  const normalizedTone = toneOfVoice.toLowerCase();
  const workspaceKnowledgeLines = compactKnowledgeEntries(workspaceKnowledge, { maxEntries: 6, maxChars: 2200 });
  const businessKnowledgeLines = compactKnowledgeEntries(businessKnowledge, { maxEntries: 5, maxChars: 1600 });
  const trainingSourceLines = compactKnowledgeEntries(trainingSources, { maxEntries: 5, maxChars: 1600 });
  const knowledgeSafetyNote = workspaceKnowledgeLines.length || businessKnowledgeLines.length || trainingSourceLines.length
    ? ["Knowledge context note: retrieved entries may be condensed for token safety; answer using the most relevant excerpts first."]
    : [];

  const prompt = [
      `Workspace: ${workspaceName}`,
      `Bot name: ${botName}`,
      `Tone of voice: ${toneOfVoice}`,
      `Persona guidance: ${toneGuidance[normalizedTone] || toneGuidance.professional}`,
      ...(personaInstructions ? [`Persona instructions: ${personaInstructions}`] : []),
      `Conversation: ${conversation.subject || conversation.summary || "Incoming thread"}`,
      `Status: ${conversation.status || "open"}`,
      `Channel: ${channel}`,
      ...(knowledgeSafetyNote.length ? knowledgeSafetyNote : []),
      "Priority instruction: Use workspace_knowledge first, then business_knowledge, then general model knowledge.",
      "Workspace knowledge uploaded in the Setup Wizard:",
      ...(workspaceKnowledgeLines.length ? workspaceKnowledgeLines : ["- None"]),
      "Business knowledge:",
      ...(businessKnowledgeLines.length ? businessKnowledgeLines : ["- None"]),
      "Relevant training sources:",
      ...(trainingSourceLines.length ? trainingSourceLines : ["- None"]),
      `Messages:`,
    ...messages.map((message) => `- ${message.direction || "inbound"}: ${message.body || ""}`),
    "",
    channel === "sms"
      ? "Output style: SMS-safe plain text only, concise (max 320 chars), no markdown, no bullet points, no emojis."
      : "Output style: concise professional response.",
    "Return JSON with keys: intent, confidence, draftReply."
  ].join("\n");

  let text = "";
  if (openRouterKey) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env("OPENROUTER_SITE_URL", env("SUPABASE_URL", "https://auraflow.app")),
        "X-Title": env("OPENROUTER_APP_NAME", "AuraFlow")
      },
      body: JSON.stringify({
        model: openRouterModel,
        temperature: 0.2,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content: "Return strict JSON with keys intent, confidence, and draftReply."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `OpenRouter request failed with ${response.status}`);
    }
    text = data?.choices?.[0]?.message?.content || "";
  } else {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Gemini request failed with ${response.status}`);
    }
    text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  }

  try {
    const parsed = JSON.parse(text);
    return {
      intent: normalizeText(parsed.intent, "unknown"),
      confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : 0,
      draftReply: normalizeText(parsed.draftReply || parsed.draft_reply, "")
    };
  } catch {
    return {
      intent: "unknown",
      confidence: 0,
      draftReply: text.trim()
    };
  }
}

async function triggerNangoSync(provider, workspaceId, connectionId = "", syncs = []) {
  const secret = env("NANGO_SECRET_KEY");
  const baseUrl = env("NANGO_BASE_URL", "https://api.nango.dev");
  if (!secret) {
    return { skipped: true, reason: "Nango is not configured." };
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/sync/trigger`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(buildNangoTriggerBody({
      workspaceId,
      provider,
      connectionId,
      syncs
    }))
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Nango sync failed with ${response.status}`);
  }
  return text ? JSON.parse(text) : {};
}

function buildTestPayload(provider, workspaceId, body = {}) {
  const now = new Date().toISOString();
  if (provider === "whatsapp") {
    return {
      provider,
      workspaceId,
      accountId: env("WHATSAPP_PHONE_NUMBER_ID", "whatsapp-test"),
      eventType: "meta.whatsapp.message.received",
      contact: {
        externalId: body.contactId || "whatsapp:test-contact",
        name: body.senderName || "WhatsApp Test",
        phone: body.senderPhone || "+2348015550101",
        tags: ["whatsapp", "test"]
      },
      conversation: {
        externalId: body.conversationId || `whatsapp:test-thread:${Date.now()}`,
        subject: "WhatsApp webhook test",
        status: "open",
        source: "WhatsApp"
      },
      messages: [{
        externalId: body.messageId || `whatsapp:test-message:${Date.now()}`,
        direction: "inbound",
        senderName: body.senderName || "WhatsApp Test",
        body: body.body || "This is a live WhatsApp webhook path test from AuraFlow.",
        createdAt: now,
        rawPayload: { source: "meta-webhook-test" }
      }],
      verification: {
        provider,
        transport: "meta-webhook",
        verified: true,
        signed: true,
        note: "Webhook test generated from the Edge Function."
      }
    };
  }
  if (provider === "instagram") {
    return {
      provider,
      workspaceId,
      accountId: env("INSTAGRAM_BUSINESS_ACCOUNT_ID", "instagram-test"),
      eventType: "twilio.instagram.message.received",
      contact: {
        externalId: body.contactId || "instagram:test-contact",
        name: body.senderName || "Instagram Test",
        phone: "",
        tags: ["instagram", "test", "twilio-conversations"]
      },
      conversation: {
        externalId: body.conversationId || `instagram:test-thread:${Date.now()}`,
        subject: "Instagram webhook test",
        status: "open",
        source: "Instagram"
      },
      messages: [{
        externalId: body.messageId || `instagram:test-message:${Date.now()}`,
        channel: "instagram",
        direction: "inbound",
        senderName: body.senderName || "Instagram Test",
        body: body.body || "This is a live Instagram webhook path test from AuraFlow.",
        createdAt: now,
        rawPayload: { source: "twilio-instagram-webhook-test" }
      }],
      verification: {
        provider,
        transport: "twilio-conversations-webhook",
        verified: true,
        signed: true,
        note: "Webhook test generated from the Edge Function."
      }
    };
  }
  if (provider === "messenger") {
    return {
      provider,
      workspaceId,
      accountId: env("MESSENGER_PAGE_ID", "messenger-test"),
      eventType: "twilio.messenger.message.received",
      contact: {
        externalId: body.contactId || "messenger:test-contact",
        name: body.senderName || "Messenger Test",
        phone: "",
        tags: ["messenger", "test", "twilio-conversations"]
      },
      conversation: {
        externalId: body.conversationId || `messenger:test-thread:${Date.now()}`,
        subject: "Messenger webhook test",
        status: "open",
        source: "Messenger"
      },
      messages: [{
        externalId: body.messageId || `messenger:test-message:${Date.now()}`,
        channel: "messenger",
        direction: "inbound",
        senderName: body.senderName || "Messenger Test",
        body: body.body || "This is a live Messenger webhook path test from AuraFlow.",
        createdAt: now,
        rawPayload: { source: "twilio-messenger-webhook-test" }
      }],
      verification: {
        provider,
        transport: "twilio-conversations-webhook",
        verified: true,
        signed: true,
        note: "Webhook test generated from the Edge Function."
      }
    };
  }

  return {
    provider: "gmail",
    workspaceId,
    accountId: env("GMAIL_INBOX_ADDRESS", "gmail-test"),
    eventType: "gmail.message.received",
    contact: {
      externalId: body.contactId || "gmail:test-contact",
      name: body.senderName || "Gmail Test",
      email: body.senderEmail || "relay-test@example.com",
      tags: ["gmail", "test"]
    },
    conversation: {
      externalId: body.conversationId || `gmail:test-thread:${Date.now()}`,
      subject: "Gmail webhook test",
      status: "open",
      source: "Gmail"
    },
    messages: [{
      externalId: body.messageId || `gmail:test-message:${Date.now()}`,
      direction: "inbound",
      senderName: body.senderName || "Gmail Test",
      body: body.body || "This is a live Gmail webhook path test from AuraFlow.",
      createdAt: now,
      rawPayload: { source: "gmail-webhook-test" }
    }],
    verification: {
      provider: "gmail",
      transport: "pubsub-push",
      verified: true,
      signed: true,
      note: "Webhook test generated from the Edge Function."
    }
  };
}

async function handleIncomingWebhook(request, providerOverride = "") {
  const url = new URL(request.url);
  const provider = normalizeText(providerOverride || url.searchParams.get("provider") || "gmail", "gmail").toLowerCase();
  const workspaceId = normalizeText(url.searchParams.get("workspace_id") || url.searchParams.get("workspaceId") || "", "");

  if (request.method === "GET") {
    const challenge = url.searchParams.get("hub.challenge") || url.searchParams.get("challenge") || "";
    const verifyToken = env("META_WEBHOOK_VERIFY_TOKEN");
    const providedToken = url.searchParams.get("hub.verify_token") || url.searchParams.get("verify_token") || "";
    if (["whatsapp", "instagram", "messenger"].includes(provider)) {
      if (!verifyToken || verifyToken !== providedToken) {
        return Response.json({ error: "Invalid webhook verification token" }, { status: 403 });
      }
      return new Response(challenge || "verified", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    return Response.json({ ok: true, provider, workspaceId });
  }

  const body = await readJson(request);
  const rawText = JSON.stringify(body);
  const signature = request.headers.get("x-hub-signature-256") || request.headers.get("x-hub-signature") || "";
  if (["whatsapp", "instagram", "messenger"].includes(provider) && !(await metaSignatureValid(rawText, signature))) {
    return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const records = extractNangoRecords(body);
  if (records.length) {
    const results = [];
    for (const [index, record] of records.entries()) {
      const envelope = buildNangoWebhookEnvelope({
        provider,
        workspaceId,
        body,
        record,
        index,
        eventType: body.eventType || body.type || `${provider}.sync.record`
      });
      const saved = await saveEnvelopeToSupabase(envelope);
      await logReliabilityEvent(envelope.workspaceId || workspaceId || "", provider, envelope.eventType, {
        record,
        saved
      }, {
        status: "received",
        replayKey: envelope.messages?.[0]?.externalId || envelope.conversation?.externalId || "",
        dedupeKey: envelope.messages?.[0]?.externalId || envelope.conversation?.externalId || ""
      }).catch(() => null);
      results.push(saved);
    }
    return Response.json({ ok: true, provider, workspaceId, source: "nango-sync", results });
  }

  const envelope = body.contact && body.conversation && Array.isArray(body.messages)
    ? body
    : buildTestPayload(provider, workspaceId, body);

  const saved = await saveEnvelopeToSupabase(envelope);
  await logReliabilityEvent(envelope.workspaceId || workspaceId || "", provider, envelope.eventType || `${provider}.message.received`, {
    body,
    saved
  }, {
    status: "received",
    replayKey: envelope.messages?.[0]?.externalId || envelope.conversation?.externalId || "",
    dedupeKey: envelope.messages?.[0]?.externalId || envelope.conversation?.externalId || ""
  }).catch(() => null);
  return Response.json({ ok: true, provider, workspaceId, saved });
}

async function handleSyncRequest(request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await readJson(request);
  const workspaceId = normalizeText(body.workspaceId || body.workspace_id || "", "");
  const providerEntries = normalizeArray(body.providers);
  const records = extractNangoRecords(body);

  if (records.length) {
    const results = [];
    for (const [index, record] of records.entries()) {
      const provider = normalizeText(firstNonEmpty(body.provider, record.provider, record.provider_config_key, record.source_provider, "gmail"), "gmail").toLowerCase();
      const envelope = buildNangoWebhookEnvelope({
        provider,
        workspaceId,
        body,
        record,
        index,
        eventType: body.eventType || body.type || `${provider}.sync.record`
      });
      const saved = await saveEnvelopeToSupabase(envelope);
      results.push(saved);
    }
    return Response.json({ ok: true, workspaceId, source: "nango-sync", results });
  }

  const configuredProviders = providerEntries.length
    ? providerEntries
    : ["gmail", "whatsapp", "instagram", "messenger"].map((provider) => ({ provider }));
  const syncResults = [];
  for (const providerEntry of configuredProviders) {
    const provider = normalizeText(providerEntry.provider || providerEntry.key || providerEntry.name, "gmail").toLowerCase();
    const connectionId = normalizeText(providerEntry.connectionId || providerEntry.connection_id || "", "");
    const channel = {
      provider,
      channelType: providerEntry.channelType || providerEntry.channel_type || (provider === "gmail" ? "email" : provider),
      label: providerEntry.label || provider.toUpperCase(),
      externalAccountId: providerEntry.externalAccountId || providerEntry.providerAccountId || "",
      connectionState: providerEntry.connectionState || "connecting",
      webhookState: providerEntry.webhookState || "unknown",
      missing: providerEntry.missing || []
    };
    await upsertChannel(workspaceId, provider, {
      provider_account_id: channel.externalAccountId,
      connection_state: channel.connectionState,
      webhook_state: channel.webhookState,
      relay_setup: {
        provider,
        sync_requested_at: new Date().toISOString(),
        source: "api-sync"
      },
      token_health: {
        provider,
        status: "unknown"
      },
      external_metadata: {
        configured_from_env: true,
        missing: channel.missing,
        sync_requested_at: new Date().toISOString()
      },
      last_sync_at: new Date().toISOString()
    });

    let triggerResult = { skipped: true, reason: "Nango is not configured." };
    try {
      triggerResult = await triggerNangoSync(provider, workspaceId, connectionId, body.syncs || providerEntry.syncs || []);
    } catch (error) {
      triggerResult = { error: error?.message || String(error) };
    }

    await logReliabilityEvent(workspaceId, provider, "provider.sync.triggered", {
      provider: channel,
      triggerResult,
      source: body.source || "api-sync"
    }, {
      status: triggerResult?.error ? "failed" : "triggered",
      replayKey: connectionId || provider,
      dedupeKey: connectionId || provider,
      errorMessage: triggerResult?.error || ""
    }).catch(() => null);

    syncResults.push({ provider, triggerResult });
  }

  return Response.json({ ok: true, workspaceId, syncResults });
}

async function handleTestCallbackRequest(request, providerOverride = "") {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(request.url);
  const provider = normalizeText(providerOverride || url.searchParams.get("provider") || "gmail", "gmail").toLowerCase();
  const body = await readJson(request);
  const workspaceId = normalizeText(body.workspaceId || body.workspace_id || url.searchParams.get("workspace_id") || "", "");
  const envelope = buildTestPayload(provider, workspaceId, body.relay || body.testRelay || body);
  const saved = await saveEnvelopeToSupabase(envelope);
  const reliability = await logReliabilityEvent(workspaceId, provider, "reliability.test_callback", {
    body,
    envelope,
    saved
  }, {
    status: "tested",
    replayKey: envelope.messages?.[0]?.externalId || envelope.conversation?.externalId || "",
    dedupeKey: envelope.messages?.[0]?.externalId || envelope.conversation?.externalId || ""
  });

  return Response.json({
    ok: true,
    provider,
    workspaceId,
    relayTest: true,
    saved,
    reliability
  });
}

export {
  handleIncomingWebhook,
  handleSyncRequest,
  handleTestCallbackRequest,
  logReliabilityEvent,
  saveEnvelopeToSupabase,
  triggerNangoSync
};
