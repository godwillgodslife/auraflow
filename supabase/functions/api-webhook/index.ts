import { serve } from "https://deno.land/std/http/server.ts";

import { logReliabilityEvent, saveEnvelopeToSupabase } from "../_shared/auraflow.ts";
import { normalizeChannel } from "../_shared/integration-vocab.ts";

function env(name: string, fallback = "") {
  return Deno.env.get(name) || fallback;
}

const TWILIO_SIGNATURE_BYPASS = false;

function normalizeText(value: unknown, fallback = "") {
  return String(value || "").trim() || fallback;
}

function normalizeBoolean(value: unknown) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return false;
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

function toIso(value: unknown) {
  if (!value) return new Date().toISOString();
  const date = new Date(Number(value) > 1e12 ? Number(value) : String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeArray<T>(value: T[] | T | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function twimlAckResponse() {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "content-type,x-twilio-signature"
    }
  });
}

function looksLikeBotpressInstagramEvent(contentType: string, body: Record<string, unknown>) {
  const isJson = contentType.includes("application/json");
  const channel = normalizeChannel(firstNonEmpty(body.channel, body.provider), "");
  const text = normalizeText(firstNonEmpty(body.text, body.message, body.body), "");
  const sender = normalizeText(firstNonEmpty(body.sender, body.user_id, body.userId), "");
  return isJson && channel === "instagram" && Boolean(text) && Boolean(sender);
}

async function fetchConversationReply(conversationId: string) {
  const baseUrl = env("SUPABASE_URL");
  const serviceKey = env("AURAFLOW_SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceKey || !conversationId) return "";

  const endpoint = new URL(`${baseUrl}/rest/v1/conversations`);
  endpoint.searchParams.set("id", `eq.${conversationId}`);
  endpoint.searchParams.set("select", "ai_draft_reply,draft_reply");
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) return "";
  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  return normalizeText(firstNonEmpty(row?.ai_draft_reply, row?.draft_reply), "");
}

function parseFormBody(rawText = "") {
  const params = new URLSearchParams(rawText);
  const body: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      body[key] = Array.isArray(body[key]) ? [...(body[key] as unknown[]), value] : [body[key], value];
      continue;
    }
    body[key] = value;
  }
  return body;
}

async function readRequestBody(request: Request) {
  const rawText = await request.text();
  const contentType = normalizeText(request.headers.get("content-type"), "").toLowerCase();
  if (!rawText) {
    return { body: {}, rawText, contentType };
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return { body: parseFormBody(rawText), rawText, contentType };
  }
  try {
    return {
      body: JSON.parse(rawText),
      rawText,
      contentType
    };
  } catch {
    return { body: {}, rawText, contentType };
  }
}

function inferTwilioProvider(providerHint: string, body: Record<string, unknown>) {
  const explicit = normalizeText(providerHint || body.provider || body.channel || body.source, "").toLowerCase();
  if (["whatsapp", "instagram", "messenger"].includes(explicit)) return explicit;

  const source = normalizeText(firstNonEmpty(body.Source, body.source), "").toLowerCase();
  const address = normalizeText(firstNonEmpty(
    body["MessagingBinding.Address"],
    body["ParticipantMessagingBinding.Address"],
    body["MessagingBinding.ProxyAddress"],
    body["ParticipantMessagingBinding.ProxyAddress"],
    body.Author,
    body.author,
    body.From,
    body.from
  ), "").toLowerCase();
  const profile = normalizeText(firstNonEmpty(body.ProfileName, body.profileName, body.ChannelPrefix, body.channelPrefix), "").toLowerCase();

  if (
    source.includes("instagram")
    || address.includes("instagram")
    || address.startsWith("ig:")
    || profile.includes("instagram")
  ) return "instagram";
  if (
    source.includes("messenger")
    || source.includes("facebook")
    || address.includes("messenger")
    || address.includes("facebook")
    || address.startsWith("fb:")
    || address.includes("m.me")
    || profile.includes("messenger")
  ) return "messenger";
  if (source.includes("whatsapp") || address.startsWith("whatsapp:")) return "whatsapp";
  return explicit || "whatsapp";
}

