import { serve } from "https://deno.land/std/http/server.ts";

import { saveEnvelopeToSupabase } from "../_shared/auraflow.ts";

type GenericRecord = Record<string, unknown>;

function env(name: string, fallback = "") {
  return Deno.env.get(name) || fallback;
}

function normalizeText(value: unknown, fallback = "") {
  return String(value || "").trim() || fallback;
}

function normalizePhone(value: unknown) {
  const raw = normalizeText(value, "");
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  return `+${cleaned}`;
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function xmlEscape(input: unknown) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

async function readBody(request: Request) {
  const rawText = await request.text();
  const contentType = normalizeText(request.headers.get("content-type"), "").toLowerCase();
  if (!rawText) return {};
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return parseFormBody(rawText);
  }
  try {
    return JSON.parse(rawText);
  } catch {
    return {};
  }
}

function supabaseBase() {
  return normalizeText(env("SUPABASE_URL"), "").replace(/\/$/, "");
}

function supabaseServiceKey() {
  return normalizeText(env("AURAFLOW_SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"), "");
}

async function supabaseRest(pathname: string, { method = "GET", query = "", body = null, prefer = "return=representation" }: { method?: string; query?: string; body?: unknown; prefer?: string } = {}) {
  const baseUrl = supabaseBase();
  const serviceKey = supabaseServiceKey();
  if (!baseUrl || !serviceKey) return null;

  const endpoint = new URL(`${baseUrl}/rest/v1/${pathname}`);
  if (query) {
    const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    params.forEach((value, key) => endpoint.searchParams.set(key, value));
  }

  const response = await fetch(endpoint, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Profile": env("SUPABASE_SCHEMA", "public"),
      "Content-Profile": env("SUPABASE_SCHEMA", "public"),
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  if (!response.ok) return null;
  if (!text) return [];
  return JSON.parse(text);
}

async function hasMessageExternalId(workspaceId: string, provider: string, externalId: string) {
  const rows = await supabaseRest("messages", {
    query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&source_provider=eq.${encodeURIComponent(provider)}&external_message_id=eq.${encodeURIComponent(externalId)}&select=id&limit=1`
  });
  return Array.isArray(rows) && rows.length > 0;
}

async function sendTwilioSms(toPhone: string, bodyText: string) {
  const accountSid = normalizeText(env("TWILIO_ACCOUNT_SID"), "");
  const authToken = normalizeText(env("TWILIO_AUTH_TOKEN"), "");
  const configuredFrom = normalizeText(env("TWILIO_SMS_FROM_NUMBER"), "");
  const normalizedConfigured = configuredFrom.replace(/^\+/, "");
  const shouldResolveFromAccount = !configuredFrom || normalizedConfigured === "15551234567";
  const fromPhone = shouldResolveFromAccount
    ? await (async () => {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers.json?PageSize=20`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`
        }
      }).catch(() => null);
      if (!response || !response.ok) return configuredFrom;
      const data = await response.json().catch(() => ({}));
      const numbers = normalizeArray<GenericRecord>(data?.incoming_phone_numbers);
      const smsCapable = numbers.find((item) => Boolean(item?.capabilities?.sms) && normalizeText(item?.status, "").toLowerCase() === "in-use");
      return normalizeText(smsCapable?.phone_number, configuredFrom);
    })()
    : configuredFrom;
  if (!accountSid || !authToken || !fromPhone || !toPhone) return { ok: false, sid: "", error: "Twilio SMS credentials are incomplete." };

  const payload = new URLSearchParams();
  payload.set("To", toPhone);
  payload.set("From", fromPhone);
  payload.set("Body", bodyText);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString()
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, sid: "", error: normalizeText(data?.message, `Twilio SMS send failed (${response.status}).`) };
  }
  return { ok: true, sid: normalizeText(data?.sid, ""), error: "" };
}

async function fetchConversationDraft(conversationId: string) {
  const base = supabaseBase();
  const serviceKey = supabaseServiceKey();
  if (!base || !serviceKey || !conversationId) return "";

  const endpoint = new URL(`${base}/rest/v1/conversations`);
  endpoint.searchParams.set("id", `eq.${conversationId}`);
  endpoint.searchParams.set("select", "draft_reply,ai_draft_reply");

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
      "Accept-Profile": env("SUPABASE_SCHEMA", "public")
    }
  });

  if (!response.ok) return "";
  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  return normalizeText(row?.draft_reply || row?.ai_draft_reply, "");
}

function twimlResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type"
    }
  });
}

function buildGatherTwiml(actionUrl: string, prompt: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" speechTimeout="auto" method="POST" action="${xmlEscape(actionUrl)}">
    <Say>${xmlEscape(prompt)}</Say>
  </Gather>
  <Say>${xmlEscape("I did not catch that. Please say that again.")}</Say>
  <Redirect method="POST">${xmlEscape(actionUrl)}</Redirect>
</Response>`;
}

function buildSimpleTwiml(message: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${xmlEscape(message)}</Say>
</Response>`;
}

function keywordRank(items: GenericRecord[], queryText = "", fields: string[] = []) {
  const normalized = normalizeText(queryText, "").toLowerCase();
  if (!normalized) return items.slice(0, 8);
  const keywords = normalized.split(/\s+/).filter(Boolean);
  const ranked = items
    .map((item) => {
      const haystack = fields.map((field) => normalizeText(item[field], "")).join(" ").toLowerCase();
      const score = keywords.reduce((acc, key) => acc + (haystack.includes(key) ? 1 : 0), 0);
      return { item, score };
    })
    .sort((left, right) => right.score - left.score);
  return ranked.filter((entry) => entry.score > 0).map((entry) => entry.item).concat(items).slice(0, 8);
}

function defaultVoicePrompt(instructions: string, tone: string) {
  return [
    "You are Aura, the AI receptionist for Northstar Commerce.",
    `Tone: ${tone || "professional"}.`,
    "Use business knowledge and workspace training sources first before general assumptions.",
    "Keep spoken replies concise, human, and service-oriented.",
    "If a request is uncertain, acknowledge and offer a clear next step.",
    instructions ? `Operator instructions: ${instructions}` : ""
  ].filter(Boolean).join("\n");
}

async function loadAgentConfig(workspaceId: string, queryHint = "") {
  const [configRows, agentRows, trainingRows, businessRows] = await Promise.all([
    supabaseRest("agent_config", {
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&select=*&limit=1`
    }),
    supabaseRest("agents", {
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&select=id,status,tone,instructions,knowledge_sources&order=updated_at.desc&limit=1`
    }),
    supabaseRest("training_sources", {
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&select=id,title,body,tags,relevance&order=updated_at.desc&limit=24`
    }),
    supabaseRest("business_knowledge", {
      query: `workspace_id=eq.${encodeURIComponent(workspaceId)}&select=id,topic,question,answer,tags,priority&order=priority.desc,updated_at.desc&limit=24`
    })
  ]);

  const existing = Array.isArray(configRows) ? configRows[0] : null;
  const primaryAgent = Array.isArray(agentRows) ? agentRows[0] : null;
  const trainingSources = keywordRank(normalizeArray<GenericRecord>(trainingRows), queryHint, ["title", "body", "relevance"]);
  const businessKnowledge = keywordRank(normalizeArray<GenericRecord>(businessRows), queryHint, ["topic", "question", "answer"]);

  const status = normalizeText(existing?.status || primaryAgent?.status, "active").toLowerCase();
  const tone = normalizeText(existing?.tone || primaryAgent?.tone, "professional").toLowerCase();
  const instructions = normalizeText(
    existing?.instructions || primaryAgent?.instructions,
    "Greet callers warmly, answer with verified business knowledge, and escalate uncertainty to a human follow-up."
  );
  const smsFollowupPolicy = typeof existing?.sms_followup_policy === "object" && existing?.sms_followup_policy
    ? existing.sms_followup_policy as GenericRecord
    : {
      enabled: true,
      enabled_statuses: ["active", "live"],
      blocked_tones: ["quiet", "manual_only", "no_followup", "silent"]
    };

  const knowledgeSources = {
    training_sources: trainingSources.map((item) => ({
      id: item.id || "",
      title: item.title || "",
      tags: Array.isArray(item.tags) ? item.tags : []
    })),
    business_knowledge: businessKnowledge.map((item) => ({
      id: item.id || "",
      topic: item.topic || "",
      question: item.question || "",
      priority: item.priority || 0
    }))
  };

  const voiceSystemPrompt = normalizeText(
    existing?.voice_system_prompt,
    defaultVoicePrompt(instructions, tone)
  );

  const payload = {
    workspace_id: workspaceId,
    status,
    tone,
    instructions,
    knowledge_sources: knowledgeSources,
    voice_system_prompt: voiceSystemPrompt,
    sms_followup_policy: smsFollowupPolicy,
    metadata: {
      source_agent_id: primaryAgent?.id || null,
      knowledge_counts: {
        training_sources: knowledgeSources.training_sources.length,
        business_knowledge: knowledgeSources.business_knowledge.length
      },
      synced_at: new Date().toISOString()
    },
    updated_at: new Date().toISOString()
  };

  const upserted = await supabaseRest("agent_config", {
    method: "POST",
    query: "on_conflict=workspace_id",
    prefer: "resolution=merge-duplicates,return=representation",
    body: [payload]
  });
  const row = Array.isArray(upserted) ? upserted[0] : payload;

  return {
    id: normalizeText(row?.id || existing?.id, ""),
    workspaceId,
    status,
    tone,
    instructions,
    voiceSystemPrompt,
    smsFollowupPolicy,
    trainingSources,
    businessKnowledge
  };
}

