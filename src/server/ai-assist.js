import { buildAiWorkspaceContext } from '../integrations/ai-context.js';

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function extractFirstJsonObject(value = '') {
  const text = String(value || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return start === -1 ? '' : text.slice(start);
  }
  return text.slice(start, end + 1);
}

function extractQuotedField(raw = '', key = '') {
  const pattern = new RegExp(`"${String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*"([\\s\\S]*?)(?:"\\s*,|"$)`, 'i');
  const match = String(raw || '').match(pattern);
  if (!match) return '';
  return String(match[1] || '')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .trim();
}

function extractBooleanField(raw = '', key = '') {
  const pattern = new RegExp(`"${String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*(true|false)`, 'i');
  const match = String(raw || '').match(pattern);
  return match ? String(match[1]).toLowerCase() === 'true' : false;
}

function extractNumberField(raw = '', key = '') {
  const pattern = new RegExp(`"${String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, 'i');
  const match = String(raw || '').match(pattern);
  return match ? Number(match[1]) : NaN;
}

function recoverPartialBriefing(raw = '') {
  const sequenceChunkMatch = String(raw || '').match(/"sequenceSuggestion"\s*:\s*\{([\s\S]*)$/i);
  const sequenceChunk = sequenceChunkMatch ? sequenceChunkMatch[1] : '';
  return {
    summary: extractQuotedField(raw, 'summary'),
    classification: extractQuotedField(raw, 'classification'),
    nextAction: extractQuotedField(raw, 'nextAction'),
    replyDraft: extractQuotedField(raw, 'replyDraft'),
    confidence: extractNumberField(raw, 'confidence'),
    suggestedAssignee: extractQuotedField(raw, 'suggestedAssignee'),
    followUpTiming: extractQuotedField(raw, 'followUpTiming'),
    handoffReason: extractQuotedField(raw, 'handoffReason'),
    shouldEscalate: extractBooleanField(raw, 'shouldEscalate'),
    leadScoreLabel: extractQuotedField(raw, 'leadScoreLabel'),
    leadScoreReason: extractQuotedField(raw, 'leadScoreReason'),
    sequenceSuggestion: {
      name: extractQuotedField(sequenceChunk, 'name'),
      channel: extractQuotedField(sequenceChunk, 'channel'),
      goal: extractQuotedField(sequenceChunk, 'goal'),
      trigger: extractQuotedField(sequenceChunk, 'trigger'),
      notes: extractQuotedField(sequenceChunk, 'notes'),
      steps: []
    }
  };
}

function normalizeChannelKey(conversation = {}) {
  return String(
    conversation.source_provider
    || conversation.sourceProvider
    || conversation.channel
    || conversation.source
    || ''
  ).trim().toLowerCase();
}

function getConversationChannelProfile(conversation = {}) {
  const providerKey = normalizeChannelKey(conversation);
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
      classifyStyle: 'Bias toward operational clarity, urgency, and whether a formal follow-up is required.',
      briefingStyle: [
        'Favor clearer, more formal operator language.',
        'Recommend email-friendly follow-up sequences unless the thread has already shifted channels.'
      ]
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
      classifyStyle: 'Bias toward response speed, handoff need, and whether the customer is waiting on an operational action.',
      briefingStyle: [
        'Favor quick, mobile-first next steps.',
        'Sequence suggestions should default to short WhatsApp touches unless email is clearly better.'
      ]
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
      classifyStyle: 'Bias toward lead intent, sentiment, and whether the DM should move into a higher-touch support or sales workflow.',
      briefingStyle: [
        'Optimize for lead qualification, booking, and quick replies.',
        'Sequence suggestions should stay lightweight and conversion-oriented.'
      ]
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
      classifyStyle: 'Bias toward support triage, escalation need, and the next operator action.',
      briefingStyle: [
        'Favor chat-native workflow recommendations.',
        'When the thread looks sales-like, recommend a simple follow-up path with a booking CTA.'
      ]
    },
    facebook: {
      key: 'facebook',
      label: 'Facebook Lead Ads',
      replyStyle: [
        'Assume this is a newly captured lead rather than an ongoing support thread.',
        'Write a short first-touch follow-up that confirms the inquiry and proposes one clear next step.',
        'Keep it sales-aware, warm, and confidence-building.',
        'Do not pretend there is a long prior thread if the payload looks like a form submission.'
      ],
      summaryStyle: 'Treat the thread as lead intake first: capture intent, qualification clues, urgency, and the best first response channel.',
      classifyStyle: 'Bias toward lead quality, routing owner, and whether immediate sales follow-up is warranted.',
      briefingStyle: [
        'Sequence suggestions should prioritize qualification and fast first-touch follow-up.',
        'Recommend ownership and follow-up timing like a lead desk, not a support queue.'
      ]
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
    classifyStyle: 'Classify for operational usefulness and clear next-step routing.',
    briefingStyle: [
      'Keep the recommendation operational and channel-appropriate.',
      'Choose the simplest follow-up plan that still moves the thread forward.'
    ]
  };
}

function buildLeadScoreInstructions(channelProfile) {
  if (channelProfile.key === 'facebook' || channelProfile.key === 'instagram') {
    return 'For social or lead-intake channels, score for sales intent, urgency, and contact completeness before general support handling.';
  }
  if (channelProfile.key === 'gmail') {
    return 'For email, score for depth of intent, reply likelihood, and whether a formal sequence is justified.';
  }
  if (channelProfile.key === 'whatsapp' || channelProfile.key === 'messenger') {
    return 'For chat channels, score for immediacy, conversion readiness, and whether the lead should move into a faster-touch follow-up path.';
  }
  return 'Score the thread for urgency, intent, and the best owner.';
}

function buildModePrompts({ mode, channelProfile, sharedContext }) {
  return {
    reply: [
      'You are an AI customer support and sales assistant for AuraFlow.',
      'Write one concise, production-ready reply draft.',
      `This conversation is on ${channelProfile.label}.`,
      ...channelProfile.replyStyle,
      'If the user asks about product capabilities, answer directly and mention human handoff when relevant.',
      'Do not invent pricing or policies not provided in the context.',
      'If the customer sounds upset, legally sensitive, refund-related, or high-risk, de-escalate and leave room for human review.',
      '',
      sharedContext,
      '',
      'Return only the reply body. No markdown, no preamble.'
    ].join('\n'),
    summary: [
      'You are summarizing a customer conversation for a human support operator.',
      'Write a short summary in 2 to 4 sentences.',
      'Include customer intent, urgency, and any risk or handoff signal.',
      `Channel guidance: ${channelProfile.summaryStyle}`,
      '',
      sharedContext,
      '',
      'Return only the summary.'
    ].join('\n'),
    classify: [
      'You are classifying a customer conversation for support operations.',
      'Return exactly 3 short lines in this format:',
      'Intent: ...',
      'Priority: ...',
      'Next tag: ...',
      `Channel guidance: ${channelProfile.classifyStyle}`,
      '',
      sharedContext
    ].join('\n'),
    next_action: [
      'You are advising a human operator on the next best action.',
      'Return one short actionable recommendation.',
      `Channel guidance: ${channelProfile.classifyStyle}`,
      '',
      sharedContext
    ].join('\n'),
    briefing: [
      'You are the shared AI operating layer for AuraFlow.',
      'Analyze the thread and return one structured operator briefing as valid JSON.',
      `This conversation is on ${channelProfile.label}.`,
      'Use the workspace knowledge and business knowledge before generic model knowledge.',
      ...channelProfile.briefingStyle,
      buildLeadScoreInstructions(channelProfile),
      'The JSON must include these keys:',
      '{',
      '  "summary": "2 to 4 sentence operator summary",',
      '  "classification": "short intent + priority + risk label",',
      '  "nextAction": "one short actionable next step",',
      '  "replyDraft": "production-ready reply draft for the customer",',
      '  "confidence": 0.0,',
      '  "suggestedAssignee": "best owner or team",',
      '  "followUpTiming": "recommended follow-up timing",',
      '  "handoffReason": "why this should be routed, watched, or escalated",',
      '  "shouldEscalate": false,',
      '  "leadScoreLabel": "Hot lead | Warm lead | Needs review | Unscored",',
      '  "leadScoreReason": "why this lead or thread got that score",',
      '  "sequenceSuggestion": {',
      '    "name": "follow-up sequence name",',
      '    "channel": "best channel mix",',
      '    "goal": "sequence goal",',
      '    "trigger": "when to start the follow-up",',
      '    "notes": "operator note for the sequence editor",',
      '    "steps": ["step one", "step two", "step three"]',
      '  }',
      '}',
      'Keep every field concise and operational.',
      'Set shouldEscalate to true for refunds, legal/policy risk, angry customers, missing routing, or low certainty.',
      'Sequence steps should be short, actionable, and channel-appropriate.',
      'Return JSON only. No markdown fences.',
      '',
      sharedContext
    ].join('\n')
  }[mode];
}

async function requestOpenRouterChat({ apiKey, model, prompt, maxTokens, temperature }) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      top_p: 0.9,
      max_tokens: maxTokens
    })
  });
  const text = await response.text();
  return { response, text };
}

async function requestGeminiContent({ apiKey, model, prompt, maxTokens, temperature }) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        topP: 0.9,
        maxOutputTokens: maxTokens
      }
    })
  });
  const text = await response.text();
  return { response, text };
}

function parseLlmText({ provider, mode, model, text, channelProfile }) {
  const parsed = JSON.parse(text);
  const output = provider === 'gemini'
    ? parsed?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('').trim() || ''
    : parsed?.choices?.[0]?.message?.content?.trim() || '';

  if (mode !== 'briefing') {
    return {
      statusCode: 200,
      body: JSON.stringify({ output, reply: output, model, mode })
    };
  }

  const raw = extractFirstJsonObject(output);
  if (!raw) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'AI briefing response did not contain valid JSON', model, mode, output })
    };
  }

  let briefing;
  try {
    briefing = JSON.parse(raw);
  } catch {
    briefing = recoverPartialBriefing(raw);
  }
  const channelKey = String(channelProfile?.key || '').trim().toLowerCase();
  const fallbackConfidence = (
    briefing?.classification || briefing?.summary || briefing?.nextAction
      ? (/high|qualified|demo|pricing|sales/i.test(`${briefing?.classification || ''} ${briefing?.nextAction || ''}`) ? 0.74 : 0.61)
      : 0
  );
  const confidence = Number(briefing?.confidence);
  const sequenceSuggestion = briefing?.sequenceSuggestion && typeof briefing.sequenceSuggestion === 'object'
    ? briefing.sequenceSuggestion
    : {};
  const inferredLeadScoreLabel = String(briefing?.leadScoreLabel || '').trim()
    || (/demo|qualified|pricing|trial|proposal/i.test(`${briefing?.classification || ''} ${briefing?.nextAction || ''}`)
      ? 'Hot lead'
      : /follow|nurture|review|question/i.test(`${briefing?.classification || ''} ${briefing?.summary || ''}`)
        ? 'Warm lead'
        : 'Needs review');
  const inferredLeadScoreReason = String(briefing?.leadScoreReason || '').trim()
    || String(briefing?.handoffReason || briefing?.summary || 'AI inferred the lead posture from the current thread.').trim();
  const inferredSteps = Array.isArray(sequenceSuggestion?.steps) && sequenceSuggestion.steps.length
    ? sequenceSuggestion.steps
    : channelKey === 'facebook' || /lead/i.test(`${briefing?.classification || ''} ${briefing?.summary || ''}`)
      ? [
          'Confirm the lead inquiry and acknowledge the requested outcome.',
          'Offer one clear booking or callback option with the best contact route.',
          'Follow up quickly if the lead does not respond to the first touch.'
        ]
      : channelKey === 'whatsapp'
        ? [
            'Send a short first-touch follow-up that reflects the latest ask.',
            'Check for a blocker or missing detail in one fast mobile-friendly message.',
            'Escalate or reassign if the customer stays blocked.'
          ]
        : [
            'Send the first follow-up with the clearest next step.',
            'Answer likely objections or missing context in a second touch.',
            'Escalate, assign, or close the loop based on the reply.'
          ];

  return {
    statusCode: 200,
    body: JSON.stringify({
      output: String(briefing?.nextAction || briefing?.summary || '').trim(),
      reply: String(briefing?.replyDraft || '').trim(),
      summary: String(briefing?.summary || '').trim(),
      classification: String(briefing?.classification || '').trim(),
      nextAction: String(briefing?.nextAction || '').trim(),
      confidence: Number.isFinite(confidence) && confidence > 0 ? Math.max(0, Math.min(1, confidence)) : fallbackConfidence,
      suggestedAssignee: String(briefing?.suggestedAssignee || '').trim(),
      followUpTiming: String(briefing?.followUpTiming || '').trim(),
      handoffReason: String(briefing?.handoffReason || '').trim(),
      shouldEscalate: Boolean(briefing?.shouldEscalate),
      leadScoreLabel: inferredLeadScoreLabel,
      leadScoreReason: inferredLeadScoreReason,
      sequenceSuggestion: {
        name: String(sequenceSuggestion?.name || '').trim(),
        channel: String(sequenceSuggestion?.channel || '').trim(),
        goal: String(sequenceSuggestion?.goal || '').trim(),
        trigger: String(sequenceSuggestion?.trigger || '').trim(),
        notes: String(sequenceSuggestion?.notes || '').trim(),
        steps: inferredSteps.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
      },
      model,
      mode
    })
  };
}

export async function createAiAssistResponse(body = {}, runtimeEnv = {}) {
  const hasOpenRouter = Boolean(firstNonEmpty(runtimeEnv.OPENROUTER_API_KEY));
  const hasGemini = Boolean(firstNonEmpty(runtimeEnv.GEMINI_API_KEY));
  const provider = hasOpenRouter ? 'openrouter' : hasGemini ? 'gemini' : '';
  const apiKey = firstNonEmpty(runtimeEnv.OPENROUTER_API_KEY, runtimeEnv.GEMINI_API_KEY);
  const model = hasOpenRouter
    ? firstNonEmpty(runtimeEnv.OPENROUTER_MODEL, 'openai/gpt-4o-mini')
    : firstNonEmpty(runtimeEnv.GEMINI_MODEL, 'gemini-2.5-flash');

  if (!apiKey || !provider) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'AI provider is not configured' })
    };
  }

  const conversation = body.conversation || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const mode = firstNonEmpty(body.mode, 'reply');
  const channelProfile = getConversationChannelProfile(conversation);
  const sharedContext = body.workspaceContext || buildAiWorkspaceContext({
    workspaceName: body.workspaceName || 'AuraFlow Workspace',
    snapshot: body.workspaceSnapshot || {},
    conversation,
    messages,
    mode,
    persona: body.workspacePersona || body.persona || {},
    workspaceKnowledge: body.workspaceKnowledge || body.workspaceSnapshot?.workspaceKnowledge || body.workspaceSnapshot?.workspace_knowledge || []
  });
  const prompt = buildModePrompts({ mode, channelProfile, sharedContext }) || buildModePrompts({ mode: 'reply', channelProfile, sharedContext });
  const maxTokens = mode === 'briefing' ? 900 : 320;
  const temperature = mode === 'briefing' ? 0.25 : 0.45;

  const result = provider === 'openrouter'
    ? await requestOpenRouterChat({ apiKey, model, prompt, maxTokens, temperature })
    : await requestGeminiContent({ apiKey, model, prompt, maxTokens, temperature });

  if (!result.response.ok) {
    return {
      statusCode: result.response.status,
      body: result.text || JSON.stringify({ error: `${provider} request failed` })
    };
  }

  try {
    return parseLlmText({ provider, mode, model, text: result.text, channelProfile });
  } catch {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `${provider} response parsing failed` })
    };
  }
}