function normalizeReceiptStatus(value: unknown) {
  const normalized = normalizeText(value, "").toLowerCase();
  if (!normalized) return "";
  if (["queued", "sent", "delivered", "read", "failed", "undelivered"].includes(normalized)) return normalized;
  if (normalized.includes("deliver")) return "delivered";
  if (normalized.includes("read")) return "read";
  if (normalized.includes("fail") || normalized.includes("undeliver")) return "failed";
  return normalized;
}

function looksLikeTwilioConversationsBody(body: Record<string, unknown>) {
  return Boolean(
    body.ConversationSid
    || body.EventType
    || body["MessagingBinding.Address"]
    || body["ParticipantMessagingBinding.Address"]
  );
}

function looksLikeTwilioMessagingBody(body: Record<string, unknown>) {
  return Boolean(
    body.SmsSid
    || body.MessageSid
    || body.WaId
    || body.From
    || body.To
  );
}

function inferTwilioMessagingChannel(body: Record<string, unknown>) {
  const fromAddress = normalizeText(firstNonEmpty(body.From, body.from), "").toLowerCase();
  const toAddress = normalizeText(firstNonEmpty(body.To, body.to), "").toLowerCase();
  const messageType = normalizeText(firstNonEmpty(body.MessageType, body.messageType), "").toLowerCase();
  const channelMeta = normalizeText(firstNonEmpty(body.ChannelMetadata, body.channelMetadata), "").toLowerCase();
  if (
    fromAddress.startsWith("whatsapp:")
    || toAddress.startsWith("whatsapp:")
    || messageType.includes("whatsapp")
    || channelMeta.includes("whatsapp")
    || normalizeText(firstNonEmpty(body.WaId, body.waId), "") !== ""
  ) {
    return normalizeChannel("whatsapp", "whatsapp");
  }
  return normalizeChannel("sms", "sms");
}