function shouldSendMissedCallFollowup(config: {
  status: string;
  tone: string;
  smsFollowupPolicy: GenericRecord;
}, callStatus: string, speechResult: string) {
  const terminalStatuses = ["completed", "busy", "failed", "no-answer", "canceled"];
  if (speechResult) {
    return { required: false, reason: "Call had speech content; no missed-call SMS needed." };
  }
  if (!terminalStatuses.includes(callStatus)) {
    return { required: false, reason: "Call is not in a terminal state." };
  }

  const policy = config.smsFollowupPolicy || {};
  const enabled = policy.enabled !== false;
  const status = normalizeText(config.status, "active").toLowerCase();
  const tone = normalizeText(config.tone, "professional").toLowerCase();
  const enabledStatuses = normalizeArray<string>(policy.enabled_statuses).map((item) => String(item).toLowerCase());
  const blockedTones = normalizeArray<string>(policy.blocked_tones).map((item) => String(item).toLowerCase());

  if (!enabled) {
    return { required: false, reason: "SMS follow-up policy is disabled." };
  }
  const statusAllowed = !enabledStatuses.length || enabledStatuses.some((entry) => status.includes(entry));
  if (!statusAllowed) {
    return { required: false, reason: `Agent status "${status}" does not allow automated follow-up.` };
  }
  const toneBlocked = blockedTones.some((entry) => tone.includes(entry));
  if (toneBlocked) {
    return { required: false, reason: `Agent tone "${tone}" blocks automated follow-up.` };
  }

  return { required: true, reason: "Agent tone/status policy allows missed-call SMS follow-up." };
}