async function verifyTwilioSignature(
  request: Request,
  body: Record<string, unknown>,
  options: { provider?: string } = {}
) {
  const provider = normalizeText(options.provider, "").toLowerCase();
  const bypassProviders = normalizeText(
    env("TWILIO_SIGNATURE_BYPASS_PROVIDERS", "sms,whatsapp"),
    "sms,whatsapp"
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (bypassProviders.includes(provider)) {
    return {
      verified: true,
      reason: `Twilio signature verification bypassed for provider '${provider}'.`
    };
  }

  if (TWILIO_SIGNATURE_BYPASS) {
    return { verified: true, reason: "Twilio signature verification bypassed temporarily for sandbox debugging." };
  }

  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!authToken) {
    return { verified: true, reason: "Twilio auth token not configured; signature verification skipped." };
  }

  const signatureHeader = normalizeText(request.headers.get("x-twilio-signature"), "");
  if (!signatureHeader) {
    return { verified: false, reason: "Missing X-Twilio-Signature header." };
  }

  const sortedEntries = Object.entries(body).flatMap(([key, value]) => {
    if (Array.isArray(value)) {
      return value.map((entry) => [key, String(entry ?? "")]);
    }
    return [[key, String(value ?? "")]];
  }).sort((left, right) => String(left[0]).localeCompare(String(right[0])));

  const data = `${request.url}${sortedEntries.map(([key, value]) => `${key}${value}`).join("")}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return {
    verified: expected === signatureHeader,
    reason: expected === signatureHeader ? "Twilio signature verified." : "Twilio signature mismatch."
  };
}

function buildTwilioEnvelope(providerHint: string, workspaceId: string, body: Record<string, unknown>) {
  const provider = inferTwilioProvider(providerHint, body);
  const participantAddress = normalizeText(firstNonEmpty(
    body["MessagingBinding.Address"],
    body["ParticipantMessagingBinding.Address"],
    body.Author,
    body.author,
    body.From,
    body.from
  ), "");
  const proxyAddress = normalizeText(firstNonEmpty(
    body["MessagingBinding.ProxyAddress"],
    body["ParticipantMessagingBinding.ProxyAddress"],
    body.To,
    body.to
  ), "");
  const conversationSid = normalizeText(firstNonEmpty(body.ConversationSid, body.conversationSid), `${provider}:conversation`);
  const messageSid = normalizeText(firstNonEmpty(body.MessageSid, body.messageSid, body.SmsSid, body.smsSid), "");
  const eventTypeRaw = normalizeText(firstNonEmpty(body.EventType, body.eventType), "onMessageAdded");
  const eventType = `twilio.${provider}.${eventTypeRaw.replace(/^on/i, "").replace(/[A-Z]/g, (char) => `.${char.toLowerCase()}`).replace(/^\./, "")}`;
  const messageBody = normalizeText(firstNonEmpty(body.Body, body.body, body.MediaCaption, body.mediaCaption), "");
  const deliveryStatus = normalizeReceiptStatus(firstNonEmpty(body.DeliveryStatus, body.deliveryStatus, body.Status, body.status));
  const author = normalizeText(firstNonEmpty(body.Author, body.author, participantAddress), participantAddress || "Twilio participant");

  return {
    provider,
    workspaceId,
    accountId: normalizeText(firstNonEmpty(body.AccountSid, body.accountSid, body.ChatServiceSid, body.chatServiceSid), ""),
    eventType,
    verification: {
      provider,
      transport: "twilio-conversations-webhook",
      verified: true,
      signed: true,
      note: "Accepted through the Supabase Edge Function Twilio receiver."
    },
    contact: {
      externalId: participantAddress || normalizeText(firstNonEmpty(body.ParticipantSid, body.participantSid), `${provider}:participant`),
      name: normalizeText(firstNonEmpty(body.ParticipantIdentity, body.participantIdentity, author), author),
      email: "",
      phone: provider === "whatsapp" ? participantAddress.replace(/^whatsapp:/i, "") : "",
      company: "",
      leadStage: "new",
      ownerName: "",
      tags: [provider, "twilio-conversations"]
    },
    conversation: {
      externalId: conversationSid,
      subject: normalizeText(firstNonEmpty(body.FriendlyName, body.friendlyName, messageBody), `Twilio ${provider} conversation`),
      status: normalizeText(firstNonEmpty(body.State, body.state), "open"),
      priority: "normal",
      source: provider === "instagram" ? "Instagram" : provider === "messenger" ? "Messenger" : "WhatsApp",
      assignedTo: "",
      summary: normalizeText(firstNonEmpty(messageBody), "")
    },
    messages: messageBody || messageSid
      ? [{
          externalId: messageSid || `${conversationSid}:message:${Date.now()}`,
          direction: eventType.includes("delivery") || eventType.includes("updated") ? "outbound" : "inbound",
          senderName: author,
          body: messageBody || `Twilio event ${eventTypeRaw}`,
          createdAt: toIso(firstNonEmpty(body.DateCreated, body.dateCreated, body.Timestamp, body.timestamp)),
          rawPayload: {
            ...body,
            participant_address: participantAddress,
            proxy_address: proxyAddress
          }
        }]
      : [],
    deliveryReceipts: deliveryStatus
      ? [{
          externalMessageId: messageSid || `${conversationSid}:message`,
          status: deliveryStatus,
          timestamp: toIso(firstNonEmpty(body.DateUpdated, body.dateUpdated, body.Timestamp, body.timestamp)),
          recipientId: participantAddress,
          conversationExternalId: conversationSid,
          error: normalizeText(firstNonEmpty(body.ErrorCode, body.errorCode, body.ErrorMessage, body.errorMessage), ""),
          rawPayload: body
        }]
      : []
  };
}

function buildTwilioMessagingEnvelope(providerHint: string, workspaceId: string, body: Record<string, unknown>) {
  const channel = inferTwilioMessagingChannel(body);
  const provider = channel;
  const fromAddress = normalizeText(firstNonEmpty(body.From, body.from), "");
  const toAddress = normalizeText(firstNonEmpty(body.To, body.to), "");
  const waId = normalizeText(firstNonEmpty(body.WaId, body.waId), "");
  const messageSid = normalizeText(firstNonEmpty(body.MessageSid, body.messageSid, body.SmsSid, body.smsSid), "");
  const messageBody = normalizeText(firstNonEmpty(body.Body, body.body), "");
  const profileName = normalizeText(firstNonEmpty(body.ProfileName, body.profileName), "WhatsApp contact");
  const conversationExternalId = normalizeText(
    firstNonEmpty(body.ConversationSid, body.conversationSid, waId || fromAddress),
    `${provider}:thread`
  );

  return {
    provider,
    workspaceId,
    accountId: normalizeText(firstNonEmpty(body.AccountSid, body.accountSid), ""),
    eventType: `twilio.${provider}.message.received`,
    verification: {
      provider,
      transport: "twilio-messaging-webhook",
      verified: true,
      signed: true,
      note: "Accepted through the Supabase Edge Function Twilio messaging receiver."
    },
    contact: {
      externalId: waId || fromAddress || `${provider}:participant`,
      name: profileName,
      email: "",
      phone: fromAddress.replace(/^whatsapp:/i, ""),
      company: "",
      leadStage: "new",
      ownerName: "",
      tags: [provider, "twilio-messaging"]
    },
    conversation: {
      externalId: conversationExternalId,
      subject: normalizeText(firstNonEmpty(messageBody), "Incoming WhatsApp thread"),
      status: "open",
      priority: "normal",
      source: provider === "whatsapp" ? "WhatsApp" : provider,
      assignedTo: "",
      summary: messageBody
    },
    messages: [{
      externalId: messageSid || `${conversationExternalId}:message:${Date.now()}`,
      channel,
      direction: "inbound",
      senderName: profileName,
      body: messageBody || "Incoming message",
      createdAt: new Date().toISOString(),
      rawPayload: {
        ...body,
        from: fromAddress,
        to: toAddress,
        wa_id: waId
      }
    }],
    deliveryReceipts: []
  };
}

serve(async (request) => {
  try {
  const url = new URL(request.url);
  const providerHint = normalizeText(url.searchParams.get("provider"), "");
  const workspaceId = normalizeText(url.searchParams.get("workspace_id") || url.searchParams.get("workspaceId"), "");
  const jsonHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,x-twilio-signature"
  };

  if (request.method === "OPTIONS") {
    return new Response(JSON.stringify({ ok: true, provider: providerHint || "twilio", workspaceId }), {
      status: 200,
      headers: jsonHeaders
    });
  }

  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: jsonHeaders
    });
  }

  if (request.method === "GET") {
    return new Response(JSON.stringify({
      ok: true,
      provider: providerHint || "twilio",
      workspaceId,
      receiver: "supabase-edge-function"
    }), {
      status: 200,
      headers: jsonHeaders
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders
    });
  }

  const { body, rawText } = await readRequestBody(request);
  const normalizedBody = body as Record<string, unknown>;
  const normalizedContentType = normalizeText(request.headers.get("content-type"), "").toLowerCase();

  if (looksLikeBotpressInstagramEvent(normalizedContentType, normalizedBody)) {
    const sender = normalizeText(firstNonEmpty(normalizedBody.sender, normalizedBody.user_id, normalizedBody.userId), "");
    const text = normalizeText(firstNonEmpty(normalizedBody.text, normalizedBody.message, normalizedBody.body), "");
    const provider = "instagram";
    const resolvedWorkspaceId = workspaceId || normalizeText(firstNonEmpty(normalizedBody.workspace_id, normalizedBody.workspaceId), "");

    const envelope = {
      provider,
      workspaceId: resolvedWorkspaceId,
      accountId: normalizeText(firstNonEmpty(normalizedBody.accountId, normalizedBody.account_id), "botpress-instagram"),
      eventType: "botpress.instagram.message.received",
      verification: {
        provider,
        transport: "botpress-webhook",
        verified: true,
        signed: false,
        note: "Accepted through Botpress JSON webhook."
      },
      contact: {
        externalId: sender,
        name: normalizeText(firstNonEmpty(normalizedBody.senderName, normalizedBody.sender_name), "Instagram User"),
        email: "",
        phone: "",
        company: "",
        leadStage: "new",
        ownerName: "",
        tags: ["instagram", "botpress"]
      },
      conversation: {
        externalId: `instagram:${sender}`,
        subject: text.slice(0, 120) || "Instagram Botpress thread",
        status: "open",
        priority: "normal",
        source: "Instagram",
        assignedTo: "",
        summary: text
      },
      messages: [{
        externalId: normalizeText(firstNonEmpty(normalizedBody.messageId, normalizedBody.message_id), `botpress-instagram:${sender}:${Date.now()}`),
        channel: "instagram",
        direction: "inbound",
        senderName: normalizeText(firstNonEmpty(normalizedBody.senderName, normalizedBody.sender_name), "Instagram User"),
        body: text,
        createdAt: new Date().toISOString(),
        rawPayload: normalizedBody
      }],
      deliveryReceipts: []
    };

    const saved = await saveEnvelopeToSupabase(envelope);
    const conversationId = normalizeText(saved?.conversationRow?.id, "");
    const isAiPaused = [
      saved?.conversationRow?.is_ai_paused,
      saved?.conversationRow?.isAiPaused
    ].some((value) => normalizeBoolean(value));
    if (isAiPaused) {
      await logReliabilityEvent(resolvedWorkspaceId, provider, envelope.eventType, {
        body: normalizedBody,
        rawText,
        saved,
        aiPaused: true
      }, {
        status: "received",
        replayKey: envelope.messages[0]?.externalId || envelope.conversation.externalId,
        dedupeKey: envelope.messages[0]?.externalId || envelope.conversation.externalId
      }).catch(() => null);

      return new Response(JSON.stringify({ ok: true, paused: true, reply: "" }), {
        status: 200,
        headers: jsonHeaders
      });
    }
    const reply =
      await fetchConversationReply(conversationId)
      || "Hi, this is Aura from Northstar Commerce. Thanks for your message.";

    await logReliabilityEvent(resolvedWorkspaceId, provider, envelope.eventType, {
      body: normalizedBody,
      rawText,
      saved
    }, {
      status: "received",
      replayKey: envelope.messages[0]?.externalId || envelope.conversation.externalId,
      dedupeKey: envelope.messages[0]?.externalId || envelope.conversation.externalId
    }).catch(() => null);

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: jsonHeaders
    });
  }

  if (looksLikeTwilioConversationsBody(normalizedBody)) {
    const verification = await verifyTwilioSignature(request, normalizedBody);
    if (!verification.verified) {
      return new Response(JSON.stringify({ error: verification.reason }), {
        status: 401,
        headers: jsonHeaders
      });
    }

    const envelope = buildTwilioEnvelope(providerHint, workspaceId, normalizedBody);
    envelope.verification = {
      ...(envelope.verification || {}),
      verified: verification.verified,
      signed: verification.verified,
      note: verification.reason
    };

    const saved = await saveEnvelopeToSupabase(envelope);
    await logReliabilityEvent(envelope.workspaceId || workspaceId, envelope.provider, envelope.eventType, {
      body: normalizedBody,
      rawText,
      saved
    }, {
      status: "received",
      replayKey: envelope.messages?.[0]?.externalId || envelope.conversation?.externalId || "",
      dedupeKey: envelope.messages?.[0]?.externalId || envelope.conversation?.externalId || ""
    }).catch(() => null);

    return twimlAckResponse();
  }

  if (looksLikeTwilioMessagingBody(normalizedBody)) {
    const messagingProvider = inferTwilioMessagingChannel(normalizedBody);
    const verification = await verifyTwilioSignature(request, normalizedBody, { provider: messagingProvider });
    if (!verification.verified) {
      return new Response(JSON.stringify({ error: verification.reason }), {
        status: 401,
        headers: jsonHeaders
      });
    }

    const envelope = buildTwilioMessagingEnvelope(providerHint, workspaceId, normalizedBody);
    envelope.verification = {
      ...(envelope.verification || {}),
      verified: verification.verified,
      signed: verification.verified,
      note: verification.reason
    };

    const saved = await saveEnvelopeToSupabase(envelope);
    await logReliabilityEvent(envelope.workspaceId || workspaceId, envelope.provider, envelope.eventType, {
      body: normalizedBody,
      rawText,
      saved
    }, {
      status: "received",
      replayKey: envelope.messages?.[0]?.externalId || envelope.conversation?.externalId || "",
      dedupeKey: envelope.messages?.[0]?.externalId || envelope.conversation?.externalId || ""
    }).catch(() => null);

    return twimlAckResponse();
  }

  if (normalizedBody.contact && normalizedBody.conversation && Array.isArray(normalizedBody.messages)) {
    const saved = await saveEnvelopeToSupabase({
      ...normalizedBody,
      workspaceId: workspaceId || normalizeText((normalizedBody as Record<string, unknown>).workspaceId || (normalizedBody as Record<string, unknown>).workspace_id, "")
    });
    return new Response(JSON.stringify({ ok: true, workspaceId, saved }), {
      status: 200,
      headers: jsonHeaders
    });
  }

    return new Response(JSON.stringify({
      error: "Unsupported webhook payload. Expected a Twilio Conversations webhook or a normalized AuraFlow envelope."
    }), {
      status: 400,
      headers: jsonHeaders
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      ok: false,
      error: message
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS",
        "Access-Control-Allow-Headers": "content-type,x-twilio-signature"
      }
    });
  }
});