function buildVoiceKnowledgeSummary(trainingSources: GenericRecord[], businessKnowledge: GenericRecord[]) {
  const trainingText = trainingSources.slice(0, 5).map((source) =>
    `- ${normalizeText(source.title, "Source")}: ${normalizeText(source.body, "").slice(0, 220)}`
  ).join("\n");
  const businessText = businessKnowledge.slice(0, 8).map((entry) =>
    `- ${normalizeText(entry.topic, "General")} | Q: ${normalizeText(entry.question, "")} | A: ${normalizeText(entry.answer, "").slice(0, 260)}`
  ).join("\n");
  return { trainingText, businessText };
}

async function generateVoiceReply({
  callerName,
  speechResult,
  config
}: {
  callerName: string;
  speechResult: string;
  config: {
    voiceSystemPrompt: string;
    instructions: string;
    tone: string;
    trainingSources: GenericRecord[];
    businessKnowledge: GenericRecord[];
  };
}) {
  const openRouterKey = env("OPENROUTER_API_KEY") || env("OPENAI_API_KEY");
  const openRouterModel = env("OPENROUTER_MODEL", "openai/gpt-4o-mini");
  const geminiKey = env("GEMINI_API_KEY");
  const geminiModel = env("GEMINI_MODEL", "gemini-2.5-flash");

  const { trainingText, businessText } = buildVoiceKnowledgeSummary(config.trainingSources, config.businessKnowledge);
  const systemPrompt = [
    config.voiceSystemPrompt,
    `Tone directive: ${config.tone}.`,
    `Operator instructions: ${config.instructions}`,
    "Prioritize business knowledge and training sources over general assumptions.",
    "Respond as one concise spoken reply (max 2 short sentences)."
  ].filter(Boolean).join("\n");

  const userPrompt = [
    `Caller: ${callerName || "Caller"}`,
    `Caller request: ${speechResult}`,
    "Business knowledge:",
    businessText || "- No business knowledge entries found.",
    "Training sources:",
    trainingText || "- No training sources found.",
    "Return plain text only."
  ].join("\n");

  if (openRouterKey) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env("OPENROUTER_SITE_URL", env("SUPABASE_URL", "https://auraflow.app")),
        "X-Title": env("OPENROUTER_APP_NAME", "AuraFlow Voice")
      },
      body: JSON.stringify({
        model: openRouterModel,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      return normalizeText(data?.choices?.[0]?.message?.content, "");
    }
  }

  if (geminiKey) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.2
        }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      return normalizeText(data?.candidates?.[0]?.content?.parts?.map((part: GenericRecord) => part.text || "").join(""), "");
    }
  }

  return "";
}

serve(async (request) => {
  const url = new URL(request.url);
  const forwardedProto = normalizeText(request.headers.get("x-forwarded-proto"), "");
  const forwardedHost = normalizeText(request.headers.get("x-forwarded-host"), "");
  const computedOrigin = forwardedHost
    ? `${forwardedProto || "https"}://${forwardedHost}`
    : url.origin.replace(/^http:\/\//i, "https://");
  const workspaceId = normalizeText(
    url.searchParams.get("workspace_id")
    || url.searchParams.get("workspaceId")
    || env("AURAFLOW_DEFAULT_WORKSPACE_ID"),
    ""
  );
  const externalPath = url.pathname.startsWith("/functions/v1/")
    ? url.pathname
    : `/functions/v1${url.pathname}`;
  const baseActionUrl = `${computedOrigin}${externalPath}?workspace_id=${encodeURIComponent(workspaceId)}`;

  if (request.method === "OPTIONS") {
    return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }

  if (request.method !== "POST") {
    return twimlResponse(buildGatherTwiml(baseActionUrl, "Welcome to Northstar Commerce, I am Aura, your AI assistant. How can I help you today?"));
  }

  const body = await readBody(request) as Record<string, unknown>;
  const fromPhone = normalizePhone(body.From);
  const toPhone = normalizePhone(body.To);
  const callSid = normalizeText(body.CallSid, `${fromPhone || "voice"}:${Date.now()}`);
  const callStatus = normalizeText(body.CallStatus, "").toLowerCase();
  const speechResult = normalizeText(body.SpeechResult, "");
  const callerName = normalizeText(body.CallerName, "Phone caller");

  if (!workspaceId) {
    return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Workspace is not configured.</Say></Response>`);
  }

  const agentConfig = await loadAgentConfig(workspaceId, speechResult).catch(() => ({
    id: "",
    workspaceId,
    status: "active",
    tone: "professional",
    instructions: "Greet callers warmly and provide concise helpful guidance.",
    voiceSystemPrompt: defaultVoicePrompt("Greet callers warmly and provide concise helpful guidance.", "professional"),
    smsFollowupPolicy: {
      enabled: true,
      enabled_statuses: ["active", "live"],
      blocked_tones: ["quiet", "manual_only", "no_followup", "silent"]
    },
    trainingSources: [],
    businessKnowledge: []
  }));

  const followupDecision = shouldSendMissedCallFollowup(agentConfig, callStatus, speechResult);
  if (followupDecision.required) {
    const followupMessage = "Hi, this is Aura from Northstar. I saw you just called! How can I help you?";
    const followupExternalId = `voice-missed:${callSid}`;
    const alreadySent = await hasMessageExternalId(workspaceId, "sms", followupExternalId);
    if (!alreadySent && fromPhone) {
      const smsResult = await sendTwilioSms(fromPhone, followupMessage);
      await saveEnvelopeToSupabase({
        provider: "sms",
        workspaceId,
        contact: {
          externalId: fromPhone,
          name: callerName,
          phone: fromPhone,
          tags: ["sms", "voice-followup"]
        },
        conversation: {
          externalId: fromPhone,
          subject: "Voice follow-up SMS",
          status: "open",
          priority: "normal",
          source: "SMS",
          summary: followupMessage
        },
        messages: [{
          externalId: followupExternalId,
          providerMessageId: smsResult.sid,
          channel: "sms",
          direction: "outbound",
          senderName: "Aura",
          body: followupMessage,
          deliveryState: smsResult.ok ? "sent" : "failed",
          createdAt: new Date().toISOString(),
          rawPayload: {
            call_sid: callSid,
            call_status: callStatus,
            to: fromPhone,
            agent_status: agentConfig.status,
            agent_tone: agentConfig.tone,
            followup_reason: followupDecision.reason,
            twilio_message_sid: smsResult.sid,
            twilio_error: smsResult.error
          }
        }]
      }).catch(() => null);
    }
    return twimlResponse(buildSimpleTwiml("Thank you for calling Northstar Commerce. We just sent you a quick text so we can help right away."));
  }

  if (!speechResult) {
    const greeting = "Welcome to Northstar Commerce, I am Aura, your AI assistant. How can I help you today?";
    return twimlResponse(buildGatherTwiml(baseActionUrl, greeting));
  }

  const saved = await saveEnvelopeToSupabase({
    provider: "voice",
    workspaceId,
    contact: {
      externalId: fromPhone || callSid,
      name: callerName,
      phone: fromPhone,
      tags: ["voice", "twilio"]
    },
    conversation: {
      externalId: callSid,
      subject: "Inbound voice call",
      status: "open",
      priority: "normal",
      source: "Voice",
      summary: speechResult
    },
    messages: [{
      externalId: `${callSid}:${Date.now()}`,
      channel: "voice",
      direction: "inbound",
      senderName: callerName || "Caller",
      body: speechResult,
      createdAt: new Date().toISOString(),
      rawPayload: {
        from: fromPhone,
        to: toPhone,
        call_sid: callSid,
        twilio: body
      }
    }]
  }).catch(() => null);

  const voiceReply = await generateVoiceReply({
    callerName,
    speechResult,
    config: agentConfig
  }).catch(() => "");
  const aiDraft = normalizeText(await fetchConversationDraft(saved?.conversationRow?.id || ""), "");
  const reply = voiceReply || aiDraft || "Thank you for calling Northstar Commerce. I have recorded your request and our team will follow up shortly.";
  return twimlResponse(buildGatherTwiml(baseActionUrl, reply));
});
